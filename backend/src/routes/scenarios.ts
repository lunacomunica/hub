import { Router, Request, Response } from 'express';
import pool from '../db';
import { getCompanyId } from '../utils/company';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    let query = 'SELECT * FROM financial_scenarios WHERE 1=1';
    const params: number[] = [];
    let paramIdx = 1;
    if (month) { query += ` AND month = $${paramIdx++}`; params.push(Number(month)); }
    if (year) { query += ` AND year = $${paramIdx++}`; params.push(Number(year)); }
    query += ' ORDER BY year DESC, month DESC, type';

    const { rows: scenarios } = await pool.query(query, params);

    // If month+year provided, include actual data
    let actual = null;
    if (month && year) {
      const m = String(month).padStart(2, '0');
      const startDate = `${year}-${m}-01`;
      const endDate = `${year}-${m}-31`;
      const companyId = await getCompanyId(req);

      const { rows: [revRow] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount),0) as total FROM financial_revenues WHERE company_id = $3 AND date >= $1 AND date <= $2 AND status != 'cancelado'`,
        [startDate, endDate, companyId]
      );
      const { rows: [expRow] } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount),0) as total FROM financial_expenses WHERE company_id = $3 AND date >= $1 AND date <= $2 AND status != 'cancelado'`,
        [startDate, endDate, companyId]
      );

      const actualRevenue = Number(revRow.total);
      const actualExpenses = Number(expRow.total);
      actual = {
        revenue: actualRevenue,
        expenses: actualExpenses,
        profit: actualRevenue - actualExpenses,
      };
    }

    res.json({ scenarios, actual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cenários' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [row] } = await pool.query('SELECT * FROM financial_scenarios WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Cenário não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cenário' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, month, year, type, revenue_projection, expense_projection, new_clients, churn_clients, avg_ticket, notes } = req.body;
    if (!name || !month || !year) return res.status(400).json({ error: 'Campos obrigatórios: name, month, year' });

    const { rows: [created] } = await pool.query(
      `INSERT INTO financial_scenarios (name, month, year, type, revenue_projection, expense_projection, new_clients, churn_clients, avg_ticket, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, month, year, type || 'realista', revenue_projection || 0, expense_projection || 0, new_clients || 0, churn_clients || 0, avg_ticket || 0, notes || null]
    );

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cenário' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, month, year, type, revenue_projection, expense_projection, new_clients, churn_clients, avg_ticket, notes } = req.body;
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_scenarios WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cenário não encontrado' });

    await pool.query(
      `UPDATE financial_scenarios SET name = $1, month = $2, year = $3, type = $4, revenue_projection = $5,
         expense_projection = $6, new_clients = $7, churn_clients = $8, avg_ticket = $9, notes = $10,
         updated_at = NOW()
       WHERE id = $11`,
      [name, month, year, type || 'realista', revenue_projection || 0, expense_projection || 0, new_clients || 0, churn_clients || 0, avg_ticket || 0, notes || null, req.params.id]
    );

    const { rows: [updated] } = await pool.query('SELECT * FROM financial_scenarios WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cenário' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT id FROM financial_scenarios WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Cenário não encontrado' });
    await pool.query('DELETE FROM financial_scenarios WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar cenário' });
  }
});

export default router;
