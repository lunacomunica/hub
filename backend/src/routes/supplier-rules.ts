import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// Expose ensureTable so we can call it here
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS categorization_rules (
      id          SERIAL PRIMARY KEY,
      keyword     TEXT        NOT NULL,
      trans_type  VARCHAR(20) NOT NULL CHECK (trans_type IN ('revenue', 'expense')),
      category_id INTEGER REFERENCES financial_categories(id) ON DELETE SET NULL,
      supplier    TEXT,
      usage_count INTEGER     DEFAULT 1,
      updated_at  TIMESTAMP   DEFAULT NOW(),
      UNIQUE(keyword, trans_type)
    )
  `);
}

// GET /api/supplier-rules?type=expense|revenue
router.get('/', async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const { type } = req.query;
    const transType = type === 'revenue' ? 'revenue' : 'expense';
    const { rows } = await query(
      `SELECT cr.id, cr.keyword, cr.trans_type, cr.category_id, cr.supplier, cr.usage_count, cr.updated_at,
              fc.name as category_name, fc.color as category_color
       FROM categorization_rules cr
       LEFT JOIN financial_categories fc ON cr.category_id = fc.id
       WHERE cr.trans_type = $1
       ORDER BY cr.usage_count DESC, cr.updated_at DESC`,
      [transType]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar regras' });
  }
});

// POST /api/supplier-rules
router.post('/', async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const { keyword, trans_type, category_id, supplier } = req.body;
    if (!keyword || !trans_type) {
      return res.status(400).json({ error: 'keyword e trans_type são obrigatórios' });
    }
    if (!['revenue', 'expense'].includes(trans_type)) {
      return res.status(400).json({ error: 'trans_type inválido' });
    }
    if (!category_id && !supplier) {
      return res.status(400).json({ error: 'Informe ao menos fornecedor ou categoria' });
    }

    const { rows: [row] } = await query(
      `INSERT INTO categorization_rules (keyword, trans_type, category_id, supplier, usage_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (keyword, trans_type) DO UPDATE SET
         category_id = COALESCE($3, categorization_rules.category_id),
         supplier    = COALESCE($4, categorization_rules.supplier),
         updated_at  = NOW()
       RETURNING *`,
      [keyword.trim().toLowerCase(), trans_type, category_id || null, supplier?.trim() || null]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar regra' });
  }
});

// PUT /api/supplier-rules/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { category_id, supplier } = req.body;
    const { rows: [row] } = await query(
      `UPDATE categorization_rules SET
         category_id = $1,
         supplier    = $2,
         updated_at  = NOW()
       WHERE id = $3
       RETURNING *`,
      [category_id || null, supplier?.trim() || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar regra' });
  }
});

// DELETE /api/supplier-rules/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await query('SELECT id FROM categorization_rules WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Regra não encontrada' });
    await query('DELETE FROM categorization_rules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar regra' });
  }
});

export default router;
