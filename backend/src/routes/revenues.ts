import { Router, Request, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.patch('/bulk', async (req: Request, res: Response) => {
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

    const keys = Object.keys(allowed);
    let paramIndex = 1;
    const setClauses = keys.map(k => { const s = `${k} = $${paramIndex++}`; return s; }).join(', ');
    const setValues = Object.values(allowed);

    // Build $N placeholders for IN clause
    const idPlaceholders = ids.map(() => `$${paramIndex++}`).join(', ');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE financial_revenues SET ${setClauses}, updated_at = NOW() WHERE id IN (${idPlaceholders})`,
        [...setValues, ...ids]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar receitas em lote' });
  }
});

router.get('/', async (req: Request, res: Response) => {
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
    let idx = 1;

    if (month && year) {
      const m = String(month).padStart(2, '0');
      query += ` AND fr.date >= $${idx++} AND fr.date <= $${idx++}`;
      params.push(`${year}-${m}-01`, `${year}-${m}-31`);
    } else if (year) {
      query += ` AND fr.date >= $${idx++} AND fr.date <= $${idx++}`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }

    if (status) {
      query += ` AND fr.status = $${idx++}`;
      params.push(status as string);
    }
    if (client_name) {
      query += ` AND fr.client_name ILIKE $${idx++}`;
      params.push(`%${client_name}%`);
    }
    if (category_id) {
      query += ` AND fr.category_id = $${idx++}`;
      params.push(Number(category_id));
    }

    query += ` ORDER BY fr.date DESC, fr.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar receitas' });
  }
});

router.get('/recurring', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.is_recurring = true
      ORDER BY fr.date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar receitas recorrentes' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = $1
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Receita não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar receita' });
  }
});

// POST /api/revenues/bulk-import
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const { items } = req.body as { items: { description: string; date: string; amount: number; category_id?: number; notes?: string }[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nenhum item para importar' });
  }
  const imported: unknown[] = [];
  try {
    for (const item of items) {
      const { rows: [row] } = await pool.query(
        `INSERT INTO financial_revenues (description, amount, date, category_id, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'pendente') RETURNING *`,
        [item.description, item.amount, item.date, item.category_id || null, item.notes || null]
      );
      imported.push(row);
    }
    return res.status(201).json({ imported: imported.length, items: imported });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao importar receitas' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { description, client_name, category_id, client_id, amount, date, due_date, status, is_recurring, recurrence_type, notes } = req.body;
    if (!description || !amount || !date) {
      return res.status(400).json({ error: 'Campos obrigatórios: description, amount, date' });
    }

    const { rows: [inserted] } = await pool.query(`
      INSERT INTO financial_revenues (description, client_name, category_id, client_id, amount, date, due_date, status, is_recurring, recurrence_type, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [description, client_name || null, category_id || null, client_id || null, amount, date, due_date || null, status || 'pendente', is_recurring ? true : false, recurrence_type || null, notes || null]);

    const { rows: [newRow] } = await pool.query(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = $1
    `, [inserted.id]);
    res.status(201).json(newRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar receita' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { description, client_name, category_id, client_id, amount, date, due_date, status, is_recurring, recurrence_type, notes } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_revenues WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Receita não encontrada' });

    await pool.query(`
      UPDATE financial_revenues SET
        description = $1, client_name = $2, category_id = $3, client_id = $4, amount = $5, date = $6,
        due_date = $7, status = $8, is_recurring = $9, recurrence_type = $10, notes = $11,
        updated_at = NOW()
      WHERE id = $12
    `, [description, client_name || null, category_id || null, client_id || null, amount, date, due_date || null, status || 'pendente', is_recurring ? true : false, recurrence_type || null, notes || null, req.params.id]);

    const { rows: [updated] } = await pool.query(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = $1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar receita' });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pendente', 'pago', 'atrasado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_revenues WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Receita não encontrada' });

    await pool.query('UPDATE financial_revenues SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_revenues WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Receita não encontrada' });
    await pool.query('DELETE FROM financial_revenues WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar receita' });
  }
});

export default router;
