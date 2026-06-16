import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Helper: compute hour_cost from settings + avg fixed expenses
async function getHourCost(): Promise<number> {
  const { rows: settingRows } = await pool.query(`SELECT key, value FROM company_settings`);
  const settings: Record<string, string> = Object.fromEntries(
    settingRows.map((r: { key: string; value: string }) => [r.key, r.value])
  );
  const monthly_billable_hours = Number(settings.monthly_billable_hours || 160);

  const { rows: [fixedRow] } = await pool.query<{ avg_fixed: string }>(`
    SELECT COALESCE(AVG(monthly_total), 0) as avg_fixed FROM (
      SELECT SUM(amount) as monthly_total FROM financial_expenses
      WHERE is_fixed = 1 AND is_client_cost = 0
        AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM-01')
        AND date < TO_CHAR(DATE_TRUNC('month', CURRENT_DATE), 'YYYY-MM-DD')
      GROUP BY TO_CHAR(date::date, 'YYYY-MM')
      LIMIT 3
    ) sub
  `);
  const avg_fixed = Number(fixedRow.avg_fixed);
  return monthly_billable_hours > 0 ? avg_fixed / monthly_billable_hours : 0;
}

// GET /tcv/projects?client_id=X
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const { client_id } = req.query;

    const hour_cost = await getHourCost();

    const { rows: projects } = await pool.query(`
      SELECT p.*, c.name as client_name
      FROM tcv_projects p
      JOIN agency_clients c ON c.id = p.client_id
      ${client_id ? 'WHERE p.client_id = $1' : ''}
      ORDER BY p.created_at DESC
    `, client_id ? [client_id] : []);

    if (projects.length === 0) return res.json([]);

    const projectIds = projects.map((p: { id: number }) => p.id);
    const { rows: payments } = await pool.query(
      `SELECT * FROM tcv_payments WHERE project_id = ANY($1) ORDER BY due_date ASC NULLS LAST`,
      [projectIds]
    );

    const paymentsByProject = payments.reduce((acc: Record<number, object[]>, pay: { project_id: number }) => {
      if (!acc[pay.project_id]) acc[pay.project_id] = [];
      acc[pay.project_id].push(pay);
      return acc;
    }, {} as Record<number, object[]>);

    const today = new Date().toISOString().slice(0, 10);

    const result = projects.map((p: {
      id: number; contract_value: string; estimated_hours: string;
      client_name: string; title: string; client_id: number;
      start_date: string | null; end_date: string | null;
      status: string; notes: string | null; created_at: string; updated_at: string;
    }) => {
      const contract_value = Number(p.contract_value);
      const estimated_hours = Number(p.estimated_hours);
      const project_cost = estimated_hours * hour_cost;
      const margin = contract_value - project_cost;
      const margin_pct = contract_value > 0 ? (margin / contract_value) * 100 : 0;

      const projectPayments = (paymentsByProject[p.id] || []) as {
        amount: string; status: string; due_date: string | null; paid_date: string | null;
      }[];

      let paid_amount = 0;
      let pending_amount = 0;
      let overdue_amount = 0;

      for (const pay of projectPayments) {
        const amt = Number(pay.amount);
        if (pay.status === 'pago') {
          paid_amount += amt;
        } else if (pay.status === 'atrasado' || (pay.status === 'pendente' && pay.due_date && pay.due_date < today)) {
          overdue_amount += amt;
        } else {
          pending_amount += amt;
        }
      }

      return {
        ...p,
        contract_value,
        estimated_hours,
        hour_cost,
        project_cost,
        margin,
        margin_pct,
        paid_amount,
        pending_amount,
        overdue_amount,
        payments: projectPayments,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar projetos' });
  }
});

// POST /tcv/projects
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const { client_id, title, contract_value, estimated_hours, start_date, end_date, status, notes } = req.body;
    if (!client_id || !title) return res.status(400).json({ error: 'client_id e title são obrigatórios' });

    const { rows: [created] } = await pool.query(
      `INSERT INTO tcv_projects (client_id, title, contract_value, estimated_hours, start_date, end_date, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [client_id, title, contract_value || 0, estimated_hours || 0, start_date || null, end_date || null, status || 'em_andamento', notes || null]
    );
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar projeto' });
  }
});

// PUT /tcv/projects/:id
router.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { title, contract_value, estimated_hours, start_date, end_date, status, notes } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM tcv_projects WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });

    const { rows: [updated] } = await pool.query(
      `UPDATE tcv_projects SET title = $1, contract_value = $2, estimated_hours = $3,
        start_date = $4, end_date = $5, status = $6, notes = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [title, contract_value || 0, estimated_hours || 0, start_date || null, end_date || null, status || 'em_andamento', notes || null, req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar projeto' });
  }
});

// DELETE /tcv/projects/:id
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM tcv_projects WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });
    await pool.query('DELETE FROM tcv_projects WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar projeto' });
  }
});

// POST /tcv/projects/:id/payments
router.post('/projects/:id/payments', async (req: Request, res: Response) => {
  try {
    const { amount, description, due_date, status } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount é obrigatório' });

    const { rows: [existing] } = await pool.query('SELECT id FROM tcv_projects WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });

    const { rows: [created] } = await pool.query(
      `INSERT INTO tcv_payments (project_id, amount, description, due_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, amount, description || null, due_date || null, status || 'pendente']
    );
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar pagamento' });
  }
});

// PUT /tcv/projects/:id/payments/:pid
router.put('/projects/:id/payments/:pid', async (req: Request, res: Response) => {
  try {
    const { status, paid_date, description, amount, due_date } = req.body;
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM tcv_payments WHERE id = $1 AND project_id = $2',
      [req.params.pid, req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Pagamento não encontrado' });

    const { rows: [updated] } = await pool.query(
      `UPDATE tcv_payments SET status = COALESCE($1, status), paid_date = $2,
        description = COALESCE($3, description), amount = COALESCE($4, amount),
        due_date = COALESCE($5, due_date)
       WHERE id = $6 AND project_id = $7 RETURNING *`,
      [status || null, paid_date || null, description || null, amount || null, due_date || null, req.params.pid, req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar pagamento' });
  }
});

// DELETE /tcv/projects/:id/payments/:pid
router.delete('/projects/:id/payments/:pid', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM tcv_payments WHERE id = $1 AND project_id = $2', [req.params.pid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar pagamento' });
  }
});

export default router;
