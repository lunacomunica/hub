import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/proposals/view/:token — público, sem auth
router.get('/view/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, title, contact_name, client_logo_url, proposal_viewed_at, proposal_approved_at
       FROM opportunities WHERE proposal_token = $1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proposta não encontrada' });

    // Registra primeira visualização
    if (!rows[0].proposal_viewed_at) {
      await pool.query(
        `UPDATE opportunities SET proposal_viewed_at = NOW() WHERE proposal_token = $1`,
        [token]
      );
    }

    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/proposals/approve/:token — público, sem auth
router.post('/approve/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE opportunities SET proposal_approved_at = NOW()
       WHERE proposal_token = $1 AND proposal_approved_at IS NULL
       RETURNING id`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proposta não encontrada ou já aprovada' });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
