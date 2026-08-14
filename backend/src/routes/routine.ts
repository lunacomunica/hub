import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const isAdmin = (req: Request) => (req as any).user?.role === 'admin';
const userId  = (req: Request): number => (req as any).user?.id;

// ── Items ─────────────────────────────────────────────────────────────────────

router.get('/items', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT ri.*,
         COALESCE(
           json_agg(riu.user_id) FILTER (WHERE riu.user_id IS NOT NULL),
           '[]'
         ) as assigned_user_ids
       FROM routine_items ri
       LEFT JOIN routine_item_users riu ON riu.item_id = ri.id
       GROUP BY ri.id
       ORDER BY ri.position ASC, ri.id ASC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar itens' }); }
});

router.post('/items', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { label, description, category, type, weekday, position, deliverables, how_to, assigned_user_ids } = req.body;
    if (!label) return res.status(400).json({ error: 'label é obrigatório' });
    const { rows: [row] } = await pool.query(
      `INSERT INTO routine_items (label, description, category, type, weekday, position, deliverables, how_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [label, description || null, category || null, type || 'daily', weekday ?? null, position ?? 0,
       deliverables ? JSON.stringify(deliverables) : null, how_to || null]
    );
    if (Array.isArray(assigned_user_ids) && assigned_user_ids.length > 0) {
      for (const uid of assigned_user_ids) {
        await pool.query(`INSERT INTO routine_item_users (item_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [row.id, uid]);
      }
    }
    res.status(201).json({ ...row, assigned_user_ids: assigned_user_ids ?? [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao criar item' }); }
});

router.put('/items/:id', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { label, description, category, type, weekday, position, active, deliverables, how_to, assigned_user_ids } = req.body;
    const { rows: [row] } = await pool.query(
      `UPDATE routine_items SET label=$1, description=$2, category=$3, type=$4,
       weekday=$5, position=$6, active=$7, deliverables=$8, how_to=$9 WHERE id=$10 RETURNING *`,
      [label, description ?? null, category ?? null, type, weekday ?? null, position ?? 0, active !== false,
       deliverables ? JSON.stringify(deliverables) : null, how_to || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Item não encontrado' });
    // Replace user assignments
    await pool.query(`DELETE FROM routine_item_users WHERE item_id=$1`, [req.params.id]);
    if (Array.isArray(assigned_user_ids) && assigned_user_ids.length > 0) {
      for (const uid of assigned_user_ids) {
        await pool.query(`INSERT INTO routine_item_users (item_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [row.id, uid]);
      }
    }
    res.json({ ...row, assigned_user_ids: assigned_user_ids ?? [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar item' }); }
});

router.delete('/items/:id', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    await pool.query('DELETE FROM routine_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao deletar item' }); }
});

// ── Checks ────────────────────────────────────────────────────────────────────

// GET /api/routine/checks?date=YYYY-MM-DD&user_id=
router.get('/checks', async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const targetUserId = isAdmin(req) && req.query.user_id
      ? Number(req.query.user_id)
      : userId(req);
    const { rows } = await pool.query(
      `SELECT item_id FROM routine_checks WHERE user_id=$1 AND date=$2`,
      [targetUserId, date]
    );
    res.json(rows.map(r => r.item_id));
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar checks' }); }
});

// POST /api/routine/checks — toggle (marca se não existe, desmarca se existe)
router.post('/checks', async (req: Request, res: Response) => {
  try {
    const { item_id, date, user_id: bodyUserId } = req.body;
    const targetUserId = isAdmin(req) && bodyUserId ? bodyUserId : userId(req);
    if (!item_id || !date) return res.status(400).json({ error: 'item_id e date são obrigatórios' });

    const { rows: [existing] } = await pool.query(
      `SELECT id FROM routine_checks WHERE user_id=$1 AND item_id=$2 AND date=$3`,
      [targetUserId, item_id, date]
    );

    if (existing) {
      await pool.query('DELETE FROM routine_checks WHERE id=$1', [existing.id]);
      res.json({ checked: false });
    } else {
      await pool.query(
        `INSERT INTO routine_checks (user_id, item_id, date) VALUES ($1,$2,$3)`,
        [targetUserId, item_id, date]
      );
      res.json({ checked: true });
    }
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar check' }); }
});

// ── Performance ───────────────────────────────────────────────────────────────

// GET /api/routine/performance?user_id=&weeks=4
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const targetUserId = isAdmin(req) && req.query.user_id
      ? Number(req.query.user_id)
      : userId(req);
    const weeks = Math.min(Number(req.query.weeks) || 4, 12);

    // Get checks per date for last N weeks (only weekdays)
    const { rows } = await pool.query(
      `SELECT
         rc.date,
         COUNT(DISTINCT rc.item_id) as checked_count,
         COUNT(DISTINCT ri.id) as total_count
       FROM generate_series(
         CURRENT_DATE - ($1 * 7)::int,
         CURRENT_DATE,
         '1 day'::interval
       ) AS d(date)
       -- only weekdays (mon-fri)
       CROSS JOIN (
         SELECT id FROM routine_items
         WHERE active = true
           AND (type = 'daily' OR (type = 'weekday' AND weekday = EXTRACT(DOW FROM d.date)::int))
       ) ri
       LEFT JOIN routine_checks rc
         ON rc.item_id = ri.id AND rc.user_id = $2 AND rc.date = d.date::date
       WHERE EXTRACT(DOW FROM d.date) BETWEEN 1 AND 5
       GROUP BY rc.date, d.date
       ORDER BY d.date DESC`,
      [weeks, targetUserId]
    );

    // Also fetch users list for admin selector
    let users: { id: number; name: string }[] = [];
    if (isAdmin(req)) {
      const { rows: usersRows } = await pool.query(
        `SELECT id, name FROM users ORDER BY name`
      );
      users = usersRows;
    }

    res.json({ performance: rows, users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar performance' });
  }
});

export default router;
