import { Router, Request, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../middleware/auth';
import { saveRule } from '../utils/categorization';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { month, year, status, is_fixed, is_client_cost, category_id } = req.query;
    let query = `
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let idx = 1;

    if (month && year) {
      const m = String(month).padStart(2, '0');
      query += ` AND fe.date >= $${idx++} AND fe.date <= $${idx++}`;
      params.push(`${year}-${m}-01`, `${year}-${m}-31`);
    } else if (year) {
      query += ` AND fe.date >= $${idx++} AND fe.date <= $${idx++}`;
      params.push(`${year}-01-01`, `${year}-12-31`);
    }

    if (status) {
      query += ` AND fe.status = $${idx++}`;
      params.push(status as string);
    }
    if (is_fixed !== undefined) {
      query += ` AND fe.is_fixed = $${idx++}`;
      params.push(Number(is_fixed));
    }
    if (is_client_cost !== undefined) {
      query += ` AND fe.is_client_cost = $${idx++}`;
      params.push(Number(is_client_cost));
    }
    if (category_id) {
      query += ` AND fe.category_id = $${idx++}`;
      params.push(Number(category_id));
    }

    query += ` ORDER BY fe.date DESC, fe.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
});

router.delete('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids obrigatório' });
    }
    const placeholders = ids.map((_: unknown, i: number) => `$${i + 1}`).join(', ');
    await pool.query(`DELETE FROM financial_expenses WHERE id IN (${placeholders})`, ids);
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar despesas em lote' });
  }
});

router.patch('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids obrigatório' });

    const allowed: Record<string, unknown> = {};
    if (updates.description !== undefined) allowed['description'] = updates.description;
    if (updates.category_id !== undefined) allowed['category_id'] = updates.category_id ?? null;
    if (updates.supplier !== undefined) allowed['supplier'] = updates.supplier || null;
    const validStatuses = ['pendente', 'pago', 'atrasado', 'cancelado'];
    if (updates.status !== undefined && validStatuses.includes(updates.status as string)) allowed['status'] = updates.status;
    if (updates.is_fixed !== undefined) allowed['is_fixed'] = updates.is_fixed ? 1 : 0;
    if (updates.is_client_cost !== undefined) allowed['is_client_cost'] = updates.is_client_cost ? 1 : 0;

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    const keys = Object.keys(allowed);
    let paramIndex = 1;
    const setClauses = keys.map(k => { const s = `${k} = $${paramIndex++}`; return s; }).join(', ');
    const setValues = Object.values(allowed);
    const idPlaceholders = ids.map(() => `$${paramIndex++}`).join(', ');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE financial_expenses SET ${setClauses}, updated_at = NOW() WHERE id IN (${idPlaceholders})`,
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
    res.status(500).json({ error: 'Erro ao atualizar despesas em lote' });
  }
});

// GET /api/expenses/suppliers?q=kem — autocomplete supplier names
router.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const { rows } = await pool.query(
      `SELECT DISTINCT supplier FROM financial_expenses
       WHERE supplier IS NOT NULL AND supplier != ''
         AND supplier ILIKE $1
       ORDER BY supplier ASC LIMIT 10`,
      [`%${q}%`]
    );
    // Also include matching employee names
    const { rows: emps } = await pool.query(
      `SELECT name as supplier FROM employees
       WHERE status != 'inativo' AND name ILIKE $1
       ORDER BY name ASC LIMIT 5`,
      [`%${q}%`]
    );
    const all = [...new Set([...rows.map((r: { supplier: string }) => r.supplier), ...emps.map((e: { supplier: string }) => e.supplier)])]
      .filter(Boolean).slice(0, 10);
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.id = $1
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Despesa não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar despesa' });
  }
});

// POST /api/expenses/bulk-import
router.post('/bulk-import', async (req: AuthRequest, res: Response) => {
  const { items } = req.body as { items: { description: string; date: string; amount: number; category_id?: number; supplier?: string; notes?: string }[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nenhum item para importar' });
  }
  try {
    // Single bulk INSERT using unnest — avoids N round-trips and Vercel 10s timeout
    const descriptions = items.map(i => i.description);
    const amounts      = items.map(i => i.amount);
    const dates        = items.map(i => i.date);
    const categoryIds  = items.map(i => i.category_id || null);
    const suppliers    = items.map(i => i.supplier || null);
    const notes        = items.map(i => i.notes || null);

    const { rows } = await pool.query(
      `INSERT INTO financial_expenses (description, amount, date, category_id, supplier, notes, status)
       SELECT * FROM unnest(
         $1::text[], $2::numeric[], $3::text[], $4::int[], $5::text[], $6::text[],
         array_fill('pendente'::text, ARRAY[$7::int])
       )
       RETURNING id`,
      [descriptions, amounts, dates, categoryIds, suppliers, notes, items.length]
    );

    // Learn from confirmed imports (fire-and-forget, non-blocking)
    items.forEach(item =>
      saveRule(item.description, 'expense', item.category_id, item.supplier).catch(() => {})
    );

    return res.status(201).json({ imported: rows.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao importar despesas' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { description, category_id, supplier, client_name, amount, date, due_date, status, is_fixed, is_client_cost, notes } = req.body;
    if (!description || !amount || !date) {
      return res.status(400).json({ error: 'Campos obrigatórios: description, amount, date' });
    }

    const { rows: [inserted] } = await pool.query(`
      INSERT INTO financial_expenses (description, category_id, supplier, client_name, amount, date, due_date, status, is_fixed, is_client_cost, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [description, category_id || null, supplier || null, client_name || null, amount, date, due_date || null, status || 'pendente', is_fixed ? 1 : 0, is_client_cost ? 1 : 0, notes || null]);

    const { rows: [newRow] } = await pool.query(`
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.id = $1
    `, [inserted.id]);

    // Learn from this entry (non-blocking)
    saveRule(description, 'expense', category_id, supplier).catch(() => {});

    res.status(201).json(newRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar despesa' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { description, category_id, supplier, client_name, amount, date, due_date, status, is_fixed, is_client_cost, notes } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_expenses WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });

    await pool.query(`
      UPDATE financial_expenses SET
        description = $1, category_id = $2, supplier = $3, client_name = $4, amount = $5, date = $6,
        due_date = $7, status = $8, is_fixed = $9, is_client_cost = $10, notes = $11,
        updated_at = NOW()
      WHERE id = $12
    `, [description, category_id || null, supplier || null, client_name || null, amount, date, due_date || null, status || 'pendente', is_fixed ? 1 : 0, is_client_cost ? 1 : 0, notes || null, req.params.id]);

    const { rows: [updated] } = await pool.query(`
      SELECT fe.*, fc.name as category_name, fc.color as category_color
      FROM financial_expenses fe
      LEFT JOIN financial_categories fc ON fe.category_id = fc.id
      WHERE fe.id = $1
    `, [req.params.id]);

    // Learn from this entry (non-blocking)
    saveRule(description, 'expense', category_id, supplier).catch(() => {});

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pendente', 'pago', 'atrasado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_expenses WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });

    await pool.query('UPDATE financial_expenses SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_expenses WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });
    await pool.query('DELETE FROM financial_expenses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar despesa' });
  }
});

export default router;
