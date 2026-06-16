import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year  as string) || now.getFullYear();

    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate   = `${year}-${monthStr}-31`;

    // 6-month window for trend
    const trendStart = new Date(year, month - 7, 1);
    const trendStartStr = `${trendStart.getFullYear()}-${String(trendStart.getMonth() + 1).padStart(2, '0')}-01`;

    // Run all queries in parallel
    const [
      revenueResult,
      expenseResult,
      trendRevResult,
      trendExpResult,
      revByCatResult,
      expByCatResult,
      topClientsResult,
      oppResult,
      goalResult,
      overdueRevResult,
      overdueExpResult,
    ] = await Promise.all([
      // Current month totals
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

      // Monthly trend — single query each (last 6 months)
      query<{ month: string; total: string }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', date::date), 'MM/YYYY') as month,
                COALESCE(SUM(amount), 0) as total
         FROM financial_revenues
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado'
         GROUP BY DATE_TRUNC('month', date::date)
         ORDER BY DATE_TRUNC('month', date::date)`,
        [trendStartStr, endDate]
      ),
      query<{ month: string; total: string }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', date::date), 'MM/YYYY') as month,
                COALESCE(SUM(amount), 0) as total
         FROM financial_expenses
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado'
         GROUP BY DATE_TRUNC('month', date::date)
         ORDER BY DATE_TRUNC('month', date::date)`,
        [trendStartStr, endDate]
      ),

      // By category
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

      // Top clients
      query(
        `SELECT client_name, COALESCE(SUM(amount), 0) as total
         FROM financial_revenues
         WHERE date >= $1 AND date <= $2 AND status != 'cancelado' AND client_name IS NOT NULL
         GROUP BY client_name ORDER BY total DESC LIMIT 5`,
        [startDate, endDate]
      ),

      // Opportunities
      query(
        `SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value,
                COALESCE(SUM(value * probability / 100.0), 0) as weighted_value
         FROM opportunities WHERE stage NOT IN ('fechado', 'perdido') GROUP BY stage`
      ),

      // Goal
      query<{ target_revenue: string; target_new_clients: string; target_recurring: string }>(
        'SELECT * FROM sales_goals WHERE month = $1 AND year = $2',
        [month, year]
      ),

      // Overdue
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM financial_revenues
         WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < CURRENT_DATE)`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM financial_expenses
         WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < CURRENT_DATE)`
      ),
    ]);

    const totalRevenue  = Number(revenueResult.rows[0].total);
    const totalExpenses = Number(expenseResult.rows[0].total);
    const netProfit     = totalRevenue - totalExpenses;
    const profitMargin  = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Build 6-month trend array filling in missing months with 0
    const revByMonth: Record<string, number> = {};
    const expByMonth: Record<string, number> = {};
    trendRevResult.rows.forEach(r => { revByMonth[r.month] = Number(r.total); });
    trendExpResult.rows.forEach(r => { expByMonth[r.month] = Number(r.total); });

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      const key = `${m}/${y}`;
      const rev = revByMonth[key] || 0;
      const exp = expByMonth[key] || 0;
      monthlyTrend.push({
        month: key,
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        revenue: rev,
        expenses: exp,
        profit: rev - exp,
      });
    }

    const goal = goalResult.rows[0] || null;
    const goalProgress = goal ? {
      target_revenue: Number(goal.target_revenue),
      actual_revenue: totalRevenue,
      progress_percent: Number(goal.target_revenue) > 0 ? (totalRevenue / Number(goal.target_revenue)) * 100 : 0,
    } : null;

    res.json({
      summary: { total_revenue: totalRevenue, total_expenses: totalExpenses, net_profit: netProfit, profit_margin: profitMargin },
      monthly_trend: monthlyTrend,
      revenue_by_category: revByCatResult.rows,
      expense_by_category: expByCatResult.rows,
      top_clients: topClientsResult.rows,
      opportunities_summary: oppResult.rows,
      goal_progress: goalProgress,
      overdue: { revenues: Number(overdueRevResult.rows[0].count), expenses: Number(overdueExpResult.rows[0].count) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;
