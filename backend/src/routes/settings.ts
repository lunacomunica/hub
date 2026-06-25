import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /settings — returns all company settings + computed values
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM company_settings`);
    const raw: Record<string, string> = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));

    const monthly_billable_hours = Number(raw.monthly_billable_hours || 160);

    // Lead sources
    const DEFAULT_SOURCES = ['Indicação','Instagram','LinkedIn','Site','Evento','Google Ads','Meta Ads','Turbinar Instagram','Instagram @vanessaraeski','TikTok @vanessaraeski','WhatsApp','Outro'];
    let lead_sources: string[] = DEFAULT_SOURCES;
    try {
      if (raw.lead_sources) {
        const saved: string[] = JSON.parse(raw.lead_sources);
        // Merge: keep saved order, append any new defaults not yet present
        const merged = [...saved];
        for (const s of DEFAULT_SOURCES) {
          if (!merged.includes(s)) {
            const outroIdx = merged.indexOf('Outro');
            if (outroIdx >= 0) merged.splice(outroIdx, 0, s);
            else merged.push(s);
          }
        }
        lead_sources = merged;
      }
    } catch { /* keep defaults */ }

    // Average fixed costs from last 3 complete months
    const { rows: [fixedRow] } = await pool.query<{ avg_fixed: string }>(`
      SELECT COALESCE(AVG(monthly_total), 0) as avg_fixed
      FROM (
        SELECT SUM(amount) as monthly_total
        FROM financial_expenses
        WHERE is_fixed = 1 AND is_client_cost = 0
          AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-01')
          AND date < TO_CHAR(DATE_TRUNC('month', CURRENT_DATE), 'YYYY-MM-DD')
        GROUP BY TO_CHAR(date::date, 'YYYY-MM')
        LIMIT 3
      ) sub
    `);
    const avg_fixed_costs = Number(fixedRow.avg_fixed);
    const hour_cost = monthly_billable_hours > 0 ? avg_fixed_costs / monthly_billable_hours : 0;

    const stale_threshold = Number(raw.stale_threshold || 7);

    let source_monthly_goals: Record<string, number> = {};
    try {
      if (raw.source_monthly_goals) source_monthly_goals = JSON.parse(raw.source_monthly_goals);
    } catch { /* keep empty */ }

    res.json({ monthly_billable_hours, avg_fixed_costs, hour_cost, lead_sources, stale_threshold, source_monthly_goals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// PUT /settings — upsert key-value pairs
router.put('/', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, string | number>;
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO company_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

export default router;
