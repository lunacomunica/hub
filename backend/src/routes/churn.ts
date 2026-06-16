import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const { rows: churned } = await pool.query<{
      id: number; name: string; monthly_fee: number; start_date: string | null;
      churn_date: string; churn_reason: string | null; churn_notes: string | null;
      reactivation_potential: string | null;
    }>(
      `SELECT * FROM agency_clients WHERE active = 0 AND churn_date IS NOT NULL`
    );

    const total_churned = churned.length;
    const mrr_lost = churned.reduce((s, c) => s + Number(c.monthly_fee), 0);

    const lifetimes = churned
      .filter(c => c.start_date && c.churn_date)
      .map(c => {
        const start = new Date(c.start_date!);
        const end = new Date(c.churn_date);
        return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      });
    const avg_lifetime_months = lifetimes.length > 0
      ? Math.round(lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length)
      : 0;

    const total_ltv_lost = churned.reduce((s, c) => {
      if (!c.start_date || !c.churn_date) return s + Number(c.monthly_fee);
      const months = Math.max(1, Math.round(
        (new Date(c.churn_date).getTime() - new Date(c.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
      ));
      return s + (Number(c.monthly_fee) * months);
    }, 0);

    const { rows: [activeRow] } = await pool.query<{ c: string }>(
      'SELECT COUNT(*) as c FROM agency_clients WHERE active = 1'
    );
    const active_count = Number(activeRow.c);
    const churn_rate = active_count + total_churned > 0
      ? ((total_churned / (active_count + total_churned)) * 100).toFixed(1)
      : '0.0';

    // churn last 6 months
    const now = new Date();
    const monthly_churn: { month: string; count: number; mrr_lost: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `${y}-${m}`;
      const rows = churned.filter(c => c.churn_date && c.churn_date.startsWith(prefix));
      monthly_churn.push({
        month: `${m}/${y}`,
        count: rows.length,
        mrr_lost: rows.reduce((s, c) => s + Number(c.monthly_fee), 0),
      });
    }

    res.json({ total_churned, mrr_lost, avg_lifetime_months, total_ltv_lost, churn_rate, monthly_churn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar resumo de churn' });
  }
});

router.get('/by-reason', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(churn_reason, 'Não informado') as reason,
         COUNT(*) as count,
         SUM(monthly_fee) as mrr_lost
       FROM agency_clients
       WHERE active = 0 AND churn_date IS NOT NULL
       GROUP BY reason
       ORDER BY count DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar churn por motivo' });
  }
});

router.get('/clients', async (_req: Request, res: Response) => {
  try {
    const { rows: clients } = await pool.query<{
      id: number; name: string; monthly_fee: number; start_date: string | null;
      churn_date: string; churn_reason: string | null; churn_notes: string | null;
      reactivation_potential: string | null; service_type: string | null;
    }>(
      `SELECT * FROM agency_clients
       WHERE active = 0 AND churn_date IS NOT NULL
       ORDER BY churn_date DESC`
    );

    const result = clients.map(c => {
      const lifetime_months = c.start_date && c.churn_date
        ? Math.max(1, Math.round((new Date(c.churn_date).getTime() - new Date(c.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : null;
      const ltv = lifetime_months ? Number(c.monthly_fee) * lifetime_months : null;
      return { ...c, lifetime_months, ltv };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar clientes com churn' });
  }
});

router.patch('/:id/churn', async (req: Request, res: Response) => {
  try {
    const { churn_date, churn_reason, churn_notes, reactivation_potential, start_date } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM agency_clients WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    await pool.query(
      `UPDATE agency_clients
       SET active = 0, churn_date = $1, churn_reason = $2, churn_notes = $3,
           reactivation_potential = $4, start_date = COALESCE($5, start_date), updated_at = NOW()
       WHERE id = $6`,
      [churn_date || new Date().toISOString().split('T')[0], churn_reason || null, churn_notes || null, reactivation_potential || 'nao', start_date || null, req.params.id]
    );

    const { rows: [updated] } = await pool.query('SELECT * FROM agency_clients WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar churn' });
  }
});

router.patch('/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM agency_clients WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    await pool.query(
      `UPDATE agency_clients
       SET active = 1, churn_date = NULL, churn_reason = NULL, churn_notes = NULL,
           reactivation_potential = 'nao', updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    const { rows: [updated] } = await pool.query('SELECT * FROM agency_clients WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reativar cliente' });
  }
});

export default router;
