import { Router, Request, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../middleware/auth';
import { saveRule } from '../utils/categorization';

const router = Router();

router.patch('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids obrigatório' });

    const allowed: Record<string, unknown> = {};
    if (updates.description !== undefined) allowed['description'] = updates.description;
    if (updates.category_id !== undefined) allowed['category_id'] = updates.category_id ?? null;
    if (updates.client_id !== undefined) allowed['client_id'] = updates.client_id ?? null;
    if (updates.client_name !== undefined) allowed['client_name'] = updates.client_name || null;
    if (updates.is_recurring !== undefined) allowed['is_recurring'] = updates.is_recurring ? 1 : 0;
    if (updates.recurrence_type !== undefined) allowed['recurrence_type'] = updates.recurrence_type || null;
    const validStatuses = ['pendente', 'pago', 'atrasado', 'cancelado'];
    if (updates.status !== undefined && validStatuses.includes(updates.status as string)) allowed['status'] = updates.status;

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

// GET /api/revenues/projections?month=8&year=2026
// Returns recurring revenue templates + active client MRR that have no real entry in the requested month
router.get('/projections', async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.json([]);

    const m = String(month).padStart(2, '0');
    const monthStart = `${year}-${m}-01`;
    const monthEnd = `${year}-${m}-31`;

    // ── 1. is_recurring templates ────────────────────────────────────────────
    const { rows: templates } = await pool.query(`
      SELECT DISTINCT ON (COALESCE(fr.client_id::text, fr.client_name, fr.description))
        fr.*, fc.name as category_name, fc.color as category_color,
        ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.is_recurring = 1
        AND fr.date < $1
      ORDER BY COALESCE(fr.client_id::text, fr.client_name, fr.description), fr.date DESC
    `, [monthStart]);

    // Track which client_ids are already covered by is_recurring templates
    const coveredClientIds = new Set(templates.filter(t => t.client_id).map((t: { client_id: number }) => t.client_id));

    const projections = [];

    for (const t of templates) {
      if (t.recurrence_type === 'quarterly') {
        const diffMonths =
          (new Date(monthStart).getFullYear() - new Date(t.date).getFullYear()) * 12 +
          (new Date(monthStart).getMonth() - new Date(t.date).getMonth());
        if (diffMonths % 3 !== 0) continue;
      }
      if (t.recurrence_type === 'yearly') {
        const diffMonths =
          (new Date(monthStart).getFullYear() - new Date(t.date).getFullYear()) * 12 +
          (new Date(monthStart).getMonth() - new Date(t.date).getMonth());
        if (diffMonths % 12 !== 0) continue;
      }

      const check = await pool.query(`
        SELECT 1 FROM financial_revenues
        WHERE date >= $1 AND date <= $2
          AND (
            ($3::int IS NOT NULL AND client_id = $3)
            OR ($3::int IS NULL AND $4::text IS NOT NULL AND client_name ILIKE $4)
            OR ($3::int IS NULL AND $4::text IS NULL AND description = $5)
          )
        LIMIT 1
      `, [monthStart, monthEnd, t.client_id || null, t.client_name || null, t.description]);

      if (check.rows.length === 0) {
        projections.push({ ...t, is_projection: true, id: `proj_${t.id}`, status: 'provisao' });
      }
    }

    // ── 2. Active clients MRR ────────────────────────────────────────────────
    // Find the "Mensalidade" revenue category for auto-assignment
    const { rows: catRows } = await pool.query(
      `SELECT id, name, color FROM financial_categories WHERE name = 'Mensalidade' AND type = 'revenue' LIMIT 1`
    );
    const mrrCat = catRows[0] || null;

    const { rows: mrrClients } = await pool.query(`
      SELECT id, name, monthly_fee
      FROM agency_clients
      WHERE active = 1 AND monthly_fee > 0
      ORDER BY name ASC
    `);

    for (const c of mrrClients) {
      // Skip if already covered by an is_recurring revenue template
      if (coveredClientIds.has(c.id)) continue;

      // Check if any revenue entry already exists for this client in this month
      const check = await pool.query(`
        SELECT 1 FROM financial_revenues
        WHERE date >= $1 AND date <= $2 AND client_id = $3
        LIMIT 1
      `, [monthStart, monthEnd, c.id]);

      if (check.rows.length === 0) {
        projections.push({
          id: `mrr_${c.id}`,
          description: 'Mensalidade',
          client_id: c.id,
          client_name: c.name,
          client_display_name: c.name,
          amount: c.monthly_fee,
          date: monthStart,
          due_date: null,
          status: 'provisao',
          category_id: mrrCat?.id || null,
          category_name: mrrCat?.name || null,
          category_color: mrrCat?.color || null,
          is_recurring: 1,
          recurrence_type: 'monthly',
          is_projection: true,
          is_mrr: true,
          notes: null,
        });
      }
    }

    res.json(projections);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar projeções' });
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
  const { items } = req.body as { items: { description: string; date: string; amount: number; category_id?: number; client_name?: string; notes?: string }[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Nenhum item para importar' });
  }
  try {
    // Single bulk INSERT using unnest — avoids N round-trips and Vercel 10s timeout
    const descriptions = items.map(i => i.description);
    const amounts      = items.map(i => i.amount);
    const dates        = items.map(i => i.date);
    const categoryIds  = items.map(i => i.category_id || null);
    const clientNames  = items.map(i => i.client_name || null);
    const notes        = items.map(i => i.notes || null);

    const { rows } = await pool.query(
      `INSERT INTO financial_revenues (description, amount, date, category_id, client_name, notes, status)
       SELECT * FROM unnest(
         $1::text[], $2::numeric[], $3::text[], $4::int[], $5::text[], $6::text[],
         array_fill('pendente'::text, ARRAY[$7::int])
       )
       RETURNING id`,
      [descriptions, amounts, dates, categoryIds, clientNames, notes, items.length]
    );

    // Learn from confirmed imports (fire-and-forget, non-blocking)
    items.forEach(item =>
      saveRule(item.description, 'revenue', item.category_id, item.client_name).catch(() => {})
    );

    return res.status(201).json({ imported: rows.length });
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
    `, [description, client_name || null, category_id || null, client_id || null, amount, date, due_date || null, status || 'pendente', is_recurring ? 1 : 0, recurrence_type || null, notes || null]);

    const { rows: [newRow] } = await pool.query(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = $1
    `, [inserted.id]);

    // Learn from this entry (non-blocking)
    saveRule(description, 'revenue', category_id, client_name).catch(() => {});

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
    `, [description, client_name || null, category_id || null, client_id || null, amount, date, due_date || null, status || 'pendente', is_recurring ? 1 : 0, recurrence_type || null, notes || null, req.params.id]);

    const { rows: [updated] } = await pool.query(`
      SELECT fr.*, fc.name as category_name, fc.color as category_color,
             ac.name as client_display_name
      FROM financial_revenues fr
      LEFT JOIN financial_categories fc ON fr.category_id = fc.id
      LEFT JOIN agency_clients ac ON fr.client_id = ac.id
      WHERE fr.id = $1
    `, [req.params.id]);

    // Learn from this entry (non-blocking)
    saveRule(description, 'revenue', category_id, client_name).catch(() => {});

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
