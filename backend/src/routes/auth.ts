import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool, { query as dbQuery } from '../db';
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

async function isLockedOut(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
  const { rows: [row] } = await dbQuery<{ c: string }>(
    `SELECT COUNT(*) as c FROM login_attempts
     WHERE (email = $1 OR ip = $2) AND success = 0 AND created_at >= $3`,
    [email, ip, since]
  );
  return Number(row.c) >= MAX_FAILURES;
}

async function recordAttempt(email: string, ip: string, success: boolean) {
  await dbQuery(
    'INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)',
    [email, ip, success ? 1 : 0]
  );
}

async function writeAudit(userId: number | null, userEmail: string, action: string, resource: string, ip: string) {
  await dbQuery(
    'INSERT INTO audit_log (user_id, user_email, action, resource, ip) VALUES ($1, $2, $3, $4, $5)',
    [userId, userEmail, action, resource, ip]
  );
}

function isStrongPassword(password: string): boolean {
  // Min 8 chars, at least one letter and one number
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const ip = getClientIp(req);

  // Check lockout before hitting the DB with password comparison
  if (await isLockedOut(normalizedEmail, ip)) {
    return res.status(429).json({
      error: 'Conta temporariamente bloqueada. Aguarde 15 minutos e tente novamente.',
    });
  }

  const { rows: [user] } = await dbQuery<{
    id: number; name: string; email: string; password_hash: string; role: string;
  }>(
    'SELECT * FROM users WHERE email = $1 AND active = 1',
    [normalizedEmail]
  );

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    await recordAttempt(normalizedEmail, ip, false);
    // Generic message — do not reveal whether email exists
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Success — clear slate and issue token
  await recordAttempt(normalizedEmail, ip, true);
  await writeAudit(user.id, user.email, 'login', 'auth', ip);

  const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { rows: [user] } = await dbQuery(
    'SELECT id, name, email, role, active, created_at FROM users WHERE id = $1',
    [req.user!.id]
  );
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  return res.json(user);
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const ip = getClientIp(req);
  await writeAudit(req.user!.id, req.user!.email, 'logout', 'auth', ip);
  return res.json({ success: true });
});

// ─── GET /api/auth/users — admin only ───────────────────────────────────────
router.get('/users', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const { rows } = await dbQuery('SELECT id, name, email, role, active, created_at, updated_at FROM users');
  return res.json(rows);
});

// ─── POST /api/auth/users — admin only ──────────────────────────────────────
router.post('/users', requireAuth, async (req: AuthRequest, res: Response) => {
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
  const { rows: [existing] } = await dbQuery('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const { rows: [newUser] } = await dbQuery(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, active, created_at',
    [name, normalizedEmail, hash, role]
  );

  const ip = getClientIp(req);
  await writeAudit(req.user!.id, req.user!.email, 'create_user', `user:${normalizedEmail}`, ip);

  return res.status(201).json(newUser);
});

// ─── PUT /api/auth/users/:id — admin only ───────────────────────────────────
router.put('/users/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { id } = req.params;
  const { name, role, active, password } = req.body;

  const { rows: [user] } = await dbQuery<{ id: number; email: string }>(
    'SELECT id, email FROM users WHERE id = $1',
    [id]
  );
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
    await dbQuery('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, id]);
  }

  if (name !== undefined) await dbQuery('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, id]);
  if (role !== undefined) await dbQuery('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
  if (active !== undefined) await dbQuery('UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2', [active ? true : false, id]);

  const { rows: [updated] } = await dbQuery(
    'SELECT id, name, email, role, active, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );

  const ip = getClientIp(req);
  await writeAudit(req.user!.id, req.user!.email, 'update_user', `user:${user.email}`, ip);

  return res.json(updated);
});

// ─── DELETE /api/auth/users/:id — admin only, soft delete ───────────────────
router.delete('/users/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { id } = req.params;
  if (Number(id) === req.user!.id) {
    return res.status(400).json({ error: 'Não é possível desativar o próprio usuário' });
  }

  const { rows: [user] } = await dbQuery<{ id: number; email: string }>(
    'SELECT id, email FROM users WHERE id = $1',
    [id]
  );
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  await dbQuery('UPDATE users SET active = 0, updated_at = NOW() WHERE id = $1', [id]);

  const ip = getClientIp(req);
  await writeAudit(req.user!.id, req.user!.email, 'deactivate_user', `user:${user.email}`, ip);

  return res.json({ success: true });
});

// ─── PUT /api/auth/profile — usuário atualiza o próprio perfil ───────────────
router.put('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const { name, current_password, new_password } = req.body;
  const userId = req.user!.id;

  const { rows: [user] } = await dbQuery<{ id: number; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Se quer trocar senha, verifica a senha atual
  if (new_password) {
    if (!current_password) {
      return res.status(400).json({ error: 'Informe a senha atual para trocar a senha' });
    }
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    if (!isStrongPassword(new_password)) {
      return res.status(400).json({
        error: 'A nova senha deve ter no mínimo 8 caracteres, incluindo pelo menos uma letra e um número.',
      });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    await dbQuery('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
  }

  if (name !== undefined && name.trim()) {
    await dbQuery('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name.trim(), userId]);
  }

  const { rows: [updated] } = await dbQuery(
    'SELECT id, name, email, role, active FROM users WHERE id = $1',
    [userId]
  );

  const ip = getClientIp(req);
  await writeAudit(userId, user.email, 'update_profile', 'profile', ip);

  return res.json(updated);
});

export default router;
