import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.patch('/bulk', (req: Request, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids obrigatório' });

    const allowed: Record<string, unknown> = {};
    if (updates.description !== undefined) allowed['description'] = updates.description;
    if (updates.category_id !== undefined) allowed['category_id'] = updates.category_id ?? null;
    if (updates.client_id !== undefined) allowed['client_id'] = updates.client_id ?? null;

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    const setClauses = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
    const setValues = Object.values(allowed);
    const placeholders = ids.map(() => '?').join(', ');

    const updateMany = db.transaction(() => {
      db.prepare(
        `UPDATE financial_revenues SET ${setClauses}, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).run(...setValues, ...ids);
    });
    updateMany();

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar receitas em lote' });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { month, year, status, client_name, category_id } = req.query;
    let query = `
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (month && year) {
      const m = String(month).padStart(2, '0');
      query += ` AND fr.date >= ? AND fr.date <= ?`;
      params.push(`${year}-${m}-01`, `${year}-${m}-31`);
    } else if (year) {
      query += ` AND fr.date >= ? AND fr.date <= ?`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }

    if (status) {
      query += ` AND fr.status = ?`;
      params.push(status as string);
    }
    if (client_name) {
      query += ` AND fr.client_name LIKE ?`;
      params.push(`%${client_name}%`);
    }
    if (category_id) {
      query += ` AND fr.category_id = ?`;
      params.push(Number(category_id));
    }

    query += ` ORDER BY fr.date DESC, fr.created_at DESC`;

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar receitas' });
  }
});

router.get('/recurring', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.is_recurring = 1
      ORDER BY fr.date DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar receitas recorrentes' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Receita não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar receita' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { description, client_name, category_id, client_id, amount, date, due_date, status, is_recurring, recurrence_type, notes } = req.body;
    if (!description || !amount || !date) {
      return res.status(400).json({ error: 'Campos obrigatórios: description, amount, date' });
    }
    const result = db.prepare(`
      INSERT INTO financial_revenues (description, client_name, category_id, client_id, amount, date, due_date, status, is_recurring, recurrence_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(description, client_name || null, category_id || null, client_id || null, amount, date, due_date || null, status || 'pendente', is_recurring ? 1 : 0, recurrence_type || null, notes || null);

    const newRow = db.prepare(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(newRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar receita' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { description, client_name, category_id, client_id, amount, date, due_date, status, is_recurring, recurrence_type, notes } = req.body;
    const existing = db.prepare('SELECT id FROM financial_revenues WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Receita não encontrada' });

    db.prepare(`
      UPDATE financial_revenues SET
        description = ?, client_name = ?, category_id = ?, client_id = ?, amount = ?, date = ?,
        due_date = ?, status = ?, is_recurring = ?, recurrence_type = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(description, client_name || null, category_id || null, client_id || null, amount, date, due_date || null, status || 'pendente', is_recurring ? 1 : 0, recurrence_type || null, notes || null, req.params.id);

    const updated = db.prepare(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = ?
    `).get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar receita' });
  }
});

router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pendente', 'pago', 'atrasado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const existing = db.prepare('SELECT id FROM financial_revenues WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Receita não encontrada' });

    db.prepare(`UPDATE financial_revenues SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM financial_revenues WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Receita não encontrada' });
    db.prepare('DELETE FROM financial_revenues WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar receita' });
  }
});

export default router;
