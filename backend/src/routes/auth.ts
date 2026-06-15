import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db';
import { requireAuth, generateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_FAILURES = 5;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function isLockedOut(email: string, ip: string): boolean {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM login_attempts
    WHERE (email = ? OR ip = ?) AND success = 0 AND created_at >= ?
  `).get(email, ip, since) as { c: number };
  return row.c >= MAX_FAILURES;
}

function recordAttempt(email: string, ip: string, success: boolean) {
  db.prepare('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)').run(email, ip, success ? 1 : 0);
}

function writeAudit(userId: number | null, userEmail: string, action: string, resource: string, ip: string) {
  db.prepare('INSERT INTO audit_log (user_id, user_email, action, resource, ip) VALUES (?, ?, ?, ?, ?)')
    .run(userId, userEmail, action, resource, ip);
}

function isStrongPassword(password: string): boolean {
  // Min 8 chars, at least one letter and one number
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const ip = getClientIp(req);

  // Check lockout before hitting the DB with password comparison
  if (isLockedOut(normalizedEmail, ip)) {
    return res.status(429).json({
      error: 'Conta temporariamente bloqueada. Aguarde 15 minutos e tente novamente.',
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(normalizedEmail) as {
    id: number; name: string; email: string; password_hash: string; role: string;
  } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordAttempt(normalizedEmail, ip, false);
    // Generic message — do not reveal whether email exists
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Success — clear slate and issue token
  recordAttempt(normalizedEmail, ip, true);
  writeAudit(user.id, user.email, 'login', 'auth', ip);

  const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(req.user!.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  return res.json(user);
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', requireAuth, (req: AuthRequest, res: Response) => {
  const ip = getClientIp(req);
  writeAudit(req.user!.id, req.user!.email, 'logout', 'auth', ip);
  return res.json({ success: true });
});

// ─── GET /api/auth/users — admin only ───────────────────────────────────────
router.get('/users', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const users = db.prepare('SELECT id, name, email, role, active, created_at, updated_at FROM users').all();
  return res.json(users);
});

// ─── POST /api/auth/users — admin only ──────────────────────────────────────
router.post('/users', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password e role são obrigatórios' });
  }

  const validRoles = ['admin', 'comercial', 'financeiro'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'role inválido. Use: admin, comercial ou financeiro' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'A senha deve ter no mínimo 8 caracteres, incluindo pelo menos uma letra e um número.',
    });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, normalizedEmail, hash, role);
  const newUser = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

  const ip = getClientIp(req);
  writeAudit(req.user!.id, req.user!.email, 'create_user', `user:${normalizedEmail}`, ip);

  return res.status(201).json(newUser);
});

// ─── PUT /api/auth/users/:id — admin only ───────────────────────────────────
router.put('/users/:id', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { id } = req.params;
  const { name, role, active, password } = req.body;

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) as { id: number; email: string } | undefined;
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (role !== undefined) {
    const validRoles = ['admin', 'comercial', 'financeiro'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'role inválido. Use: admin, comercial ou financeiro' });
    }
  }

  if (password) {
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'A senha deve ter no mínimo 8 caracteres, incluindo pelo menos uma letra e um número.',
      });
    }
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, id);
  }

  if (name !== undefined) db.prepare("UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, id);
  if (role !== undefined) db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, id);
  if (active !== undefined) db.prepare("UPDATE users SET active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);

  const updated = db.prepare('SELECT id, name, email, role, active, created_at, updated_at FROM users WHERE id = ?').get(id);

  const ip = getClientIp(req);
  writeAudit(req.user!.id, req.user!.email, 'update_user', `user:${user.email}`, ip);

  return res.json(updated);
});

// ─── DELETE /api/auth/users/:id — admin only, soft delete ───────────────────
router.delete('/users/:id', requireAuth, (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { id } = req.params;
  if (Number(id) === req.user!.id) {
    return res.status(400).json({ error: 'Não é possível desativar o próprio usuário' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) as { id: number; email: string } | undefined;
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  db.prepare("UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);

  const ip = getClientIp(req);
  writeAudit(req.user!.id, req.user!.email, 'deactivate_user', `user:${user.email}`, ip);

  return res.json({ success: true });
});

export default router;
