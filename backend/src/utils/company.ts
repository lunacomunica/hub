import { Request } from 'express';
import pool from '../db';

export async function getCompanyId(req: Request): Promise<number> {
  const headerId = Number(req.headers['x-company-id']);
  const userId   = (req as any).user?.id;
  const role     = (req as any).user?.role;

  if (!headerId) return 1;

  // Admin can access any company
  if (role === 'admin') return headerId;

  // Others: validate they belong to that company
  const { rows } = await pool.query(
    `SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`,
    [userId, headerId]
  );
  return rows.length > 0 ? headerId : 1;
}
