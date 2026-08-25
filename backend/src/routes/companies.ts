import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();
const isAdmin = (req: Request) => (req as any).user?.role === 'admin';
const userId  = (req: Request): number => (req as any).user?.id;

// GET /api/companies — companies the user can access
router.get('/', async (req: Request, res: Response) => {
  try {
    if (isAdmin(req)) {
      const { rows } = await pool.query(
        `SELECT c.*, COUNT(uc.user_id) as user_count
         FROM companies c
         LEFT JOIN user_companies uc ON uc.company_id = c.id
         WHERE c.active = 1
         GROUP BY c.id
         ORDER BY c.id`
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `SELECT c.*
       FROM companies c
       JOIN user_companies uc ON uc.company_id = c.id
       WHERE uc.user_id = $1 AND c.active = 1
       ORDER BY c.id`,
      [userId(req)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar empresas' }); }
});

// POST /api/companies — create (admin only)
router.post('/', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { rows: [company] } = await pool.query(
      `INSERT INTO companies (name, slug, color) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), slug, color || '#3b82f6']
    );
    res.status(201).json(company);
  } catch (e: any) {
    if (e.code === '23505') return res.status(400).json({ error: 'Já existe uma empresa com esse nome' });
    res.status(500).json({ error: 'Erro ao criar empresa' });
  }
});

// PUT /api/companies/:id — update (admin only)
router.put('/:id', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { name, color, active } = req.body;
    await pool.query(
      `UPDATE companies SET name=$1, color=$2, active=$3 WHERE id=$4`,
      [name, color || '#3b82f6', active !== false ? 1 : 0, req.params.id]
    );
    const { rows: [updated] } = await pool.query(`SELECT * FROM companies WHERE id=$1`, [req.params.id]);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar empresa' }); }
});

// GET /api/companies/consolidated?month=&year= — financial + commercial summary per company
router.get('/consolidated', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const monthParam = parseInt(req.query.month as string) || 0;
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const isAnnual = !monthParam;
    const month = monthParam || (now.getMonth() + 1);

    const startDate = isAnnual ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate   = isAnnual ? `${year}-12-31` : `${year}-${String(month).padStart(2, '0')}-31`;

    // Companies this user can access
    let companiesRows;
    if (isAdmin(req)) {
      const { rows } = await pool.query(
        `SELECT id, name, color, slug FROM companies WHERE active = 1 ORDER BY id`
      );
      companiesRows = rows;
    } else {
      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.color, c.slug
         FROM companies c
         JOIN user_companies uc ON uc.company_id = c.id
         WHERE uc.user_id = $1 AND c.active = 1
         ORDER BY c.id`,
        [userId(req)]
      );
      companiesRows = rows;
    }

    if (companiesRows.length === 0) return res.json({ companies: [], totals: null, trend: [] });

    // Per-company financial + commercial data
    const companies = await Promise.all(companiesRows.map(async (c: { id: number; name: string; color: string; slug: string }) => {
      const [revRow, expRow, clientsRow, oppsRow, wonRow] = await Promise.all([
        pool.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0) as total FROM financial_revenues
           WHERE company_id = $1 AND date >= $2 AND date <= $3 AND status != 'cancelado'`,
          [c.id, startDate, endDate]
        ),
        pool.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount), 0) as total FROM financial_expenses
           WHERE company_id = $1 AND date >= $2 AND date <= $3 AND status != 'cancelado'`,
          [c.id, startDate, endDate]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM agency_clients WHERE company_id = $1 AND active = 1`,
          [c.id]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM opportunities
           WHERE company_id = $1 AND stage NOT IN ('fechado','perdido')`,
          [c.id]
        ),
        pool.query<{ total: string }>(
          `SELECT COALESCE(SUM(value), 0) as total FROM opportunities
           WHERE company_id = $1 AND stage = 'fechado'
             AND closed_at >= $2 AND closed_at <= $3`,
          [c.id, startDate, endDate]
        ),
      ]);

      const revenue  = Number(revRow.rows[0].total);
      const expenses = Number(expRow.rows[0].total);
      const profit   = revenue - expenses;
      return {
        id: c.id, name: c.name, color: c.color, slug: c.slug,
        revenue, expenses, profit,
        profit_margin: revenue > 0 ? (profit / revenue) * 100 : 0,
        active_clients: Number(clientsRow.rows[0].count),
        open_opportunities: Number(oppsRow.rows[0].count),
        won_value: Number(wonRow.rows[0].total),
      };
    }));

    // 6-month trend per company
    const trendMonths: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      trendMonths.push({
        key: `${yy}-${mm}`,
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
      });
    }
    const trendStart = trendMonths[0].key + '-01';
    const trendEnd   = trendMonths[trendMonths.length - 1].key + '-31';
    const companyIds = companiesRows.map((c: { id: number }) => c.id);
    const idPlaceholders = companyIds.map((_: unknown, i: number) => `$${i + 3}`).join(',');

    const [trendRev, trendExp] = await Promise.all([
      pool.query<{ company_id: string; month_key: string; total: string }>(
        `SELECT company_id, SUBSTRING(date, 1, 7) as month_key, COALESCE(SUM(amount),0) as total
         FROM financial_revenues
         WHERE date >= $1 AND date <= $2 AND company_id IN (${idPlaceholders}) AND status != 'cancelado'
         GROUP BY company_id, SUBSTRING(date, 1, 7)`,
        [trendStart, trendEnd, ...companyIds]
      ),
      pool.query<{ company_id: string; month_key: string; total: string }>(
        `SELECT company_id, SUBSTRING(date, 1, 7) as month_key, COALESCE(SUM(amount),0) as total
         FROM financial_expenses
         WHERE date >= $1 AND date <= $2 AND company_id IN (${idPlaceholders}) AND status != 'cancelado'
         GROUP BY company_id, SUBSTRING(date, 1, 7)`,
        [trendStart, trendEnd, ...companyIds]
      ),
    ]);

    // Build trend map: month_key -> company_id -> { revenue, expenses }
    const trendMap: Record<string, Record<number, { revenue: number; expenses: number }>> = {};
    for (const { key } of trendMonths) trendMap[key] = {};
    for (const r of trendRev.rows) trendMap[r.month_key] = { ...trendMap[r.month_key], [Number(r.company_id)]: { revenue: Number(r.total), expenses: 0 } };
    for (const r of trendExp.rows) {
      const cid = Number(r.company_id);
      if (!trendMap[r.month_key][cid]) trendMap[r.month_key][cid] = { revenue: 0, expenses: 0 };
      trendMap[r.month_key][cid].expenses = Number(r.total);
    }

    const trend = trendMonths.map(({ key, label }) => {
      const entry: Record<string, unknown> = { month: label };
      let totalRev = 0, totalExp = 0;
      for (const c of companies) {
        const d = trendMap[key]?.[c.id] || { revenue: 0, expenses: 0 };
        entry[`rev_${c.id}`] = d.revenue;
        entry[`exp_${c.id}`] = d.expenses;
        entry[`profit_${c.id}`] = d.revenue - d.expenses;
        totalRev += d.revenue;
        totalExp += d.expenses;
      }
      entry['rev_total'] = totalRev;
      entry['exp_total'] = totalExp;
      entry['profit_total'] = totalRev - totalExp;
      return entry;
    });

    // Consolidated totals
    const totals = {
      revenue:  companies.reduce((s, c) => s + c.revenue, 0),
      expenses: companies.reduce((s, c) => s + c.expenses, 0),
      profit:   companies.reduce((s, c) => s + c.profit, 0),
      active_clients: companies.reduce((s, c) => s + c.active_clients, 0),
      open_opportunities: companies.reduce((s, c) => s + c.open_opportunities, 0),
      won_value: companies.reduce((s, c) => s + c.won_value, 0),
    };
    (totals as { profit_margin?: number }).profit_margin =
      totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

    res.json({ companies, totals, trend });
  } catch (e) {
    console.error('[consolidated]', e);
    res.status(500).json({ error: 'Erro ao buscar consolidado' });
  }
});

// GET /api/companies/:id/users — list users of a company (admin)
router.get('/:id/users', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.active
       FROM users u
       JOIN user_companies uc ON uc.user_id = u.id
       WHERE uc.company_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar usuários' }); }
});

// POST /api/companies/:id/users — add user to company (admin)
router.post('/:id/users', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { user_id } = req.body;
    await pool.query(
      `INSERT INTO user_companies (user_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user_id, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar usuário' }); }
});

// DELETE /api/companies/:id/users/:userId — remove user from company (admin)
router.delete('/:id/users/:userId', async (req: Request, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    await pool.query(
      `DELETE FROM user_companies WHERE company_id=$1 AND user_id=$2`,
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover usuário' }); }
});

export default router;
