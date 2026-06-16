import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

function computeHealth(marginPercent: number, target: number): string {
  if (marginPercent >= target) return 'saudavel';
  if (marginPercent >= target - 10) return 'atencao';
  return 'critico';
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const { rows: clients } = await pool.query<{
      id: number; name: string; monthly_fee: number; margin_target: number;
      active: boolean; start_date: string | null; notes: string | null;
      created_at: string; updated_at: string;
    }>('SELECT * FROM agency_clients ORDER BY name');

    const result = await Promise.all(clients.map(async (c) => {
      const { rows: [costRow] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM client_costs
         WHERE client_id = $1 AND (month = $2 OR month IS NULL) AND (year = $3 OR year IS NULL)`,
        [c.id, month, year]
      );

      const monthly_cost = Number(costRow.total);
      const monthly_fee = Number(c.monthly_fee);
      const margin = monthly_fee - monthly_cost;
      const margin_percent = monthly_fee > 0 ? (margin / monthly_fee) * 100 : 0;
      const health = computeHealth(margin_percent, Number(c.margin_target));

      return { ...c, monthly_cost, margin, margin_percent, health };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [client] } = await pool.query<{
      id: number; name: string; monthly_fee: number; margin_target: number;
      active: boolean; start_date: string | null; notes: string | null;
      created_at: string; updated_at: string;
    }>('SELECT * FROM agency_clients WHERE id = $1', [req.params.id]);

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const { rows: costs } = await pool.query(
      'SELECT * FROM client_costs WHERE client_id = $1 ORDER BY created_at DESC',
      [client.id]
    );
    const totalCost = (costs as { amount: number }[]).reduce((sum, c) => sum + Number(c.amount), 0);
    const monthly_fee = Number(client.monthly_fee);
    const margin = monthly_fee - totalCost;
    const margin_percent = monthly_fee > 0 ? (margin / monthly_fee) * 100 : 0;
    const health = computeHealth(margin_percent, Number(client.margin_target));

    res.json({ ...client, costs, monthly_cost: totalCost, margin, margin_percent, health });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, monthly_fee, margin_target, active, start_date, notes, service_type, churn_date, churn_reason, churn_notes, reactivation_potential } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const isActive = active !== undefined ? (active ? 1 : 0) : 1;
    const { rows: [created] } = await pool.query(
      `INSERT INTO agency_clients (name, monthly_fee, margin_target, active, start_date, notes, service_type, churn_date, churn_reason, churn_notes, reactivation_potential)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [name, monthly_fee || 0, margin_target || 30, isActive, start_date || null, notes || null, service_type || null, churn_date || null, churn_reason || null, churn_notes || null, reactivation_potential || 'nao']
    );

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, monthly_fee, margin_target, active, start_date, notes, service_type } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM agency_clients WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    await pool.query(
      `UPDATE agency_clients SET name = $1, monthly_fee = $2, margin_target = $3, active = $4,
        start_date = $5, notes = $6, service_type = $7, updated_at = NOW()
       WHERE id = $8`,
      [name, monthly_fee || 0, margin_target || 30, active !== undefined ? (active ? 1 : 0) : 1, start_date || null, notes || null, service_type || null, req.params.id]
    );

    const { rows: [updated] } = await pool.query('SELECT * FROM agency_clients WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM agency_clients WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    await pool.query('DELETE FROM agency_clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

router.get('/:id/costs', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM client_costs WHERE client_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar custos' });
  }
});

router.post('/:id/costs', async (req: Request, res: Response) => {
  try {
    const { description, amount, type, month, year } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Campos obrigatórios: description, amount' });

    const { rows: [created] } = await pool.query(
      `INSERT INTO client_costs (client_id, description, amount, type, month, year)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.params.id, description, amount, type || 'fixo', month || null, year || null]
    );

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar custo' });
  }
});

router.delete('/:id/costs/:costId', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM client_costs WHERE id = $1 AND client_id = $2', [req.params.costId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar custo' });
  }
});

// Plan history
router.get('/:id/plan-history', async (req: Request, res: Response) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_plan_history (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
        old_fee NUMERIC(10,2) NOT NULL,
        new_fee NUMERIC(10,2) NOT NULL,
        change_type VARCHAR(20) DEFAULT 'ajuste',
        notes TEXT,
        changed_at DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const { rows } = await pool.query(
      'SELECT * FROM client_plan_history WHERE client_id = $1 ORDER BY changed_at DESC, created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar histórico de plano' });
  }
});

router.post('/:id/plan-change', async (req: Request, res: Response) => {
  const { new_fee, change_type, notes, changed_at } = req.body;
  if (!new_fee || isNaN(Number(new_fee))) {
    return res.status(400).json({ error: 'new_fee obrigatório' });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Ensure table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_plan_history (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
        old_fee NUMERIC(10,2) NOT NULL,
        new_fee NUMERIC(10,2) NOT NULL,
        change_type VARCHAR(20) DEFAULT 'ajuste',
        notes TEXT,
        changed_at DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const { rows: [client] } = await db.query('SELECT monthly_fee FROM agency_clients WHERE id = $1', [req.params.id]);
    if (!client) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Cliente não encontrado' }); }

    const old_fee = Number(client.monthly_fee);
    await db.query(
      `INSERT INTO client_plan_history (client_id, old_fee, new_fee, change_type, notes, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, old_fee, Number(new_fee), change_type || 'ajuste', notes || null, changed_at || new Date().toISOString().slice(0, 10)]
    );
    await db.query('UPDATE agency_clients SET monthly_fee = $1, updated_at = NOW() WHERE id = $2', [Number(new_fee), req.params.id]);
    await db.query('COMMIT');
    res.status(201).json({ success: true, old_fee, new_fee: Number(new_fee) });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar mudança de plano' });
  } finally {
    db.release();
  }
});

export default router;
