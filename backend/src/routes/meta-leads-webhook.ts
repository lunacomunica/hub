import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const ACCESS_TOKEN  = process.env.META_HUB_ACCESS_TOKEN  || '';
const VERIFY_TOKEN  = process.env.META_HUB_WEBHOOK_VERIFY_TOKEN || 'lunahub_verify';
const COMPANY_ID    = Number(process.env.META_HUB_COMPANY_ID || 1);
const API_VERSION   = 'v21.0';
const BASE          = `https://graph.facebook.com/${API_VERSION}`;

// ── Conversas ────────────────────────────────────────────────────────────────

let convTablesReady = false;
async function ensureConvTables() {
  if (convTablesReady) return;
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
  convTablesReady = true;
}

async function upsertConversation(platform: string, lunaAccountId: string, contactId: string, contactName: string, preview: string) {
  await ensureConvTables();
  // Try to find existing conversation
  const { rows } = await pool.query(
    `SELECT id FROM hub_conversations WHERE company_id=$1 AND platform=$2 AND contact_external_id=$3 LIMIT 1`,
    [COMPANY_ID, platform, contactId]
  );
  if (rows[0]) {
    await pool.query(
      `UPDATE hub_conversations SET last_message_at=NOW(), last_message_preview=$1, unread_count=unread_count+1, updated_at=NOW() WHERE id=$2`,
      [preview.substring(0, 100), rows[0].id]
    );
    return rows[0].id;
  }
  const { rows: [conv] } = await pool.query(
    `INSERT INTO hub_conversations (company_id, platform, luna_account_id, contact_external_id, contact_name, last_message_at, last_message_preview, unread_count)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,1) RETURNING id`,
    [COMPANY_ID, platform, lunaAccountId, contactId, contactName || contactId, preview.substring(0, 100)]
  );
  return conv.id;
}

async function saveMessage(convId: number, externalId: string, content: string, mediaUrl?: string, mediaType?: string) {
  // Deduplica por external_id
  const { rows } = await pool.query(
    `SELECT id FROM hub_messages WHERE external_id=$1 LIMIT 1`, [externalId]
  );
  if (rows[0]) return;
  await pool.query(
    `INSERT INTO hub_messages (conversation_id, external_id, direction, content, media_url, media_type, sent_at)
     VALUES ($1,$2,'inbound',$3,$4,$5,NOW())`,
    [convId, externalId, content || '', mediaUrl || null, mediaType || null]
  );
}

async function processInstagramMessage(entry: any) {
  for (const ev of (entry.messaging || [])) {
    if (ev.message?.is_echo) continue; // ignora mensagens enviadas pela conta
    const senderId    = ev.sender?.id;
    const recipientId = ev.recipient?.id; // Luna's IG account ID
    const mid         = ev.message?.mid || `ig_${Date.now()}`;
    const text        = ev.message?.text || '';
    const attach      = ev.message?.attachments?.[0];
    const mediaUrl    = attach?.payload?.url || null;
    const mediaType   = attach?.type || null;
    if (!senderId) continue;
    const convId = await upsertConversation('instagram', recipientId, senderId, senderId, text || '[mídia]');
    await saveMessage(convId, mid, text, mediaUrl, mediaType);
    console.log(`[webhook] instagram DM de ${senderId}`);
  }
}

async function processMessengerMessage(entry: any) {
  const pageId = entry.id;
  for (const ev of (entry.messaging || [])) {
    if (ev.message?.is_echo) continue;
    const senderId = ev.sender?.id;
    const mid      = ev.message?.mid || `msg_${Date.now()}`;
    const text     = ev.message?.text || '';
    const attach   = ev.message?.attachments?.[0];
    const mediaUrl = attach?.payload?.url || null;
    const mediaType = attach?.type || null;
    if (!senderId) continue;
    const convId = await upsertConversation('messenger', pageId, senderId, senderId, text || '[mídia]');
    await saveMessage(convId, mid, text, mediaUrl, mediaType);
    console.log(`[webhook] messenger de ${senderId}`);
  }
}

