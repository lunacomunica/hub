import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    // Summary for current month
    const revenueRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM financial_revenues
      WHERE date >= ? AND date <= ? AND status != 'cancelado'
    `).get(startDate, endDate) as { total: number };

    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM financial_expenses
      WHERE date >= ? AND date <= ? AND status != 'cancelado'
    `).get(startDate, endDate) as { total: number };

    const totalRevenue = revenueRow.total;
    const totalExpenses = expenseRow.total;
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

      const rev = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM financial_revenues WHERE date >= ? AND date <= ? AND status != 'cancelado'`).get(s, e) as { total: number }).total;
      const exp = (db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM financial_expenses WHERE date >= ? AND date <= ? AND status != 'cancelado'`).get(s, e) as { total: number }).total;

      monthlyTrend.push({
        month: `${m}/${y}`,
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        revenue: rev,
        expenses: exp,
        profit: rev - exp,
      });
    }

    // Revenue by category this month
    const revenueByCategory = db.prepare(`
      SELECT fc.name, fc.color, COALESCE(SUM(fr.amount), 0) as total
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      WHERE fr.date >= ? AND fr.date <= ? AND fr.status != 'cancelado'
      GROUP BY fc.id, fc.name, fc.color
      ORDER BY total DESC
    `).all(startDate, endDate);

    // Expense by category this month
    const expenseByCategory = db.prepare(`
      SELECT fc.name, fc.color, COALESCE(SUM(fe.amount), 0) as total
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.date >= ? AND fe.date <= ? AND fe.status != 'cancelado'
      GROUP BY fc.id, fc.name, fc.color
      ORDER BY total DESC
    `).all(startDate, endDate);

    // Top 5 clients by revenue this month
    const topClients = db.prepare(`
      SELECT client_name, COALESCE(SUM(amount), 0) as total
      FROM financial_revenues
      WHERE date >= ? AND date <= ? AND status != 'cancelado' AND client_name IS NOT NULL
      GROUP BY client_name
      ORDER BY total DESC
      LIMIT 5
    `).all(startDate, endDate);

    // Opportunities summary by stage
    const opportunitiesSummary = db.prepare(`
      SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value,
             COALESCE(SUM(value * probability / 100.0), 0) as weighted_value
      FROM opportunities
      WHERE stage NOT IN ('fechado', 'perdido')
      GROUP BY stage
    `).all();

    // Goal progress
    const goal = db.prepare(`
      SELECT * FROM sales_goals WHERE month = ? AND year = ?
    `).get(month, year) as { target_revenue: number; target_new_clients: number; target_recurring: number } | undefined;

    const goalProgress = goal ? {
      target_revenue: goal.target_revenue,
      actual_revenue: totalRevenue,
      progress_percent: goal.target_revenue > 0 ? (totalRevenue / goal.target_revenue) * 100 : 0,
    } : null;

    // Overdue counts
    const overdueRevenues = (db.prepare(`
      SELECT COUNT(*) as count FROM financial_revenues
      WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < date('now'))
    `).get() as { count: number }).count;

    const overdueExpenses = (db.prepare(`
      SELECT COUNT(*) as count FROM financial_expenses
      WHERE status = 'atrasado' OR (status = 'pendente' AND due_date < date('now'))
    `).get() as { count: number }).count;

    res.json({
      summary: { total_revenue: totalRevenue, total_expenses: totalExpenses, net_profit: netProfit, profit_margin: profitMargin },
      monthly_trend: monthlyTrend,
      revenue_by_category: revenueByCategory,
      expense_by_category: expenseByCategory,
      top_clients: topClients,
      opportunities_summary: opportunitiesSummary,
      goal_progress: goalProgress,
      overdue: { revenues: overdueRevenues, expenses: overdueExpenses },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;
