import { Router, Request, Response } from 'express';
import pool from '../db';

const router  = Router();
const TOKEN   = process.env.META_HUB_ACCESS_TOKEN || '';
const VER     = 'v21.0';
const BASE    = `https://graph.facebook.com/${VER}`;
const COMPANY = Number(process.env.META_HUB_COMPANY_ID || 1);

let ready = false;
async function ensureTables() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_conversations (
      id                   SERIAL PRIMARY KEY,
      company_id           INT          NOT NULL DEFAULT 1,
      platform             VARCHAR(20)  NOT NULL,
      external_id          VARCHAR(255),
      luna_account_id      VARCHAR(255),
      contact_name         VARCHAR(255),
      contact_external_id  VARCHAR(255),
      contact_avatar_url   TEXT,
      last_message_at      TIMESTAMPTZ,
      last_message_preview TEXT,
      unread_count         INT          DEFAULT 0,
      status               VARCHAR(20)  DEFAULT 'open',
      opportunity_id       INT,
      created_at           TIMESTAMPTZ  DEFAULT NOW(),
      updated_at           TIMESTAMPTZ  DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_messages (
      id              SERIAL PRIMARY KEY,
      conversation_id INT         NOT NULL,
      external_id     VARCHAR(255),
      direction       VARCHAR(10) NOT NULL,
      content         TEXT,
      media_url       TEXT,
      media_type      VARCHAR(50),
      sent_by         VARCHAR(255),
      sent_at         TIMESTAMPTZ DEFAULT NOW(),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  ready = true;
}

// GET /api/hub-conversations
router.get('/', async (req: Request, res: Response) => {
  await ensureTables();
  const { status, platform } = req.query;
  try {
    const params: any[] = [COMPANY];
    let q = `SELECT * FROM hub_conversations WHERE company_id=$1`;
    if (status && status !== 'all') { q += ` AND status=$${params.length + 1}`; params.push(status); }
    if (platform)                   { q += ` AND platform=$${params.length + 1}`; params.push(platform); }
    q += ' ORDER BY last_message_at DESC NULLS LAST LIMIT 100';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/hub-conversations/:id/messages
router.get('/:id/messages', async (req: Request, res: Response) => {
  await ensureTables();
  try {
    const { rows } = await pool.query(
      `SELECT * FROM hub_messages WHERE conversation_id=$1 ORDER BY sent_at ASC LIMIT 200`,
      [req.params.id]
    );
    await pool.query(`UPDATE hub_conversations SET unread_count=0, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/hub-conversations/:id/reply
router.post('/:id/reply', async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM hub_conversations WHERE id=$1 AND company_id=$2`,
      [req.params.id, COMPANY]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Conversa não encontrada' });
    const conv = rows[0];

    let apiUrl = '';
    let payload: any = {};
    let headers: any = { 'Content-Type': 'application/json' };

    if (conv.platform === 'instagram') {
      apiUrl = `${BASE}/${conv.luna_account_id}/messages`;
      payload = { recipient: { id: conv.contact_external_id }, message: { text }, access_token: TOKEN };
    } else if (conv.platform === 'messenger') {
      apiUrl = `${BASE}/me/messages`;
      payload = { recipient: { id: conv.contact_external_id }, message: { text }, access_token: TOKEN };
    } else if (conv.platform === 'whatsapp') {
      apiUrl = `${BASE}/${conv.luna_account_id}/messages`;
      headers.Authorization = `Bearer ${TOKEN}`;
      payload = { messaging_product: 'whatsapp', to: conv.contact_external_id, type: 'text', text: { body: text } };
    } else {
      return res.status(400).json({ error: `Plataforma desconhecida: ${conv.platform}` });
    }

    const r   = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await r.json() as any;
    if (data.error) return res.status(400).json({ error: data.error.message });

    const user = (req as any).user;
    const { rows: [msg] } = await pool.query(
      `INSERT INTO hub_messages (conversation_id, external_id, direction, content, sent_by, sent_at)
       VALUES ($1,$2,'outbound',$3,$4,NOW()) RETURNING *`,
      [conv.id, data.message_id || null, text, user?.name || 'Luna']
    );
    await pool.query(
      `UPDATE hub_conversations SET last_message_at=NOW(), last_message_preview=$1, updated_at=NOW() WHERE id=$2`,
      [text.substring(0, 100), conv.id]
    );
    res.json(msg);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/hub-conversations/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { status, opportunity_id } = req.body;
  try {
    const sets: string[] = ['updated_at=NOW()'];
    const vals: any[]   = [];
    if (status !== undefined)         { sets.push(`status=$${vals.length + 1}`);         vals.push(status); }
    if (opportunity_id !== undefined) { sets.push(`opportunity_id=$${vals.length + 1}`); vals.push(opportunity_id); }
    vals.push(COMPANY, req.params.id);
    await pool.query(
      `UPDATE hub_conversations SET ${sets.join(',')} WHERE company_id=$${vals.length - 1} AND id=$${vals.length}`,
      vals
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
