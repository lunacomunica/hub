import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    let query = 'SELECT * FROM sales_goals WHERE 1=1';
    const params: number[] = [];
    if (month) { query += ' AND month = ?'; params.push(Number(month)); }
    if (year) { query += ' AND year = ?'; params.push(Number(year)); }
    query += ' ORDER BY year DESC, month DESC';
    res.json(db.prepare(query).all(...params));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar metas' });
  }
});

router.get('/:month/:year', (req: Request, res: Response) => {
  try {
    const month = Number(req.params.month);
    const year = Number(req.params.year);

    const goal = db.prepare('SELECT * FROM sales_goals WHERE month = ? AND year = ?').get(month, year) as {
      id: number; month: number; year: number;
      target_revenue: number; target_new_clients: number; target_recurring: number;
      notes: string | null;
    } | undefined;

    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    const actualRevenue = (db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM financial_revenues
      WHERE date >= ? AND date <= ? AND status != 'cancelado'
    `).get(startDate, endDate) as { total: number }).total;

    const actualNewClients = (db.prepare(`
      SELECT COUNT(*) as count FROM agency_clients
      WHERE start_date >= ? AND start_date <= ?
    `).get(startDate, endDate) as { count: number }).count;

    // Goal items with product info + actual closed opportunities per product
    const items = goal ? (db.prepare(`
      SELECT
        sgi.id, sgi.goal_id, sgi.product_id, sgi.quantity, sgi.unit_price,
        p.name as product_name, p.category as product_category,
        (sgi.quantity * sgi.unit_price) as target_revenue,
        COALESCE((
          SELECT COUNT(*) FROM opportunities o
          WHERE o.product_id = sgi.product_id
            AND o.stage = 'fechado'
            AND o.closed_at >= ? AND o.closed_at <= ?
        ), 0) as actual_count,
        COALESCE((
          SELECT SUM(o.value) FROM opportunities o
          WHERE o.product_id = sgi.product_id
            AND o.stage = 'fechado'
            AND o.closed_at >= ? AND o.closed_at <= ?
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
      WHERE sgi.goal_id = ?
      ORDER BY p.name
    `).all(startDate, endDate, startDate, endDate, goal.id) as {
      id: number; goal_id: number; product_id: number; quantity: number;
      unit_price: number; product_name: string; product_category: string | null;
      target_revenue: number; actual_count: number; actual_revenue: number;
      pipeline_count: number; pipeline_value: number;
    }[]) : [];

    // Also count closed opps without product_id (unlinked) toward total
    const unlinkedClosed = (db.prepare(`
      SELECT COALESCE(SUM(value), 0) as total FROM opportunities
      WHERE stage = 'fechado' AND product_id IS NULL
        AND closed_at >= ? AND closed_at <= ?
    `).get(startDate, endDate) as { total: number }).total;

    const total_target = items.reduce((s, i) => s + i.target_revenue, 0);
    const total_actual_from_opps = items.reduce((s, i) => s + i.actual_revenue, 0) + unlinkedClosed;

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

router.post('/', (req: Request, res: Response) => {
  try {
    const { month, year, target_new_clients, notes, items } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month e year são obrigatórios' });

    // target_revenue is auto-calculated from items
    const target_revenue = Array.isArray(items)
      ? items.reduce((s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity * i.unit_price), 0)
      : 0;

    const existing = db.prepare('SELECT id FROM sales_goals WHERE month = ? AND year = ?').get(month, year) as { id: number } | undefined;

    let goalId: number;
    if (existing) {
      db.prepare(`
        UPDATE sales_goals SET target_revenue = ?, target_new_clients = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(target_revenue, target_new_clients || 0, notes || null, existing.id);
      goalId = existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO sales_goals (month, year, target_revenue, target_new_clients, target_recurring, notes)
        VALUES (?, ?, ?, ?, 0, ?)
      `).run(month, year, target_revenue, target_new_clients || 0, notes || null);
      goalId = result.lastInsertRowid as number;
    }

    // Replace items
    if (Array.isArray(items)) {
      db.prepare('DELETE FROM sales_goal_items WHERE goal_id = ?').run(goalId);
      const insertItem = db.prepare(`
        INSERT INTO sales_goal_items (goal_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)
      `);
      for (const item of items as { product_id: number; quantity: number; unit_price: number }[]) {
        if (item.product_id && item.quantity > 0) {
          insertItem.run(goalId, item.product_id, item.quantity, item.unit_price);
        }
      }
    }

    res.status(201).json(db.prepare('SELECT * FROM sales_goals WHERE id = ?').get(goalId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar meta' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM sales_goals WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar meta' });
  }
});

export default router;
