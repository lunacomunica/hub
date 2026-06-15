import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    let query = 'SELECT * FROM financial_scenarios WHERE 1=1';
    const params: number[] = [];
    if (month) { query += ' AND month = ?'; params.push(Number(month)); }
    if (year) { query += ' AND year = ?'; params.push(Number(year)); }
    query += ' ORDER BY year DESC, month DESC, type';

    const scenarios = db.prepare(query).all(...params);

    // If month+year provided, include actual data
    let actual = null;
    if (month && year) {
      const m = String(month).padStart(2, '0');
      const startDate = `${year}-${m}-01`;
      const endDate = `${year}-${m}-31`;

      const actualRevenue = (db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM financial_revenues WHERE date >= ? AND date <= ? AND status != 'cancelado'`).get(startDate, endDate) as { total: number }).total;
      const actualExpenses = (db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM financial_expenses WHERE date >= ? AND date <= ? AND status != 'cancelado'`).get(startDate, endDate) as { total: number }).total;

      actual = {
        revenue: actualRevenue,
        expenses: actualExpenses,
        profit: actualRevenue - actualExpenses,
      };
    }

    res.json({ scenarios, actual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cenários' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM financial_scenarios WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cenário não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cenário' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, month, year, type, revenue_projection, expense_projection, new_clients, churn_clients, avg_ticket, notes } = req.body;
    if (!name || !month || !year) return res.status(400).json({ error: 'Campos obrigatórios: name, month, year' });

    const result = db.prepare(`
      INSERT INTO financial_scenarios (name, month, year, type, revenue_projection, expense_projection, new_clients, churn_clients, avg_ticket, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, month, year, type || 'realista', revenue_projection || 0, expense_projection || 0, new_clients || 0, churn_clients || 0, avg_ticket || 0, notes || null);

    res.status(201).json(db.prepare('SELECT * FROM financial_scenarios WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cenário' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, month, year, type, revenue_projection, expense_projection, new_clients, churn_clients, avg_ticket, notes } = req.body;
    const existing = db.prepare('SELECT id FROM financial_scenarios WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cenário não encontrado' });

    db.prepare(`
      UPDATE financial_scenarios SET name = ?, month = ?, year = ?, type = ?, revenue_projection = ?,
        expense_projection = ?, new_clients = ?, churn_clients = ?, avg_ticket = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(name, month, year, type || 'realista', revenue_projection || 0, expense_projection || 0, new_clients || 0, churn_clients || 0, avg_ticket || 0, notes || null, req.params.id);

    res.json(db.prepare('SELECT * FROM financial_scenarios WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cenário' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM financial_scenarios WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cenário não encontrado' });
    db.prepare('DELETE FROM financial_scenarios WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar cenário' });
  }
});

export default router;
