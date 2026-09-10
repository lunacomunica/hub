import { Router, Request, Response } from 'express';
import pool from '../db';
import { getCompanyId } from '../utils/company';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    const { rows } = await pool.query(
      `SELECT id, title, author_name, created_at, updated_at FROM notes WHERE company_id = $1 ORDER BY updated_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar anotações' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    const { rows: [note] } = await pool.query(
      `SELECT * FROM notes WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId]
    );
    if (!note) return res.status(404).json({ error: 'Anotação não encontrada' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar anotação' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    const user = (req as any).user;
    const { title, content } = req.body;
    const { rows: [created] } = await pool.query(
      `INSERT INTO notes (title, content, author_id, author_name, company_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title || 'Sem título', content || '', user?.id || null, user?.name || null, companyId]
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar anotação' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    const { title, content } = req.body;
    const { rows: [updated] } = await pool.query(
      `UPDATE notes SET title = $1, content = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [title, content, req.params.id, companyId]
    );
    if (!updated) return res.status(404).json({ error: 'Anotação não encontrada' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar anotação' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = await getCompanyId(req);
    await pool.query(`DELETE FROM notes WHERE id = $1 AND company_id = $2`, [req.params.id, companyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar anotação' });
  }
});

export default router;
