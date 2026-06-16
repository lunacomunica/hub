import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { active } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: unknown[] = [];
    let paramIdx = 1;
    if (active !== undefined) {
      query += ` AND active = $${paramIdx++}`;
      params.push(active === 'true' || active === '1' ? true : false);
    }
    query += ' ORDER BY name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, price, category, description, active } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const activeVal = active !== undefined ? (active ? 1 : 0) : 1;
    const { rows: [created] } = await pool.query(
      `INSERT INTO products (name, price, category, description, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, price || 0, category || null, description || null, activeVal]
    );
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, price, category, description, active } = req.body;
    const activeVal = active !== undefined ? (active ? 1 : 0) : 1;
    const { rows: [existing] } = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
    await pool.query(
      `UPDATE products SET name = $1, price = $2, category = $3, description = $4, active = $5, updated_at = NOW()
       WHERE id = $6`,
      [name, price || 0, category || null, description || null, activeVal, req.params.id]
    );
    const { rows: [updated] } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto' });
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
