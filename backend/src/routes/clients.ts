import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

function computeHealth(marginPercent: number, target: number): string {
  if (marginPercent >= target) return 'saudavel';
  if (marginPercent >= target - 10) return 'atencao';
  return 'critico';
}

router.get('/', (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const clients = db.prepare('SELECT * FROM agency_clients ORDER BY name').all() as {
      id: number; name: string; monthly_fee: number; margin_target: number;
      active: number; start_date: string | null; notes: string | null;
      created_at: string; updated_at: string;
    }[];

    const result = clients.map((c) => {
      const costRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM client_costs
        WHERE client_id = ? AND (month = ? OR month IS NULL) AND (year = ? OR year IS NULL)
      `).get(c.id, month, year) as { total: number };

      const monthly_cost = costRow.total;
      const margin = c.monthly_fee - monthly_cost;
      const margin_percent = c.monthly_fee > 0 ? (margin / c.monthly_fee) * 100 : 0;
      const health = computeHealth(margin_percent, c.margin_target);

      return { ...c, monthly_cost, margin, margin_percent, health };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const client = db.prepare('SELECT * FROM agency_clients WHERE id = ?').get(req.params.id) as {
      id: number; name: string; monthly_fee: number; margin_target: number;
      active: number; start_date: string | null; notes: string | null;
      created_at: string; updated_at: string;
    } | undefined;

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const costs = db.prepare('SELECT * FROM client_costs WHERE client_id = ? ORDER BY created_at DESC').all(client.id);
    const totalCost = (costs as { amount: number }[]).reduce((sum, c) => sum + c.amount, 0);
    const margin = client.monthly_fee - totalCost;
    const margin_percent = client.monthly_fee > 0 ? (margin / client.monthly_fee) * 100 : 0;
    const health = computeHealth(margin_percent, client.margin_target);

    res.json({ ...client, costs, monthly_cost: totalCost, margin, margin_percent, health });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, monthly_fee, margin_target, active, start_date, notes, service_type, churn_date, churn_reason, churn_notes, reactivation_potential } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const isActive = active !== undefined ? (active ? 1 : 0) : 1;
    const result = db.prepare(`
      INSERT INTO agency_clients (name, monthly_fee, margin_target, active, start_date, notes, service_type, churn_date, churn_reason, churn_notes, reactivation_potential)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, monthly_fee || 0, margin_target || 30, isActive, start_date || null, notes || null, service_type || null, churn_date || null, churn_reason || null, churn_notes || null, reactivation_potential || 'nao');

    res.status(201).json(db.prepare('SELECT * FROM agency_clients WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, monthly_fee, margin_target, active, start_date, notes, service_type } = req.body;
    const existing = db.prepare('SELECT id FROM agency_clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    db.prepare(`
      UPDATE agency_clients SET name = ?, monthly_fee = ?, margin_target = ?, active = ?,
        start_date = ?, notes = ?, service_type = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, monthly_fee || 0, margin_target || 30, active !== undefined ? (active ? 1 : 0) : 1, start_date || null, notes || null, service_type || null, req.params.id);

    res.json(db.prepare('SELECT * FROM agency_clients WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM agency_clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    db.prepare('DELETE FROM agency_clients WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

router.get('/:id/costs', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM client_costs WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar custos' });
  }
});

router.post('/:id/costs', (req: Request, res: Response) => {
  try {
    const { description, amount, type, month, year } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Campos obrigatórios: description, amount' });

    const result = db.prepare(`
      INSERT INTO client_costs (client_id, description, amount, type, month, year)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.id, description, amount, type || 'fixo', month || null, year || null);

    res.status(201).json(db.prepare('SELECT * FROM client_costs WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar custo' });
  }
});

router.delete('/:id/costs/:costId', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM client_costs WHERE id = ? AND client_id = ?').run(req.params.costId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar custo' });
  }
});

export default router;
