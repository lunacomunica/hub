import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    let query = 'SELECT * FROM sales_goals WHERE 1=1';
    const params: number[] = [];
    let paramIdx = 1;
    if (month) { query += ` AND month = $${paramIdx++}`; params.push(Number(month)); }
    if (year) { query += ` AND year = $${paramIdx++}`; params.push(Number(year)); }
    query += ' ORDER BY year DESC, month DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar metas' });
  }
});

router.get('/:month/:year', async (req: Request, res: Response) => {
  try {
    const month = Number(req.params.month);
    const year = Number(req.params.year);

    const { rows: [goal] } = await pool.query<{
      id: number; month: number; year: number;
      target_revenue: number; target_new_clients: number; target_recurring: number;
      notes: string | null;
    }>('SELECT * FROM sales_goals WHERE month = $1 AND year = $2', [month, year]);

    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    const { rows: [revenueRow] } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM financial_revenues
       WHERE date >= $1 AND date <= $2 AND status != 'cancelado'`,
      [startDate, endDate]
    );
    const actualRevenue = Number(revenueRow.total);

    const { rows: [clientsRow] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM agency_clients
       WHERE start_date >= $1 AND start_date <= $2`,
      [startDate, endDate]
    );
    const actualNewClients = Number(clientsRow.count);

    // Goal items with product info + actual closed opportunities per product
    const items = goal ? (await pool.query(
      `SELECT
         sgi.id, sgi.goal_id, sgi.product_id, sgi.quantity, sgi.unit_price,
         p.name as product_name, p.category as product_category,
         (sgi.quantity * sgi.unit_price) as target_revenue,
         COALESCE((
           SELECT COUNT(*) FROM opportunities o
           WHERE o.product_id = sgi.product_id
             AND o.stage = 'fechado'
             AND o.closed_at >= $1 AND o.closed_at <= $2
         ), 0) as actual_count,
         COALESCE((
           SELECT SUM(o.value) FROM opportunities o
           WHERE o.product_id = sgi.product_id
             AND o.stage = 'fechado'
             AND o.closed_at >= $3 AND o.closed_at <= $4
         ), 0) as actual_revenue,
         COALESCE((
           SELECT COUNT(*) FROM opportunities o
           WHERE o.product_id = sgi.product_id
             AND o.stage NOT IN ('fechado', 'perdido')
         ), 0) as pipeline_count,
         COALESCE((
           SELECT SUM(o.value) FROM opportunities o
           WHERE o.product_id = sgi.product_id
             AND o.stage NOT IN ('fechado', 'perdido')
         ), 0) as pipeline_value
       FROM sales_goal_items sgi
       JOIN products p ON p.id = sgi.product_id
       WHERE sgi.goal_id = $5
       ORDER BY p.name`,
      [startDate, endDate, startDate, endDate, goal.id]
    )).rows : [];

    // Also count closed opps without product_id (unlinked) toward total
    const { rows: [unlinkedRow] } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(value), 0) as total FROM opportunities
       WHERE stage = 'fechado' AND product_id IS NULL
         AND closed_at >= $1 AND closed_at <= $2`,
      [startDate, endDate]
    );
    const unlinkedClosed = Number(unlinkedRow.total);

    const total_target = items.reduce((s: number, i: any) => s + Number(i.target_revenue), 0);
    const total_actual_from_opps = items.reduce((s: number, i: any) => s + Number(i.actual_revenue), 0) + unlinkedClosed;

    res.json({
      goal: goal || null,
      items,
      actual_revenue: actualRevenue,
      actual_new_clients: actualNewClients,
      total_target,
      total_actual_from_opps,
      unlinked_closed: unlinkedClosed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar meta' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { month, year, target_new_clients, notes, items } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month e year são obrigatórios' });

    // target_revenue is auto-calculated from items
    const target_revenue = Array.isArray(items)
      ? items.reduce((s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity * i.unit_price), 0)
      : 0;

    const { rows: [existing] } = await pool.query<{ id: number }>(
      'SELECT id FROM sales_goals WHERE month = $1 AND year = $2',
      [month, year]
    );

    let goalId: number;
    if (existing) {
      await pool.query(
        `UPDATE sales_goals SET target_revenue = $1, target_new_clients = $2, notes = $3, updated_at = NOW()
         WHERE id = $4`,
        [target_revenue, target_new_clients || 0, notes || null, existing.id]
      );
      goalId = existing.id;
    } else {
      const { rows: [created] } = await pool.query<{ id: number }>(
        `INSERT INTO sales_goals (month, year, target_revenue, target_new_clients, target_recurring, notes)
         VALUES ($1, $2, $3, $4, 0, $5)
         RETURNING id`,
        [month, year, target_revenue, target_new_clients || 0, notes || null]
      );
      goalId = created.id;
    }

    // Replace items
    if (Array.isArray(items)) {
      await pool.query('DELETE FROM sales_goal_items WHERE goal_id = $1', [goalId]);
      for (const item of items as { product_id: number; quantity: number; unit_price: number }[]) {
        if (item.product_id && item.quantity > 0) {
          await pool.query(
            'INSERT INTO sales_goal_items (goal_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
            [goalId, item.product_id, item.quantity, item.unit_price]
          );
        }
      }
    }

    const { rows: [result] } = await pool.query('SELECT * FROM sales_goals WHERE id = $1', [goalId]);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar meta' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM sales_goals WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar meta' });
  }
});

export default router;