async function processWhatsAppMessage(entry: any) {
  for (const change of (entry.changes || [])) {
    const val = change.value;
    if (!val?.messages) continue;
    const phoneNumberId = val.metadata?.phone_number_id;
    const contacts: {wa_id: string; profile: {name: string}}[] = val.contacts || [];

    for (const msg of val.messages) {
      const waId    = msg.from;
      const mid     = msg.id || `wa_${Date.now()}`;
      const text    = msg.text?.body || msg.caption || '';
      const mediaUrl  = null; // mídia requer download extra — ignorar por agora
      const mediaType = msg.type !== 'text' ? msg.type : null;
      const contact   = contacts.find(c => c.wa_id === waId);
      const name      = contact?.profile?.name || waId;
      const preview   = text || `[${msg.type}]`;
      const convId = await upsertConversation('whatsapp', phoneNumberId, waId, name, preview);
      await saveMessage(convId, mid, text, mediaUrl || undefined, mediaType || undefined);
      console.log(`[webhook] whatsapp de ${waId} (${name})`);
    }
  }
}

// GET — verificação do webhook pela Meta
router.get('/', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
});

// POST — recebe eventos da Meta (leadgen + messages)
router.post('/', async (req: Request, res: Response) => {
  res.status(200).json({ ok: true }); // responde rápido para a Meta

  try {
    const body = req.body;

    // WhatsApp Business Account
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        await processWhatsAppMessage(entry).catch(e =>
          console.error('[webhook] whatsapp erro:', e)
        );
      }
      return;
    }

    if (body.object !== 'page' && body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      // Instagram DM / Messenger — messaging array
      if (entry.messaging?.length) {
        if (body.object === 'instagram') {
          await processInstagramMessage(entry).catch(e =>
            console.error('[webhook] instagram erro:', e)
          );
        } else {
          await processMessengerMessage(entry).catch(e =>
            console.error('[webhook] messenger erro:', e)
          );
        }
      }

      // Leadgen + outros campos via changes
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          await processLead(change.value).catch(e =>
            console.error('[webhook] leadgen erro:', e)
          );
        }
      }
    }
  } catch (e) {
    console.error('[meta-leads-webhook] erro:', e);
  }
});

async function processLead(v: any) {
  const leadgenId    = v.leadgen_id;
  const campaignName = v.campaign_name || null;
  const adName       = v.ad_name       || null;
  const adsetName    = v.adset_name    || null;

  // Busca dados do lead (nome, telefone, email, etc.)
  let name = 'Lead Meta Ads';
  let phone: string | null = null;
  let email: string | null = null;

  try {
    const r = await fetch(`${BASE}/${leadgenId}?fields=field_data&access_token=${ACCESS_TOKEN}`);
    const data = await r.json() as any;
    const fields: {name: string; values: string[]}[] = data.field_data || [];
    for (const f of fields) {
      const val = f.values?.[0] || '';
      const key = f.name.toLowerCase();
      if (key.includes('name') || key === 'full_name') name = val || name;
      if (key.includes('phone') || key === 'phone_number') phone = val || null;
      if (key.includes('email')) email = val || null;
    }
  } catch (e) {
    console.error('[meta-leads-webhook] erro ao buscar lead data:', e);
  }

  // Garante colunas extras existem (self-healing)
  const extraCols = [
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_campanha TEXT`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_criativo TEXT`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_meio TEXT`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_especialidade TEXT`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_possui_rqe BOOLEAN`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_tipo VARCHAR(1)`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT`,
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_email TEXT`,
  ];
  for (const sql of extraCols) {
    await pool.query(sql).catch(() => {});
  }

  // Busca o primeiro estágio do funil
  const { rows: stages } = await pool.query(
    'SELECT key FROM pipeline_stages WHERE is_terminal = 0 ORDER BY position ASC LIMIT 1'
  );
  const stage = stages[0]?.key || 'prospeccao';

  // Cria a oportunidade
  const title = name !== 'Lead Meta Ads' ? name : (campaignName ? `Lead — ${campaignName}` : 'Lead Meta Ads');

  const { rows: [opp] } = await pool.query(
    `INSERT INTO opportunities
      (title, client_name, stage, probability, temperature, source,
       lead_campanha, lead_criativo, lead_meio,
       contact_whatsapp, contact_email, company_id, value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      title, name, stage, 10, 'frio', 'Meta Ads',
      campaignName, adName || adsetName, 'formulario_nativo',
      phone, email, COMPANY_ID, 0,
    ]
  );

  console.log(`[meta-leads-webhook] lead criado: id=${opp?.id} nome="${title}" campanha="${campaignName}"`);
}

export default router;
