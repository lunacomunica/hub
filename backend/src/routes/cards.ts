import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/cards
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { active } = req.query;

    // Build the base query — SQLite-specific strftime and CASE replaced with PostgreSQL equivalents
    let query = `
      SELECT
        c.*,
        COALESCE((
          SELECT SUM(e.amount)
          FROM financial_expenses e
          WHERE e.card_id = c.id
            AND to_char(e.date::date, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
            AND e.status != 'cancelado'
        ), 0) AS used_this_month,
        COALESCE((
          SELECT SUM(e.amount)
          FROM financial_expenses e
          WHERE e.card_id = c.id AND e.status != 'cancelado'
            AND (
              CASE
                WHEN c.closing_day IS NOT NULL THEN
                  e.date::date > (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date + (c.closing_day - 1)
                ELSE
                  to_char(e.date::date, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
              END
            )
        ), 0) AS current_invoice
      FROM company_cards c
    `;
    const params: unknown[] = [];
    let paramIdx = 1;
    if (active !== undefined) {
      query += ` WHERE c.active = $${paramIdx++}`;
      params.push(active === 'true' || active === '1' ? true : false);
    }
    query += ' ORDER BY c.name';

    const { rows } = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar cartões' });
  }
});

// GET /api/cards/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [card] } = await pool.query('SELECT * FROM company_cards WHERE id = $1', [req.params.id]);
    if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
    return res.json(card);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar cartão' });
  }
});

// GET /api/cards/:id/expenses — despesas vinculadas ao cartão
router.get('/:id/expenses', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    let query = `
      SELECT e.*, c.name as category_name
      FROM financial_expenses e
      LEFT JOIN financial_categories c ON c.id = e.category_id
      WHERE e.card_id = $1
    `;
    const params: unknown[] = [req.params.id];
    let paramIdx = 2;
    if (month) { query += ` AND to_char(e.date::date, 'MM') = $${paramIdx++}`; params.push(String(month).padStart(2, '0')); }
    if (year)  { query += ` AND to_char(e.date::date, 'YYYY') = $${paramIdx++}`; params.push(String(year)); }
    query += ' ORDER BY e.date DESC';

    const { rows } = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar despesas do cartão' });
  }
});

// POST /api/cards
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, last4, brand, credit_limit, closing_day, due_day, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

    const { rows: [created] } = await pool.query(
      `INSERT INTO company_cards (name, last4, brand, credit_limit, closing_day, due_day, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name.trim(), last4 || null, brand || 'outro', credit_limit || 0, closing_day || null, due_day || null, notes || null]
    );

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar cartão' });
  }
});

// PUT /api/cards/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [card] } = await pool.query('SELECT id FROM company_cards WHERE id = $1', [req.params.id]);
    if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });

    const { name, last4, brand, credit_limit, closing_day, due_day, active, notes } = req.body;
    if (name !== undefined) await pool.query('UPDATE company_cards SET name = $1, updated_at = NOW() WHERE id = $2', [name, req.params.id]);
    if (last4 !== undefined) await pool.query('UPDATE company_cards SET last4 = $1, updated_at = NOW() WHERE id = $2', [last4 || null, req.params.id]);
    if (brand !== undefined) await pool.query('UPDATE company_cards SET brand = $1, updated_at = NOW() WHERE id = $2', [brand, req.params.id]);
    if (credit_limit !== undefined) await pool.query('UPDATE company_cards SET credit_limit = $1, updated_at = NOW() WHERE id = $2', [credit_limit, req.params.id]);
    if (closing_day !== undefined) await pool.query('UPDATE company_cards SET closing_day = $1, updated_at = NOW() WHERE id = $2', [closing_day || null, req.params.id]);
    if (due_day !== undefined) await pool.query('UPDATE company_cards SET due_day = $1, updated_at = NOW() WHERE id = $2', [due_day || null, req.params.id]);
    if (active !== undefined) await pool.query('UPDATE company_cards SET active = $1, updated_at = NOW() WHERE id = $2', [active ? true : false, req.params.id]);
    if (notes !== undefined) await pool.query('UPDATE company_cards SET notes = $1, updated_at = NOW() WHERE id = $2', [notes || null, req.params.id]);

    const { rows: [updated] } = await pool.query('SELECT * FROM company_cards WHERE id = $1', [req.params.id]);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar cartão' });
  }
});

// DELETE /api/cards/:id (soft delete)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [card] } = await pool.query('SELECT id FROM company_cards WHERE id = $1', [req.params.id]);
    if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
    await pool.query('UPDATE company_cards SET active = 0, updated_at = NOW() WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao desativar cartão' });
  }
});

export default router;
