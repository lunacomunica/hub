import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// ─── Pipeline stages ──────────────────────────────────────────────────────────

router.get('/stages', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pipeline_stages ORDER BY position ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estágios' });
  }
});

router.post('/stages', async (req: Request, res: Response) => {
  try {
    const { key, label, color = '#6366f1', bg_color = 'rgba(99,102,241,0.12)', position } = req.body;
    if (!key || !label) return res.status(400).json({ error: 'key e label são obrigatórios' });

    const { rows: [maxRow] } = await pool.query<{ m: string }>(
      'SELECT COALESCE(MAX(position),0) as m FROM pipeline_stages WHERE is_terminal = 0'
    );
    const pos = position ?? Number(maxRow.m) + 1;

    await pool.query(
      'UPDATE pipeline_stages SET position = position + 1 WHERE is_terminal = 1 AND position >= $1',
      [pos]
    );

    const { rows: [created] } = await pool.query(
      'INSERT INTO pipeline_stages (key, label, color, bg_color, position, is_terminal) VALUES ($1,$2,$3,$4,$5,0) RETURNING *',
      [key, label, color, bg_color, pos]
    );

    res.status(201).json(created);
  } catch (err: any) {
    if (err.message?.includes('unique') || err.code === '23505') return res.status(409).json({ error: 'Chave de estágio já existe' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/stages/:id', async (req: Request, res: Response) => {
  try {
    const { label, color, bg_color, position } = req.body;
    const { rows: [stage] } = await pool.query('SELECT * FROM pipeline_stages WHERE id = $1', [Number(req.params.id)]);
    if (!stage) return res.status(404).json({ error: 'Estágio não encontrado' });

    const updates: string[] = [];
    const vals: any[] = [];
    let paramIdx = 1;
    if (label !== undefined)    { updates.push(`label = $${paramIdx++}`);    vals.push(label); }
    if (color !== undefined)    { updates.push(`color = $${paramIdx++}`);    vals.push(color); }
    if (bg_color !== undefined) { updates.push(`bg_color = $${paramIdx++}`); vals.push(bg_color); }
    if (position !== undefined) { updates.push(`position = $${paramIdx++}`); vals.push(position); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    vals.push(Number(req.params.id));
    await pool.query(`UPDATE pipeline_stages SET ${updates.join(', ')} WHERE id = $${paramIdx}`, vals);

    const { rows: [updated] } = await pool.query('SELECT * FROM pipeline_stages WHERE id = $1', [Number(req.params.id)]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stages/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [stage] } = await pool.query('SELECT * FROM pipeline_stages WHERE id = $1', [Number(req.params.id)]);
    if (!stage) return res.status(404).json({ error: 'Estágio não encontrado' });
    if (stage.is_terminal) return res.status(400).json({ error: 'Estágios terminais não podem ser excluídos' });

    const { rows: [countRow] } = await pool.query<{ c: string }>(
      'SELECT COUNT(*) as c FROM opportunities WHERE stage = $1',
      [stage.key]
    );
    const count = Number(countRow.c);
    if (count > 0) return res.status(400).json({ error: `Este estágio tem ${count} oportunidade(s). Mova-as antes de excluir.` });

    await pool.query('DELETE FROM pipeline_stages WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Activity log ─────────────────────────────────────────────────────────────

router.get('/:id/activities', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM opportunity_activities WHERE opportunity_id = $1 ORDER BY created_at DESC',
      [Number(req.params.id)]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/activities', async (req: Request, res: Response) => {
  try {
    const { type = 'nota', content, author } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo é obrigatório' });

    const { rows: [opp] } = await pool.query('SELECT id FROM opportunities WHERE id = $1', [Number(req.params.id)]);
    if (!opp) return res.status(404).json({ error: 'Oportunidade não encontrada' });

    const { rows: [created] } = await pool.query(
      'INSERT INTO opportunity_activities (opportunity_id, type, content, author) VALUES ($1,$2,$3,$4) RETURNING *',
      [Number(req.params.id), type, content.trim(), author || null]
    );

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/activities/:aid', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query(
      'SELECT id FROM opportunity_activities WHERE id = $1 AND opportunity_id = $2',
      [Number(req.params.aid), Number(req.params.id)]
    );
    if (!row) return res.status(404).json({ error: 'Atividade não encontrada' });
    await pool.query('DELETE FROM opportunity_activities WHERE id = $1', [Number(req.params.aid)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Opportunities CRUD ───────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { stage } = req.query;
    let query = `
      SELECT
        o.*,
        p.name  as product_name,
        p.price as product_price,
        u.name  as owner_name,
        EXTRACT(DAY FROM NOW() - COALESCE(o.stage_entered_at, o.created_at)::timestamp)::integer as days_in_stage,
        (SELECT COUNT(*) FROM opportunity_activities a WHERE a.opportunity_id = o.id) as activity_count
      FROM opportunities o
      LEFT JOIN products p ON p.id = o.product_id
      LEFT JOIN users    u ON u.id = o.owner_id
      WHERE 1=1
    `;
    const params: string[] = [];
    let paramIdx = 1;
    if (stage) { query += ` AND o.stage = $${paramIdx++}`; params.push(stage as string); }
    query += ' ORDER BY o.created_at DESC';

    // ── Main items query (critical — if this fails, return 500) ──────────────
    const { rows } = await pool.query(query, params);

    // ── Attach opp_items to each opportunity ──────────────────────────────────
    if (rows.length > 0) {
      try {
        const oppIds = rows.map((r: any) => r.id);
        const { rows: allItems } = await pool.query(
          'SELECT * FROM opportunity_items WHERE opportunity_id = ANY($1) ORDER BY position ASC, id ASC',
          [oppIds]
        );
        const itemsByOpp: Record<number, any[]> = {};
        for (const item of allItems) {
          if (!itemsByOpp[item.opportunity_id]) itemsByOpp[item.opportunity_id] = [];
          itemsByOpp[item.opportunity_id].push(item);
        }
        for (const row of rows) {
          (row as any).opp_items = itemsByOpp[row.id] || [];
        }
      } catch (e) { console.error('[opp_items fetch]', e); }
    }

    // ── Summary queries (non-critical — each fails gracefully) ────────────────
    const safeQuery = async <T>(sql: string, fallback: T): Promise<T> => {
      try { const { rows: r } = await pool.query(sql); return (r[0] ?? fallback) as T; }
      catch (e) { console.error('[opp summary]', e); return fallback; }
    };
    const safeQueryRows = async <T>(sql: string): Promise<T[]> => {
      try { const { rows: r } = await pool.query(sql); return r as T[]; }
      catch (e) { console.error('[opp summary]', e); return []; }
    };

    const [summary, negRow, byStage, won, lost, lostReasons, overdueRow, todayRow, soonRow] = await Promise.all([
      safeQuery(
        `SELECT COUNT(*) as total_count, COALESCE(SUM(value), 0) as total_value,
                COALESCE(SUM(value * probability / 100.0), 0) as weighted_value
         FROM opportunities WHERE stage NOT IN ('fechado','perdido')`,
        { total_count: '0', total_value: '0', weighted_value: '0' }
      ),
      safeQuery(
        `SELECT COALESCE(SUM(value),0) as v FROM opportunities WHERE stage = 'negociacao'`,
        { v: '0' }
      ),
      safeQueryRows(
        `SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
         FROM opportunities GROUP BY stage`
      ),
      safeQuery(
        `SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total FROM opportunities WHERE stage='fechado'`,
        { count: '0', total: '0' }
      ),
      safeQuery(
        `SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total
         FROM opportunities
         WHERE stage IN (SELECT key FROM pipeline_stages WHERE is_terminal=1 AND key!='fechado')`,
        { count: '0', total: '0' }
      ),
      safeQueryRows(
        `SELECT COALESCE(lost_reason, 'Não informado') as reason,
                COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
         FROM opportunities
         WHERE stage IN (SELECT key FROM pipeline_stages WHERE is_terminal=1 AND key!='fechado')
         GROUP BY lost_reason ORDER BY count DESC`
      ),
      safeQuery(`SELECT COUNT(*) as c FROM opportunities WHERE next_followup < CURRENT_DATE AND stage NOT IN ('fechado','perdido')`, { c: '0' }),
      safeQuery(`SELECT COUNT(*) as c FROM opportunities WHERE next_followup = CURRENT_DATE AND stage NOT IN ('fechado','perdido')`, { c: '0' }),
      safeQuery(`SELECT COUNT(*) as c FROM opportunities WHERE next_followup > CURRENT_DATE AND next_followup <= CURRENT_DATE + INTERVAL '3 days' AND stage NOT IN ('fechado','perdido')`, { c: '0' }),
    ]);

    const totalClosed = Number((won as any).count) + Number((lost as any).count);
    const win_rate = totalClosed > 0 ? (Number((won as any).count) / totalClosed) * 100 : 0;

    res.json({
      items: rows,
      summary: {
        total_count: Number((summary as any).total_count),
        total_value: Number((summary as any).total_value),
        weighted_value: Number((summary as any).weighted_value),
        by_stage: byStage,
        win_rate,
        won_value: Number((won as any).total),
        negotiation_value: Number((negRow as any).v),
        overdue_followups: Number((overdueRow as any).c),
        today_followups: Number((todayRow as any).c),
        soon_followups: Number((soonRow as any).c),
        lost_value: Number((lost as any).total),
        lost_reasons: lostReasons,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar oportunidades' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT o.*, p.name as product_name, u.name as owner_name,
        EXTRACT(DAY FROM NOW() - COALESCE(o.stage_entered_at, o.created_at)::timestamp)::integer as days_in_stage
      FROM opportunities o
      LEFT JOIN products p ON p.id = o.product_id
      LEFT JOIN users    u ON u.id = o.owner_id
      WHERE o.id = $1
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Oportunidade não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar oportunidade' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, client_name, value, stage, probability, expected_close_date,
            service_type, product_id, notes, temperature, next_followup, owner_id, source, lost_reason,
            original_price, payment_method, installments, payment_notes, referral_name } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    const closedAt = stage === 'fechado' ? new Date().toISOString().split('T')[0] : null;
    const temp = ['frio','morno','quente'].includes(temperature) ? temperature : 'morno';

    const { rows: [created] } = await pool.query(
      `INSERT INTO opportunities
         (title, client_name, value, stage, probability, expected_close_date,
          service_type, product_id, notes, closed_at, temperature,
          next_followup, owner_id, source, lost_reason,
          original_price, payment_method, installments, payment_notes,
          referral_name, stage_entered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
       RETURNING *`,
      [
        title, client_name || null, value || 0, stage || 'prospeccao', probability || 20,
        expected_close_date || null, service_type || null, product_id || null,
        notes || null, closedAt, temp,
        next_followup || null, owner_id || null, source || null, lost_reason || null,
        original_price || null, payment_method || null, installments || 1, payment_notes || null,
        referral_name || null,
      ]
    );

    if (Array.isArray(req.body.opp_items)) {
      for (let i = 0; i < req.body.opp_items.length; i++) {
        const item = req.body.opp_items[i];
        if (!item.description?.trim() && !item.value) continue;
        await pool.query(
          'INSERT INTO opportunity_items (opportunity_id, description, product_id, value, position) VALUES ($1, $2, $3, $4, $5)',
          [created.id, item.description || '', item.product_id || null, item.value || 0, i]
        );
      }
    }

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar oportunidade' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, client_name, value, stage, probability, expected_close_date,
            service_type, product_id, notes, temperature, next_followup, owner_id, source, lost_reason,
            original_price, payment_method, installments, payment_notes, referral_name } = req.body;

    const { rows: [existing] } = await pool.query<{ id: number; stage: string; closed_at: string | null }>(
      'SELECT id, stage, closed_at FROM opportunities WHERE id = $1',
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Oportunidade não encontrada' });

    let closedAt = existing.closed_at;
    const stageChanged = stage && stage !== existing.stage;

    if (stageChanged) {
      if (stage === 'fechado') closedAt = new Date().toISOString().split('T')[0];
      else closedAt = null;
    }

    const temp = ['frio','morno','quente'].includes(temperature) ? temperature : 'morno';

    const stageEnteredClause = stageChanged ? ', stage_entered_at = NOW()' : '';

    await pool.query(
      `UPDATE opportunities SET
         title = $1, client_name = $2, value = $3, stage = $4, probability = $5,
         expected_close_date = $6, service_type = $7, product_id = $8, notes = $9,
         closed_at = $10, temperature = $11, next_followup = $12, owner_id = $13,
         source = $14, lost_reason = $15,
         original_price = $16, payment_method = $17, installments = $18, payment_notes = $19,
         referral_name = $20,
         updated_at = NOW()${stageEnteredClause}
       WHERE id = $21`,
      [
        title, client_name || null, value || 0, stage || 'prospeccao', probability || 20,
        expected_close_date || null, service_type || null, product_id || null,
        notes || null, closedAt, temp,
        next_followup || null, owner_id || null, source || null, lost_reason || null,
        original_price || null, payment_method || null, installments || 1, payment_notes || null,
        referral_name || null,
        req.params.id,
      ]
    );

    try {
      if (Array.isArray(req.body.opp_items)) {
        await pool.query('DELETE FROM opportunity_items WHERE opportunity_id = $1', [req.params.id]);
        for (let i = 0; i < req.body.opp_items.length; i++) {
          const item = req.body.opp_items[i];
          if (!item.description?.trim() && !item.value) continue;
          await pool.query(
            'INSERT INTO opportunity_items (opportunity_id, description, product_id, value, position) VALUES ($1, $2, $3, $4, $5)',
            [req.params.id, item.description || '', item.product_id || null, Number(item.value) || 0, i]
          );
        }
      }
    } catch (e) { console.error('[opp_items upsert]', e); }

    const { rows: [updated] } = await pool.query(
      `SELECT o.*, u.name as owner_name,
         EXTRACT(DAY FROM NOW() - COALESCE(o.stage_entered_at, o.created_at)::timestamp)::integer as days_in_stage
       FROM opportunities o LEFT JOIN users u ON u.id = o.owner_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar oportunidade' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM opportunities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar oportunidade' });
  }
});

// ─── Convert won opportunity → client ────────────────────────────────────────
router.post('/:id/convert-to-client', async (req: Request, res: Response) => {
  const { client_type, monthly_fee, margin_target, project_title, contract_value, service_type, start_date } = req.body;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    const { rows: [opp] } = await db.query('SELECT * FROM opportunities WHERE id = $1', [req.params.id]);
    if (!opp) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'Oportunidade não encontrada' }); }
    if (opp.client_id) { await db.query('ROLLBACK'); return res.status(400).json({ error: 'Oportunidade já vinculada a um cliente' }); }

    const type = client_type || 'mrr';
    const isMrr = type === 'mrr' || type === 'ambos';
    const isTcv = type === 'tcv' || type === 'ambos';
    const fee = isMrr ? Number(monthly_fee || 0) : 0;
    const startDate = start_date || new Date().toISOString().split('T')[0];
    const clientName = opp.client_name || opp.title;

    const { rows: [client] } = await db.query(
      `INSERT INTO agency_clients (name, monthly_fee, margin_target, active, start_date, client_type, service_type)
       VALUES ($1, $2, $3, 1, $4, $5, $6) RETURNING *`,
      [clientName, fee, margin_target || 30, startDate, type, service_type || opp.service_type || null]
    );

    if (isTcv) {
      await db.query(
        `INSERT INTO tcv_projects (client_id, title, contract_value, start_date, status)
         VALUES ($1, $2, $3, $4, 'em_andamento')`,
        [client.id, project_title || opp.title, Number(contract_value || opp.value || 0), startDate]
      );
    }

    await db.query(
      'UPDATE opportunities SET client_id = $1, updated_at = NOW() WHERE id = $2',
      [client.id, req.params.id]
    );

    await db.query('COMMIT');
    res.status(201).json({ success: true, client });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao converter oportunidade em cliente' });
  } finally {
    db.release();
  }
});

export default router;
