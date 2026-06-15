import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('🔴 JWT_SECRET não definido! Configure o arquivo backend/.env');

export interface AuthRequest extends Request {
  user?: { id: number; email: string; name: string; role: string };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, SECRET!) as AuthRequest['user'];
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };

// Token de 8h — segurança aumentada vs 30 dias anterior
export const generateToken = (payload: object) =>
  jwt.sign(payload, SECRET!, { expiresIn: '8h' });
