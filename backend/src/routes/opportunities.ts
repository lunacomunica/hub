import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// ─── Pipeline stages ──────────────────────────────────────────────────────────

router.get('/stages', (_req: Request, res: Response) => {
  try {
    res.json(db.prepare('SELECT * FROM pipeline_stages ORDER BY position ASC').all());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estágios' });
  }
});

router.post('/stages', (req: Request, res: Response) => {
  try {
    const { key, label, color = '#6366f1', bg_color = 'rgba(99,102,241,0.12)', position } = req.body;
    if (!key || !label) return res.status(400).json({ error: 'key e label são obrigatórios' });

    const maxPos = (db.prepare('SELECT COALESCE(MAX(position),0) as m FROM pipeline_stages WHERE is_terminal = 0').get() as any).m;
    const pos = position ?? maxPos + 1;
    db.prepare('UPDATE pipeline_stages SET position = position + 1 WHERE is_terminal = 1 AND position >= ?').run(pos);

    const info = db.prepare(
      'INSERT INTO pipeline_stages (key, label, color, bg_color, position, is_terminal) VALUES (?,?,?,?,?,0)'
    ).run(key, label, color, bg_color, pos);

    res.status(201).json(db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(info.lastInsertRowid));
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Chave de estágio já existe' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/stages/:id', (req: Request, res: Response) => {
  try {
    const { label, color, bg_color, position } = req.body;
    const stage = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(Number(req.params.id)) as any;
    if (!stage) return res.status(404).json({ error: 'Estágio não encontrado' });

    const updates: string[] = [];
    const vals: any[] = [];
    if (label !== undefined)    { updates.push('label = ?');    vals.push(label); }
    if (color !== undefined)    { updates.push('color = ?');    vals.push(color); }
    if (bg_color !== undefined) { updates.push('bg_color = ?'); vals.push(bg_color); }
    if (position !== undefined) { updates.push('position = ?'); vals.push(position); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    vals.push(Number(req.params.id));
    db.prepare(`UPDATE pipeline_stages SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

    res.json(db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(Number(req.params.id)));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stages/:id', (req: Request, res: Response) => {
  try {
    const stage = db.prepare('SELECT * FROM pipeline_stages WHERE id = ?').get(Number(req.params.id)) as any;
    if (!stage) return res.status(404).json({ error: 'Estágio não encontrado' });
    if (stage.is_terminal) return res.status(400).json({ error: 'Estágios terminais não podem ser excluídos' });

    const count = (db.prepare('SELECT COUNT(*) as c FROM opportunities WHERE stage = ?').get(stage.key) as any).c;
    if (count > 0) return res.status(400).json({ error: `Este estágio tem ${count} oportunidade(s). Mova-as antes de excluir.` });

    db.prepare('DELETE FROM pipeline_stages WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Activity log ─────────────────────────────────────────────────────────────

router.get('/:id/activities', (req: Request, res: Response) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM opportunity_activities WHERE opportunity_id = ? ORDER BY created_at DESC'
    ).all(Number(req.params.id));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/activities', (req: Request, res: Response) => {
  try {
    const { type = 'nota', content, author } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo é obrigatório' });

    const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(Number(req.params.id));
    if (!opp) return res.status(404).json({ error: 'Oportunidade não encontrada' });

    const info = db.prepare(
      'INSERT INTO opportunity_activities (opportunity_id, type, content, author) VALUES (?,?,?,?)'
    ).run(Number(req.params.id), type, content.trim(), author || null);

    res.status(201).json(db.prepare('SELECT * FROM opportunity_activities WHERE id = ?').get(info.lastInsertRowid));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/activities/:aid', (req: Request, res: Response) => {
  try {
    const row = db.prepare(
      'SELECT id FROM opportunity_activities WHERE id = ? AND opportunity_id = ?'
    ).get(Number(req.params.aid), Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Atividade não encontrada' });
    db.prepare('DELETE FROM opportunity_activities WHERE id = ?').run(Number(req.params.aid));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Opportunities CRUD ───────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  try {
    const { stage } = req.query;
    let query = `
      SELECT
        o.*,
        p.name  as product_name,
        p.price as product_price,
        u.name  as owner_name,
        CAST(ROUND(julianday('now') - julianday(COALESCE(o.stage_entered_at, o.created_at))) AS INTEGER) as days_in_stage,
        (SELECT COUNT(*) FROM opportunity_activities a WHERE a.opportunity_id = o.id) as activity_count
      FROM opportunities o
      LEFT JOIN products p ON p.id = o.product_id
      LEFT JOIN users    u ON u.id = o.owner_id
      WHERE 1=1
    `;
    const params: string[] = [];
    if (stage) { query += ' AND o.stage = ?'; params.push(stage as string); }
    query += ' ORDER BY o.created_at DESC';

    const rows = db.prepare(query).all(...params);

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(value), 0) as total_value,
        COALESCE(SUM(value * probability / 100.0), 0) as weighted_value
      FROM opportunities WHERE stage NOT IN ('fechado','perdido')
    `).get() as { total_count: number; total_value: number; weighted_value: number };

    const negValue = (db.prepare(
      `SELECT COALESCE(SUM(value),0) as v FROM opportunities WHERE stage = 'negociacao'`
    ).get() as any).v as number;

    const byStage = db.prepare(`
      SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
      FROM opportunities GROUP BY stage
    `).all();

    const won       = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total FROM opportunities WHERE stage='fechado'`).get()  as { count: number; total: number };
    const lost      = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(value),0) as total FROM opportunities WHERE stage IN (SELECT key FROM pipeline_stages WHERE is_terminal=1 AND key!='fechado')`).get() as { count: number; total: number };
    const totalClosed = won.count + lost.count;
    const win_rate  = totalClosed > 0 ? (won.count / totalClosed) * 100 : 0;

    const lostReasons = db.prepare(`
      SELECT COALESCE(lost_reason, 'Não informado') as reason,
             COUNT(*) as count,
             COALESCE(SUM(value), 0) as total_value
      FROM opportunities
      WHERE stage IN (SELECT key FROM pipeline_stages WHERE is_terminal=1 AND key!='fechado')
      GROUP BY lost_reason ORDER BY count DESC
    `).all() as { reason: string; count: number; total_value: number }[];

    const overdueFollowups = (db.prepare(
      `SELECT COUNT(*) as c FROM opportunities WHERE next_followup < date('now','localtime') AND stage NOT IN ('fechado','perdido')`
    ).get() as any).c as number;

    const todayFollowups = (db.prepare(
      `SELECT COUNT(*) as c FROM opportunities WHERE next_followup = date('now','localtime') AND stage NOT IN ('fechado','perdido')`
    ).get() as any).c as number;

    const soonFollowups = (db.prepare(
      `SELECT COUNT(*) as c FROM opportunities WHERE next_followup > date('now','localtime') AND next_followup <= date('now','localtime','+3 days') AND stage NOT IN ('fechado','perdido')`
    ).get() as any).c as number;

    res.json({
      items: rows,
      summary: {
        ...summary, by_stage: byStage,
        win_rate, won_value: won.total,
        negotiation_value: negValue,
        overdue_followups: overdueFollowups,
        today_followups: todayFollowups,
        soon_followups: soonFollowups,
        lost_value: lost.total,
        lost_reasons: lostReasons,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar oportunidades' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT o.*, p.name as product_name, u.name as owner_name,
        CAST(ROUND(julianday('now') - julianday(COALESCE(o.stage_entered_at, o.created_at))) AS INTEGER) as days_in_stage
      FROM opportunities o
      LEFT JOIN products p ON p.id = o.product_id
      LEFT JOIN users    u ON u.id = o.owner_id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Oportunidade não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar oportunidade' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { title, client_name, value, stage, probability, expected_close_date,
            service_type, product_id, notes, temperature, next_followup, owner_id, source, lost_reason } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    const closedAt = stage === 'fechado' ? new Date().toISOString().split('T')[0] : null;
    const temp = ['frio','morno','quente'].includes(temperature) ? temperature : 'morno';

    const result = db.prepare(`
      INSERT INTO opportunities
        (title, client_name, value, stage, probability, expected_close_date,
         service_type, product_id, notes, closed_at, temperature,
         next_followup, owner_id, source, lost_reason, stage_entered_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(
      title, client_name || null, value || 0, stage || 'prospeccao', probability || 20,
      expected_close_date || null, service_type || null, product_id || null,
      notes || null, closedAt, temp,
      next_followup || null, owner_id || null, source || null, lost_reason || null,
    );

    res.status(201).json(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar oportunidade' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { title, client_name, value, stage, probability, expected_close_date,
            service_type, product_id, notes, temperature, next_followup, owner_id, source, lost_reason } = req.body;

    const existing = db.prepare('SELECT id, stage, closed_at FROM opportunities WHERE id = ?')
      .get(req.params.id) as { id: number; stage: string; closed_at: string | null } | undefined;
    if (!existing) return res.status(404).json({ error: 'Oportunidade não encontrada' });

    let closedAt = existing.closed_at;
    let stageEnteredAt: string | undefined;

    if (stage && stage !== existing.stage) {
      stageEnteredAt = "datetime('now')"; // will be inlined below
      if (stage === 'fechado') closedAt = new Date().toISOString().split('T')[0];
      else closedAt = null;
    }

    const temp = ['frio','morno','quente'].includes(temperature) ? temperature : 'morno';

    db.prepare(`
      UPDATE opportunities SET
        title = ?, client_name = ?, value = ?, stage = ?, probability = ?,
        expected_close_date = ?, service_type = ?, product_id = ?, notes = ?,
        closed_at = ?, temperature = ?, next_followup = ?, owner_id = ?, source = ?, lost_reason = ?,
        ${stageEnteredAt ? `stage_entered_at = datetime('now'),` : ''}
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title, client_name || null, value || 0, stage || 'prospeccao', probability || 20,
      expected_close_date || null, service_type || null, product_id || null,
      notes || null, closedAt, temp,
      next_followup || null, owner_id || null, source || null, lost_reason || null,
      req.params.id,
    );

    res.json(db.prepare(`
      SELECT o.*, u.name as owner_name,
        CAST(ROUND(julianday('now') - julianday(COALESCE(o.stage_entered_at, o.created_at))) AS INTEGER) as days_in_stage
      FROM opportunities o LEFT JOIN users u ON u.id = o.owner_id
      WHERE o.id = ?
    `).get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar oportunidade' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM opportunities WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar oportunidade' });
  }
});

export default router;
