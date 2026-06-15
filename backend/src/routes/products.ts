import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { active } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: unknown[] = [];
    if (active !== undefined) { query += ' AND active = ?'; params.push(active === 'true' || active === '1' ? 1 : 0); }
    query += ' ORDER BY name';
    res.json(db.prepare(query).all(...params));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, price, category, description, active } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = db.prepare(`
      INSERT INTO products (name, price, category, description, active)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, price || 0, category || null, description || null, active !== undefined ? (active ? 1 : 0) : 1);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, price, category, description, active } = req.body;
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
    db.prepare(`
      UPDATE products SET name = ?, price = ?, category = ?, description = ?, active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, price || 0, category || null, description || null, active !== undefined ? (active ? 1 : 0) : 1, req.params.id);
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

export default router;
