import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM financial_categories WHERE 1=1';
    const params: string[] = [];
    if (type) {
      query += ' AND type = ?';
      params.push(type as string);
    }
    query += ' ORDER BY type, name';
    res.json(db.prepare(query).all(...params));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM financial_categories WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categoria' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, type, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Campos obrigatórios: name, type' });
    if (!['revenue', 'expense'].includes(type)) return res.status(400).json({ error: 'type deve ser revenue ou expense' });

    const result = db.prepare('INSERT INTO financial_categories (name, type, color) VALUES (?, ?, ?)').run(name, type, color || '#6366f1');
    res.status(201).json(db.prepare('SELECT * FROM financial_categories WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, type, color } = req.body;
    const existing = db.prepare('SELECT id FROM financial_categories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });

    db.prepare('UPDATE financial_categories SET name = ?, type = ?, color = ? WHERE id = ?').run(name, type, color || '#6366f1', req.params.id);
    res.json(db.prepare('SELECT * FROM financial_categories WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM financial_categories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });
    db.prepare('DELETE FROM financial_categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

export default router;
