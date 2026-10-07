import { Router } from 'express';

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

export default router;
