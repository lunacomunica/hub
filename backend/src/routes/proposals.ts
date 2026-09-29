import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Roda ALTER TABLE só uma vez por processo, não a cada request
let migrated = false;
async function ensureMigration() {
  if (migrated) return;
  await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS proposal_view_count INTEGER DEFAULT 0`);
  migrated = true;
}
ensureMigration().catch(() => {});

// POST /api/proposals/view/:token — chamado via sendBeacon, registra visualização
router.post('/view/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    await pool.query(
      `UPDATE opportunities
       SET proposal_view_count = COALESCE(proposal_view_count, 0) + 1,
           proposal_viewed_at  = COALESCE(proposal_viewed_at, NOW())
       WHERE proposal_token = $1`,
      [token]
    );
    res.status(204).end();
  } catch (e: any) {
    res.status(500).end();
  }
});

// GET /api/proposals/logo/:token — retorna só o logo, rápido, sem side-effects
router.get('/logo/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT client_logo_url FROM opportunities WHERE proposal_token = $1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proposta não encontrada' });
    res.json({ client_logo_url: rows[0].client_logo_url });
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
