import { Router, Request, Response } from 'express';
import pool from '../db';

const router  = Router();
const COMPANY = Number(process.env.META_HUB_COMPANY_ID || 1);

let ready = false;
async function ensureTables() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mkt_investments (
      id           SERIAL PRIMARY KEY,
      company_id   INT            NOT NULL DEFAULT 1,
      campanha     TEXT           NOT NULL,
      criativo     TEXT           NOT NULL,
      periodo      DATE           NOT NULL,
      investimento NUMERIC(12,2)  NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ    DEFAULT NOW(),
      updated_at   TIMESTAMPTZ    DEFAULT NOW(),
      UNIQUE(company_id, campanha, criativo, periodo)
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mkt_goals (
      id         SERIAL PRIMARY KEY,
      company_id INT           NOT NULL DEFAULT 1,
      mes        DATE          NOT NULL,
      indicador  TEXT          NOT NULL,
      meta       NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ   DEFAULT NOW(),
      UNIQUE(company_id, mes, indicador)
    )
  `).catch(() => {});
  ready = true;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function monthStart(m?: string) {
  // m = 'YYYY-MM' ou undefined (usa mês atual)
  const d = m ? new Date(`${m}-01`) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ─── GET /api/metrics/dashboard?mes=YYYY-MM ──────────────────────────────────
router.get('/dashboard', async (req: Request, res: Response) => {
  await ensureTables();
  const mes = monthStart(req.query.mes as string);
  try {
    // 1. Leads do mês (oportunidades criadas no mês)
    const { rows: [leadsRow] } = await pool.query(`
      SELECT
        COUNT(*)                                            AS total_leads,
        COUNT(*) FILTER (WHERE lead_tipo = 'A')             AS leads_a,
        COUNT(*) FILTER (WHERE lead_tipo = 'B')             AS leads_b,
        COUNT(*) FILTER (WHERE lead_tipo = 'C')             AS leads_c,
        COUNT(*) FILTER (WHERE lead_tipo IS NULL)           AS leads_sem_tipo
      FROM opportunities
      WHERE company_id = $1
        AND DATE_TRUNC('month', created_at) = $2::date
    `, [COMPANY, mes]);

    // 2. Fechamentos e faturamento (oportunidades atualizadas no mês em stage terminal not-lost)
    const { rows: [wonRow] } = await pool.query(`
      SELECT
        COUNT(o.*)                                          AS fechados,
        COUNT(o.*) FILTER (WHERE o.lead_tipo = 'A')        AS fechados_a,
        COALESCE(SUM(o.value),0)                            AS faturamento
      FROM opportunities o
      JOIN pipeline_stages ps ON ps.key = o.stage
      WHERE o.company_id = $1
        AND ps.is_terminal = 1
        AND ps.key NOT ILIKE '%perd%'
        AND ps.key NOT ILIKE '%lost%'
        AND ps.key NOT ILIKE '%cancel%'
        AND DATE_TRUNC('month', o.updated_at) = $2::date
    `, [COMPANY, mes]);

    // 3. Investimento total do mês
    const { rows: [invRow] } = await pool.query(`
      SELECT COALESCE(SUM(investimento),0) AS investimento
      FROM mkt_investments
      WHERE company_id = $1 AND DATE_TRUNC('month', periodo) = $2::date
    `, [COMPANY, mes]);

    // 4. Metas do mês
    const { rows: goals } = await pool.query(`
      SELECT indicador, meta FROM mkt_goals
      WHERE company_id = $1 AND DATE_TRUNC('month', mes) = $2::date
    `, [COMPANY, mes]);

    const total    = Number(leadsRow.total_leads) || 0;
    const leadsA   = Number(leadsRow.leads_a)     || 0;
    const leadsB   = Number(leadsRow.leads_b)     || 0;
    const fechados = Number(wonRow.fechados)       || 0;
    const fatur    = Number(wonRow.faturamento)    || 0;
    const invest   = Number(invRow.investimento)   || 0;
    const mql      = leadsA + leadsB;

    const goalsMap: Record<string, number> = {};
    for (const g of goals) goalsMap[g.indicador] = Number(g.meta);

    res.json({
      mes,
      kpis: {
        total_leads:        total,
        leads_a:            leadsA,
        leads_b:            leadsB,
        leads_c:            Number(leadsRow.leads_c) || 0,
        mql,
        pct_mql:            total > 0 ? mql / total : 0,
        pct_lead_a:         total > 0 ? leadsA / total : 0,
        investimento:       invest,
        cpl:                total > 0 && invest > 0 ? invest / total : null,
        cpl_a:              leadsA > 0 && invest > 0 ? invest / leadsA : null,
        fechados,
        fechados_a:         Number(wonRow.fechados_a) || 0,
        faturamento:        fatur,
        ticket_medio:       fechados > 0 ? fatur / fechados : null,
        roas:               invest > 0 ? fatur / invest : null,
        cac:                fechados > 0 && invest > 0 ? invest / fechados : null,
        win_rate:           total > 0 ? fechados / total : 0,
        win_rate_a:         leadsA > 0 ? (Number(wonRow.fechados_a) || 0) / leadsA : 0,
      },
      goals: goalsMap,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/metrics/by-creative?mes=YYYY-MM ────────────────────────────────
router.get('/by-creative', async (req: Request, res: Response) => {
  await ensureTables();
  const mes = monthStart(req.query.mes as string);
  try {
    const { rows: leadsRows } = await pool.query(`
      SELECT
        COALESCE(lead_criativo, '(sem criativo)')   AS criativo,
        COALESCE(lead_campanha, '(sem campanha)')   AS campanha,
        COUNT(*)                                    AS leads,
        COUNT(*) FILTER (WHERE lead_tipo = 'A')     AS leads_a,
        COUNT(*) FILTER (WHERE lead_tipo = 'B')     AS leads_b,
        COUNT(*) FILTER (WHERE lead_tipo = 'C')     AS leads_c
      FROM opportunities
      WHERE company_id = $1
        AND DATE_TRUNC('month', created_at) = $2::date
      GROUP BY 1, 2
      ORDER BY leads DESC
    `, [COMPANY, mes]);

    const { rows: wonRows } = await pool.query(`
      SELECT
        COALESCE(o.lead_criativo, '(sem criativo)') AS criativo,
        COALESCE(o.lead_campanha, '(sem campanha)') AS campanha,
        COUNT(o.*)                                   AS fechados,
        COUNT(o.*) FILTER (WHERE o.lead_tipo = 'A') AS fechados_a,
        COALESCE(SUM(o.value),0)                     AS faturamento
      FROM opportunities o
      JOIN pipeline_stages ps ON ps.key = o.stage
      WHERE o.company_id = $1
        AND ps.is_terminal = 1
        AND ps.key NOT ILIKE '%perd%'
        AND ps.key NOT ILIKE '%lost%'
        AND ps.key NOT ILIKE '%cancel%'
        AND DATE_TRUNC('month', o.updated_at) = $2::date
      GROUP BY 1, 2
    `, [COMPANY, mes]);

    const { rows: invRows } = await pool.query(`
      SELECT criativo, campanha, SUM(investimento) AS investimento
      FROM mkt_investments
      WHERE company_id = $1 AND DATE_TRUNC('month', periodo) = $2::date
      GROUP BY criativo, campanha
    `, [COMPANY, mes]);

    // Merge
    const wonMap: Record<string, any> = {};
    for (const r of wonRows) wonMap[`${r.campanha}|${r.criativo}`] = r;
    const invMap: Record<string, number> = {};
    for (const r of invRows) invMap[`${r.campanha}|${r.criativo}`] = Number(r.investimento);

    const rows = leadsRows.map(r => {
      const key     = `${r.campanha}|${r.criativo}`;
      const won     = wonMap[key] || {};
      const invest  = invMap[key] || 0;
      const leads   = Number(r.leads);
      const leadsA  = Number(r.leads_a);
      const fechados = Number(won.fechados || 0);
      const fatur   = Number(won.faturamento || 0);
      return {
        criativo:     r.criativo,
        campanha:     r.campanha,
        leads,
        leads_a:      leadsA,
        leads_b:      Number(r.leads_b),
        leads_c:      Number(r.leads_c),
        pct_lead_a:   leads > 0 ? leadsA / leads : 0,
        investimento: invest,
        cpl:          leads > 0 && invest > 0 ? invest / leads : null,
        cpl_a:        leadsA > 0 && invest > 0 ? invest / leadsA : null,
        fechados,
        fechados_a:   Number(won.fechados_a || 0),
        faturamento:  fatur,
        roas:         invest > 0 ? fatur / invest : null,
        win_rate_a:   leadsA > 0 ? Number(won.fechados_a || 0) / leadsA : 0,
      };
    });

    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/metrics/trend?months=6 ────────────────────────────────────────
router.get('/trend', async (req: Request, res: Response) => {
  await ensureTables();
  const months = Math.min(Number(req.query.months) || 6, 24);
  try {
    const { rows } = await pool.query(`
      WITH months AS (
        SELECT DATE_TRUNC('month', NOW() - (generate_series(0, $2-1) || ' months')::interval) AS mes
      )
      SELECT
        TO_CHAR(m.mes, 'YYYY-MM')                              AS mes,
        COUNT(o.id)                                            AS leads,
        COUNT(o.id) FILTER (WHERE o.lead_tipo IN ('A','B'))    AS mql,
        COUNT(o.id) FILTER (WHERE o.lead_tipo = 'A')           AS leads_a,
        COALESCE((
          SELECT SUM(i.investimento)
          FROM mkt_investments i
          WHERE i.company_id = $1 AND DATE_TRUNC('month', i.periodo) = m.mes
        ), 0) AS investimento
      FROM months m
      LEFT JOIN opportunities o
        ON o.company_id = $1
        AND DATE_TRUNC('month', o.created_at) = m.mes
      GROUP BY m.mes
      ORDER BY m.mes ASC
    `, [COMPANY, months]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/metrics/investments?mes=YYYY-MM ────────────────────────────────
router.get('/investments', async (req: Request, res: Response) => {
  await ensureTables();
  const mes = monthStart(req.query.mes as string);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM mkt_investments WHERE company_id=$1 AND DATE_TRUNC('month',periodo)=$2::date ORDER BY campanha,criativo`,
      [COMPANY, mes]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/metrics/investments ──────────────────────────────────────────
router.post('/investments', async (req: Request, res: Response) => {
  await ensureTables();
  const { campanha, criativo, periodo, investimento } = req.body;
  if (!campanha || !criativo || !periodo) return res.status(400).json({ error: 'campanha, criativo e periodo são obrigatórios' });
  try {
    const { rows: [row] } = await pool.query(`
      INSERT INTO mkt_investments (company_id, campanha, criativo, periodo, investimento)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (company_id, campanha, criativo, periodo)
      DO UPDATE SET investimento=$5, updated_at=NOW()
      RETURNING *
    `, [COMPANY, campanha, criativo, periodo, investimento || 0]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /api/metrics/investments/:id ─────────────────────────────────────
router.delete('/investments/:id', async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM mkt_investments WHERE id=$1 AND company_id=$2`, [req.params.id, COMPANY]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/metrics/goals?mes=YYYY-MM ─────────────────────────────────────
router.get('/goals', async (req: Request, res: Response) => {
  await ensureTables();
  const mes = monthStart(req.query.mes as string);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM mkt_goals WHERE company_id=$1 AND DATE_TRUNC('month',mes)=$2::date`,
      [COMPANY, mes]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PUT /api/metrics/goals ──────────────────────────────────────────────────
router.put('/goals', async (req: Request, res: Response) => {
  await ensureTables();
  const { mes, indicador, meta } = req.body;
  if (!mes || !indicador) return res.status(400).json({ error: 'mes e indicador são obrigatórios' });
  try {
    const { rows: [row] } = await pool.query(`
      INSERT INTO mkt_goals (company_id, mes, indicador, meta)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (company_id, mes, indicador)
      DO UPDATE SET meta=$4
      RETURNING *
    `, [COMPANY, mes, indicador, meta || 0]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
