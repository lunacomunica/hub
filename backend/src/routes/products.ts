import { Router, Request, Response } from 'express';
import pool from '../db';
import { getCompanyId } from '../utils/company';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { active, all_companies } = req.query;
    const role = (req as any).user?.role;
    const viewAll = role === 'admin' && all_companies === '1';
    const companyId = viewAll ? null : await getCompanyId(req);

    let query = viewAll
      ? 'SELECT p.*, c.name as company_name, c.color as company_color FROM products p LEFT JOIN companies c ON c.id = p.company_id WHERE 1=1'
      : 'SELECT * FROM products WHERE company_id = $1';
    const params: unknown[] = viewAll ? [] : [companyId];
    let paramIdx = viewAll ? 1 : 2;

    if (active !== undefined) {
      query += ` AND ${viewAll ? 'p.' : ''}active = $${paramIdx++}`;
      params.push(active === 'true' || active === '1' ? 1 : 0);
    }
    query += viewAll ? ' ORDER BY p.name' : ' ORDER BY name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    const [topResult, openResult] = await Promise.all([
      pool.query<{ product_id: number; name: string; count: string }>(
        `SELECT o.product_id, p.name, COUNT(*) as count
         FROM opportunities o
         JOIN products p ON p.id = o.product_id
         WHERE o.stage = 'fechado' AND o.product_id IS NOT NULL AND o.company_id = $1
         GROUP BY o.product_id, p.name
         ORDER BY count DESC
         LIMIT 1`,
        [companyId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM opportunities
         WHERE product_id IS NOT NULL AND stage NOT IN ('fechado', 'perdido') AND company_id = $1`,
        [companyId]
      ),
    ]);
    res.json({
      top_product: topResult.rows[0] ?? null,
      open_with_product: Number(openResult.rows[0]?.count ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar stats de produtos' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
    const { rows: opps } = await pool.query(
      `SELECT id, title, stage, value, client_name, created_at
       FROM opportunities WHERE product_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ ...row, opportunities: opps });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, price, category, description, active, billing_type } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const activeVal = active !== undefined ? (active ? 1 : 0) : 1;
    const companyId = await getCompanyId(req);
    const { rows: [created] } = await pool.query(
      `INSERT INTO products (name, price, category, description, active, billing_type, company_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, price || 0, category || null, description || null, activeVal, billing_type || 'mrr', companyId]
    );
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, price, category, description, active, billing_type,
            promise, target_audience, deliverables, differentials,
            objections, pitch, faqs, social_proof } = req.body;
    const activeVal = active !== undefined ? (active ? 1 : 0) : 1;
    const { rows: [existing] } = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });

    // ── Core fields (always exist) ───────────────────────────────────────────
    await pool.query(
      `UPDATE products SET name=$1, price=$2, category=$3, description=$4, active=$5, billing_type=$6 WHERE id=$7`,
      [name, price || 0, category || null, description || null, activeVal, billing_type || 'mrr', req.params.id]
    );

    // ── Advanced fields (self-healing) ───────────────────────────────────────
    try {
      await pool.query(
        `UPDATE products SET
           promise=$1, target_audience=$2, deliverables=$3, differentials=$4,
           objections=$5, pitch=$6, faqs=$7, social_proof=$8, updated_at=NOW()
         WHERE id=$9`,
        [promise || null, target_audience || null,
         deliverables ? JSON.stringify(deliverables) : null,
         differentials || null,
         objections ? JSON.stringify(objections) : null,
         pitch || null,
         faqs ? JSON.stringify(faqs) : null,
         social_proof || null,
         req.params.id]
      );
    } catch (e: any) {
      console.error('[products PUT] advanced fields error:', e.message);
    }

    const { rows: [updated] } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    console.error('[products PUT] error:', err);
    res.status(500).json({ error: err?.message || 'Erro ao atualizar produto' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

export default router;
