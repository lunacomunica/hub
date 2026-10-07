import { Router } from 'express';
import pool from '../db';

const router = Router();

const AD_ACCOUNT_ID = process.env.META_HUB_AD_ACCOUNT_ID || '';
const ACCESS_TOKEN  = process.env.META_HUB_ACCESS_TOKEN  || '';
const API_VERSION   = 'v21.0';
const BASE          = `https://graph.facebook.com/${API_VERSION}`;

// GET /api/meta-ads/campaigns — lista campanhas ativas
router.get('/campaigns', async (_req, res) => {
  try {
    const url = `${BASE}/${AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&limit=100&access_token=${ACCESS_TOKEN}`;
    const r = await fetch(url);
    const data = await r.json() as any;
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json(data.data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/meta-ads/adsets?campaign_id=xxx — conjuntos de anúncios de uma campanha
router.get('/adsets', async (req, res) => {
  const { campaign_id } = req.query;
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id obrigatório' });
  try {
    const url = `${BASE}/${campaign_id}/adsets?fields=id,name,status&limit=100&access_token=${ACCESS_TOKEN}`;
    const r = await fetch(url);
    const data = await r.json() as any;
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json(data.data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/meta-ads/ads?adset_id=xxx — criativos de um conjunto
router.get('/ads', async (req, res) => {
  const { adset_id } = req.query;
  if (!adset_id) return res.status(400).json({ error: 'adset_id obrigatório' });
  try {
    const url = `${BASE}/${adset_id}/ads?fields=id,name,status,creative{title,body,image_url}&limit=100&access_token=${ACCESS_TOKEN}`;
    const r = await fetch(url);
    const data = await r.json() as any;
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json(data.data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/meta-ads/import-leads — importa leads históricos da central de leads da Meta
router.post('/import-leads', async (_req, res) => {
  const COMPANY_ID = Number(process.env.META_HUB_COMPANY_ID || 1);

  try {
    // 1. Garante colunas
    const cols = [
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_campanha TEXT`,
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_criativo TEXT`,
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_meio TEXT`,
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT`,
      `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_email TEXT`,
    ];
    for (const sql of cols) await pool.query(sql).catch(() => {});

    // 2. Busca o primeiro estágio do funil
    const { rows: stages } = await pool.query(
      'SELECT key FROM pipeline_stages WHERE is_terminal = 0 ORDER BY position ASC LIMIT 1'
    );
    const stage = stages[0]?.key || 'prospeccao';

    // 3. Busca todos os formulários de lead da conta
    const formsUrl = `${BASE}/${AD_ACCOUNT_ID}/leadgen_forms?fields=id,name,leads_count&limit=50&access_token=${ACCESS_TOKEN}`;
    const formsRes = await fetch(formsUrl);
    const formsData = await formsRes.json() as any;
    if (formsData.error) return res.status(400).json({ error: formsData.error.message });

    const forms: {id:string;name:string}[] = formsData.data || [];
    let imported = 0;
    let skipped = 0;

    // 4. Para cada formulário, busca os leads
    for (const form of forms) {
      let url: string | null = `${BASE}/${form.id}/leads?fields=field_data,created_time,ad_id,ad_name,adset_name,campaign_id,campaign_name&limit=100&access_token=${ACCESS_TOKEN}`;

      while (url) {
        const r = await fetch(url);
        const data = await r.json() as any;
        const leads: any[] = data.data || [];

        for (const lead of leads) {
          // Extrai campos do formulário
          let name = 'Lead Meta Ads';
          let phone: string | null = null;
          let email: string | null = null;

          for (const f of (lead.field_data || [])) {
            const val = f.values?.[0] || '';
            const key = (f.name || '').toLowerCase();
            if (key.includes('name') || key === 'full_name') name = val || name;
            if (key.includes('phone') || key === 'phone_number') phone = val || null;
            if (key.includes('email')) email = val || null;
          }

          // Deduplica por telefone ou email
          if (phone || email) {
            const { rows: existing } = await pool.query(
              `SELECT id FROM opportunities WHERE company_id=$1 AND (
                ($2::text IS NOT NULL AND contact_whatsapp=$2) OR
                ($3::text IS NOT NULL AND contact_email=$3)
              ) LIMIT 1`,
              [COMPANY_ID, phone, email]
            );
            if (existing.length > 0) { skipped++; continue; }
          }

          const campaignName = lead.campaign_name || null;
          const adName       = lead.ad_name       || null;
          const adsetName    = lead.adset_name    || null;
          const title        = name !== 'Lead Meta Ads' ? name : (campaignName ? `Lead — ${campaignName}` : 'Lead Meta Ads');

          await pool.query(
            `INSERT INTO opportunities
              (title, client_name, stage, probability, temperature, source,
               lead_campanha, lead_criativo, lead_meio,
               contact_whatsapp, contact_email, company_id, value)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [title, name, stage, 10, 'frio', 'Meta Ads',
             campaignName, adName || adsetName, 'formulario_nativo',
             phone, email, COMPANY_ID, 0]
          );
          imported++;
        }

        // Paginação
        url = data.paging?.next || null;
      }
    }

    res.json({ ok: true, imported, skipped, forms: forms.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
