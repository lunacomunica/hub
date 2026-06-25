import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const brl = (v: any) => Number(v || 0);

// GET / — all prizes, newest first
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM referral_prizes ORDER BY prize_date DESC, created_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /client/:id — prizes for a specific client
router.get('/client/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM referral_prizes WHERE referral_client_id = $1 ORDER BY prize_date DESC`,
      [Number(req.params.id)]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /employee/:id — prizes for a specific employee
router.get('/employee/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM referral_prizes WHERE referral_employee_id = $1 ORDER BY prize_date DESC`,
      [Number(req.params.id)]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST / — create prize (admin only enforced on frontend)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      referral_name, referral_type, referral_client_id, referral_employee_id,
      opportunity_id, opportunity_title,
      prize_date, prize_type, prize_value, revenue_generated, notes
    } = req.body;
    if (!referral_name) return res.status(400).json({ error: 'Nome do indicador é obrigatório' });
    const { rows: [created] } = await pool.query(
      `INSERT INTO referral_prizes
        (referral_name, referral_type, referral_client_id, referral_employee_id,
         opportunity_id, opportunity_title, prize_date, prize_type, prize_value, revenue_generated, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        referral_name, referral_type || 'external',
        referral_client_id || null, referral_employee_id || null,
        opportunity_id || null, opportunity_title || null,
        prize_date || new Date().toISOString().split('T')[0],
        prize_type || 'presente',
        brl(prize_value), brl(revenue_generated),
        notes || null
      ]
    );
    res.status(201).json(created);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM referral_prizes WHERE id = $1`, [Number(req.params.id)]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
