import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM financial_categories WHERE 1=1';
    const params: string[] = [];
    if (type) {
      query += ' AND type = $1';
      params.push(type as string);
    }
    query += ' ORDER BY type, name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query('SELECT * FROM financial_categories WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categoria' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Campos obrigatórios: name, type' });
    if (!['revenue', 'expense'].includes(type)) return res.status(400).json({ error: 'type deve ser revenue ou expense' });

    const { rows: [created] } = await pool.query(
      'INSERT INTO financial_categories (name, type, color) VALUES ($1, $2, $3) RETURNING *',
      [name, type, color || '#6366f1']
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, type, color } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_categories WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });

    await pool.query(
      'UPDATE financial_categories SET name = $1, type = $2, color = $3 WHERE id = $4',
      [name, type, color || '#6366f1', req.params.id]
    );
    const { rows: [updated] } = await pool.query('SELECT * FROM financial_categories WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_categories WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });
    await pool.query('DELETE FROM financial_categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

export default router;
