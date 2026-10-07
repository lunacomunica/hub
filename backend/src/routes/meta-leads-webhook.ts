import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const ACCESS_TOKEN  = process.env.META_HUB_ACCESS_TOKEN  || '';
const VERIFY_TOKEN  = process.env.META_HUB_WEBHOOK_VERIFY_TOKEN || 'lunahub_verify';
const COMPANY_ID    = Number(process.env.META_HUB_COMPANY_ID || 1);
const API_VERSION   = 'v21.0';
const BASE          = `https://graph.facebook.com/${API_VERSION}`;

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

// POST — recebe evento de novo lead
router.post('/', async (req: Request, res: Response) => {
  res.status(200).json({ ok: true }); // responde rápido para a Meta

  try {
    const body = req.body;
    if (body.object !== 'page' && body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue;
        const v = change.value;
        await processLead(v);
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
