import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    // Summary for current month
    const { rows: [revenueRow] } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM financial_revenues
       WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
      [startDate, endDate]
    );

    const { rows: [expenseRow] } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM financial_expenses
       WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
      [startDate, endDate]
    );

    const totalRevenue = Number(revenueRow.total);
    const totalExpenses = Number(expenseRow.total);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Monthly trend: last 6 months
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      const s = `${y}-${m}-01`;
      const e = `${y}-${m}-31`;

      const { rows: [revRow] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM financial_revenues WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
        [s, e]
      );
      const { rows: [expRow] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM financial_expenses WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
        [s, e]
      );

      const rev = Number(revRow.total);
      const exp = Number(expRow.total);

      monthlyTrend.push({
        month: `${m}/${y}`,
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        revenue: rev,
        expenses: exp,
        profit: rev - exp,
      });
    }

    // Revenue by category this month
    const { rows: revenueByCategory } = await pool.query(
      `SELECT fc.name, fc.color, COALESCE(SUM(fr.amount), 0) as total
       FROM financial_revenues fr
       LEFT JOIN financial_categories fc ON fr.category_id = fc.id
       WHERE fr.date >= $1 AND fr.date <= $2 AND fr.status != 'cancelado'
       GROUP BY fc.id, fc.name, fc.color
       ORDER BY total DESC`,
      [startDate, endDate]
    );

    // Expense by category this month
    const { rows: expenseByCategory } = await pool.query(
      `SELECT fc.name, fc.color, COALESCE(SUM(fe.amount), 0) as total
       FROM financial_expenses fe
       LEFT JOIN financial_categories fc ON fe.category_id = fc.id
       WHERE fe.date >= $1 AND fe.date <= $2 AND fe.status != 'cancelado'
       GROUP BY fc.id, fc.name, fc.color
       ORDER BY total DESC`,
      [startDate, endDate]
    );

    // Top 5 clients by revenue this month
    const { rows: topClients } = await pool.query(
      `SELECT client_name, COALESCE(SUM(amount), 0) as total
       FROM financial_revenues
       WHERE date >= $1 AND date <= $2 AND status != 'cancelado' AND client_name IS NOT NULL
       GROUP BY client_name
       ORDER BY total DESC
       LIMIT 5`,
      [startDate, endDate]
    );

    // Opportunities summary by stage
    const { rows: opportunitiesSummary } = await pool.query(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value,
              COALESCE(SUM(value * probability / 100.0), 0) as weighted_value
       FROM opportunities
       WHERE stage NOT IN ('fechado', 'perdido')
       GROUP BY stage`
    );

    // Goal progress
    const { rows: [goal] } = await pool.query<{ target_revenue: number; target_new_clients: number; target_recurring: number }>(
      'SELECT * FROM sales_goals WHERE month = $1 AND year = $2',
      [month, year]
    );

    const goalProgress = goal ? {
      target_revenue: Number(goal.target_revenue),
      actual_revenue: totalRevenue,
      progress_percent: Number(goal.target_revenue) > 0 ? (totalRevenue / Number(goal.target_revenue)) * 100 : 0,
    } : null;

    // Overdue counts
    const { rows: [overdueRevRow] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM financial_revenues
       WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < CURRENT_DATE)`
    );

    const { rows: [overdueExpRow] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM financial_expenses
       WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < CURRENT_DATE)`
    );

    res.json({
      summary: { total_revenue: totalRevenue, total_expenses: totalExpenses, net_profit: netProfit, profit_margin: profitMargin },
      monthly_trend: monthlyTrend,
      revenue_by_category: revenueByCategory,
      expense_by_category: expenseByCategory,
      top_clients: topClients,
      opportunities_summary: opportunitiesSummary,
      goal_progress: goalProgress,
      overdue: { revenues: Number(overdueRevRow.count), expenses: Number(overdueExpRow.count) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;
