import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year  as string) || now.getFullYear();

    const monthStr  = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate   = `${year}-${monthStr}-31`;

    // 6-month window for trend (YYYY-MM string comparison works on TEXT dates)
    const trendMonths: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      trendMonths.push({
        key: `${y}-${m}`,   // YYYY-MM prefix for TEXT comparison
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
      });
    }
    const trendStart = trendMonths[0].key + '-01';
    const trendEnd   = trendMonths[trendMonths.length - 1].key + '-31';

    // Run all queries in parallel; allSettled so one failure doesn't kill everything
    const [
      revenueR, expenseR,
      trendRevR, trendExpR,
      revByCatR, expByCatR,
      topClientsR, oppR, goalR,
      overdueRevR, overdueExpR,
    ] = await Promise.allSettled([
      query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM financial_revenues
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
        [startDate, endDate]
      ),
      query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM financial_expenses
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
        [startDate, endDate]
      ),
      // Trend: group by YYYY-MM prefix (TEXT column, no casting needed)
      query<{ month_key: string; total: string }>(
        `SELECT SUBSTRING(date, 1, 7) as month_key, COALESCE(SUM(amount), 0) as total
         FROM financial_revenues
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado'
         GROUP BY SUBSTRING(date, 1, 7) ORDER BY month_key`,
        [trendStart, trendEnd]
      ),
      query<{ month_key: string; total: string }>(
        `SELECT SUBSTRING(date, 1, 7) as month_key, COALESCE(SUM(amount), 0) as total
         FROM financial_expenses
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado'
         GROUP BY SUBSTRING(date, 1, 7) ORDER BY month_key`,
        [trendStart, trendEnd]
      ),
      query(
        `SELECT fc.name, fc.color, COALESCE(SUM(fr.amount), 0) as total
         FROM financial_revenues fr
         LEFT JOIN financial_categories fc ON fr.category_id = fc.id
         WHERE fr.date >= $1 AND fr.date <= $2 AND fr.status != 'cancelado'
         GROUP BY fc.id, fc.name, fc.color ORDER BY total DESC`,
        [startDate, endDate]
      ),
      query(
        `SELECT fc.name, fc.color, COALESCE(SUM(fe.amount), 0) as total
         FROM financial_expenses fe
         LEFT JOIN financial_categories fc ON fe.category_id = fc.id
         WHERE fe.date >= $1 AND fe.date <= $2 AND fe.status != 'cancelado'
         GROUP BY fc.id, fc.name, fc.color ORDER BY total DESC`,
        [startDate, endDate]
      ),
      query(
        `SELECT client_name, COALESCE(SUM(amount), 0) as total
         FROM financial_revenues
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado' AND client_name IS NOT NULL
         GROUP BY client_name ORDER BY total DESC LIMIT 5`,
        [startDate, endDate]
      ),
      query(
        `SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value,
                COALESCE(SUM(value * probability / 100.0), 0) as weighted_value
         FROM opportunities WHERE stage NOT IN ('fechado', 'perdido') GROUP BY stage`
      ),
      query<{ target_revenue: string }>(
        'SELECT * FROM sales_goals WHERE month = $1 AND year = $2',
        [month, year]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM financial_revenues
         WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < CURRENT_DATE AND due_date != '')`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM financial_expenses
         WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < CURRENT_DATE AND due_date != '')`
      ),
    ]);

    // Helper to safely extract rows
    const rows = <T>(r: PromiseSettledResult<{ rows: T[] }>, fallback: T[] = []): T[] =>
      r.status === 'fulfilled' ? r.value.rows : (console.error('Dashboard query failed:', r.reason), fallback);
    const row0 = <T>(r: PromiseSettledResult<{ rows: T[] }>, fallback: T): T =>
      r.status === 'fulfilled' && r.value.rows[0] ? r.value.rows[0] : fallback;

    const totalRevenue  = Number(row0(revenueR, { total: '0' }).total);
    const totalExpenses = Number(row0(expenseR, { total: '0' }).total);
    const netProfit     = totalRevenue - totalExpenses;
    const profitMargin  = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Build trend from grouped results
    const revByKey: Record<string, number> = {};
    const expByKey: Record<string, number> = {};
    rows(trendRevR).forEach((r: { month_key: string; total: string }) => { revByKey[r.month_key] = Number(r.total); });
    rows(trendExpR).forEach((r: { month_key: string; total: string }) => { expByKey[r.month_key] = Number(r.total); });

    const monthlyTrend = trendMonths.map(({ key, label }) => {
      const rev = revByKey[key] || 0;
      const exp = expByKey[key] || 0;
      const [y, m] = key.split('-');
      return { month: `${m}/${y}`, label, revenue: rev, expenses: exp, profit: rev - exp };
    });

    const goalRow = row0(goalR, null as { target_revenue: string } | null);
    const goalProgress = goalRow ? {
      target_revenue: Number(goalRow.target_revenue),
      actual_revenue: totalRevenue,
      progress_percent: Number(goalRow.target_revenue) > 0 ? (totalRevenue / Number(goalRow.target_revenue)) * 100 : 0,
    } : null;

    res.json({
      summary: { total_revenue: totalRevenue, total_expenses: totalExpenses, net_profit: netProfit, profit_margin: profitMargin },
      monthly_trend: monthlyTrend,
      revenue_by_category: rows(revByCatR),
      expense_by_category: rows(expByCatR),
      top_clients: rows(topClientsR),
      opportunities_summary: rows(oppR),
      goal_progress: goalProgress,
      overdue: {
        revenues: Number(row0(overdueRevR, { count: '0' }).count),
        expenses: Number(row0(overdueExpR, { count: '0' }).count),
      },
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;
