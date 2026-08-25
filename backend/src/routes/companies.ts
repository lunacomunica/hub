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
