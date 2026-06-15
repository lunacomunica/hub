import { Router, Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/cards
router.get('/', (req: AuthRequest, res: Response) => {
  const { active } = req.query;
  let query = `
    SELECT
      c.*,
      COALESCE((
        SELECT SUM(e.amount)
        FROM financial_expenses e
        WHERE e.card_id = c.id
          AND strftime('%Y-%m', e.date) = strftime('%Y-%m', 'now')
          AND e.status != 'cancelado'
      ), 0) AS used_this_month,
      COALESCE((
        SELECT SUM(e.amount)
        FROM financial_expenses e
        WHERE e.card_id = c.id AND e.status != 'cancelado'
          AND (
            -- faturas cujo fechamento ainda não passou
            CASE
              WHEN c.closing_day IS NOT NULL THEN
                date(e.date) > date('now', '-1 month', 'start of month', '+' || (c.closing_day - 1) || ' days')
              ELSE
                strftime('%Y-%m', e.date) = strftime('%Y-%m', 'now')
            END
          )
      ), 0) AS current_invoice
    FROM company_cards c
  `;
  const params: unknown[] = [];
  if (active !== undefined) {
    query += ' WHERE c.active = ?';
    params.push(active === 'true' || active === '1' ? 1 : 0);
  }
  query += ' ORDER BY c.name';

  const cards = db.prepare(query).all(...params);
  return res.json(cards);
});

// GET /api/cards/:id
router.get('/:id', (req: AuthRequest, res: Response) => {
  const card = db.prepare('SELECT * FROM company_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
  return res.json(card);
});

// GET /api/cards/:id/expenses — despesas vinculadas ao cartão
router.get('/:id/expenses', (req: AuthRequest, res: Response) => {
  const { month, year } = req.query;
  let query = `
    SELECT e.*, c.name as category_name
    FROM financial_expenses e
    LEFT JOIN financial_categories c ON c.id = e.category_id
    WHERE e.card_id = ?
  `;
  const params: unknown[] = [req.params.id];
  if (month) { query += ' AND strftime(\'%m\', e.date) = ?'; params.push(String(month).padStart(2, '0')); }
  if (year)  { query += ' AND strftime(\'%Y\', e.date) = ?'; params.push(String(year)); }
  query += ' ORDER BY e.date DESC';
  return res.json(db.prepare(query).all(...params));
});

// POST /api/cards
router.post('/', (req: AuthRequest, res: Response) => {
  const { name, last4, brand, credit_limit, closing_day, due_day, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

  const result = db.prepare(`
    INSERT INTO company_cards (name, last4, brand, credit_limit, closing_day, due_day, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), last4 || null, brand || 'outro', credit_limit || 0, closing_day || null, due_day || null, notes || null);

  return res.status(201).json(db.prepare('SELECT * FROM company_cards WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/cards/:id
router.put('/:id', (req: AuthRequest, res: Response) => {
  const card = db.prepare('SELECT id FROM company_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });

  const { name, last4, brand, credit_limit, closing_day, due_day, active, notes } = req.body;
  if (name !== undefined) db.prepare("UPDATE company_cards SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, req.params.id);
  if (last4 !== undefined) db.prepare("UPDATE company_cards SET last4 = ?, updated_at = datetime('now') WHERE id = ?").run(last4 || null, req.params.id);
  if (brand !== undefined) db.prepare("UPDATE company_cards SET brand = ?, updated_at = datetime('now') WHERE id = ?").run(brand, req.params.id);
  if (credit_limit !== undefined) db.prepare("UPDATE company_cards SET credit_limit = ?, updated_at = datetime('now') WHERE id = ?").run(credit_limit, req.params.id);
  if (closing_day !== undefined) db.prepare("UPDATE company_cards SET closing_day = ?, updated_at = datetime('now') WHERE id = ?").run(closing_day || null, req.params.id);
  if (due_day !== undefined) db.prepare("UPDATE company_cards SET due_day = ?, updated_at = datetime('now') WHERE id = ?").run(due_day || null, req.params.id);
  if (active !== undefined) db.prepare("UPDATE company_cards SET active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, req.params.id);
  if (notes !== undefined) db.prepare("UPDATE company_cards SET notes = ?, updated_at = datetime('now') WHERE id = ?").run(notes || null, req.params.id);

  return res.json(db.prepare('SELECT * FROM company_cards WHERE id = ?').get(req.params.id));
});

// DELETE /api/cards/:id (soft delete)
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const card = db.prepare('SELECT id FROM company_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartão não encontrado' });
  db.prepare("UPDATE company_cards SET active = 0, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  return res.json({ success: true });
});

export default router;
