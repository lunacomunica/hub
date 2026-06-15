import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { month, year, status, is_fixed, is_client_cost, category_id } = req.query;
    let query = `
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (month && year) {
      const m = String(month).padStart(2, '0');
      query += ` AND fe.date >= ? AND fe.date <= ?`;
      params.push(`${year}-${m}-01`, `${year}-${m}-31`);
    } else if (year) {
      query += ` AND fe.date >= ? AND fe.date <= ?`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }

    if (status) {
      query += ` AND fe.status = ?`;
      params.push(status as string);
    }
    if (is_fixed !== undefined) {
      query += ` AND fe.is_fixed = ?`;
      params.push(Number(is_fixed));
    }
    if (is_client_cost !== undefined) {
      query += ` AND fe.is_client_cost = ?`;
      params.push(Number(is_client_cost));
    }
    if (category_id) {
      query += ` AND fe.category_id = ?`;
      params.push(Number(category_id));
    }

    query += ` ORDER BY fe.date DESC, fe.created_at DESC`;

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
});

router.patch('/bulk', (req: Request, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids obrigatório' });

    const allowed: Record<string, unknown> = {};
    if (updates.description !== undefined) allowed['description'] = updates.description;
    if (updates.category_id !== undefined) allowed['category_id'] = updates.category_id ?? null;

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
    const setValues = Object.values(allowed);
    const placeholders = ids.map(() => '?').join(', ');

    const updateMany = db.transaction(() => {
      db.prepare(
        `UPDATE financial_expenses SET ${setClauses}, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).run(...setValues, ...ids);
    });
    updateMany();

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar despesas em lote' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Despesa não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar despesa' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { description, category_id, supplier, client_name, amount, date, due_date, status, is_fixed, is_client_cost, notes } = req.body;
    if (!description || !amount || !date) {
      return res.status(400).json({ error: 'Campos obrigatórios: description, amount, date' });
    }
    const result = db.prepare(`
      INSERT INTO financial_expenses (description, category_id, supplier, client_name, amount, date, due_date, status, is_fixed, is_client_cost, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(description, category_id || null, supplier || null, client_name || null, amount, date, due_date || null, status || 'pendente', is_fixed ? 1 : 0, is_client_cost ? 1 : 0, notes || null);

    const newRow = db.prepare(`
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(newRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar despesa' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { description, category_id, supplier, client_name, amount, date, due_date, status, is_fixed, is_client_cost, notes } = req.body;
    const existing = db.prepare('SELECT id FROM financial_expenses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });

    db.prepare(`
      UPDATE financial_expenses SET
        description = ?, category_id = ?, supplier = ?, client_name = ?, amount = ?, date = ?,
        due_date = ?, status = ?, is_fixed = ?, is_client_cost = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(description, category_id || null, supplier || null, client_name || null, amount, date, due_date || null, status || 'pendente', is_fixed ? 1 : 0, is_client_cost ? 1 : 0, notes || null, req.params.id);

    const updated = db.prepare(`
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.id = ?
    `).get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
});

router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pendente', 'pago', 'atrasado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const existing = db.prepare('SELECT id FROM financial_expenses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });

    db.prepare(`UPDATE financial_expenses SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM financial_expenses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });
    db.prepare('DELETE FROM financial_expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar despesa' });
  }
});

export default router;
