import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import revenuesRouter from './routes/revenues';
import expensesRouter from './routes/expenses';
import categoriesRouter from './routes/categories';
import clientsRouter from './routes/clients';
import salesGoalsRouter from './routes/sales-goals';
import opportunitiesRouter from './routes/opportunities';
import scenariosRouter from './routes/scenarios';
import churnRouter from './routes/churn';
import productsRouter from './routes/products';
import cardsRouter from './routes/cards';
import employeesRouter from './routes/employees';
import importRouter from './routes/import';
import supplierRulesRouter from './routes/supplier-rules';
import { requireAuth } from './middleware/auth';

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Headers de segurança HTTP (helmet) ─────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: IS_PROD ? undefined : false,
}));

// ─── CORS restrito — apenas origens autorizadas ──────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'http://localhost:5175')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin && !IS_PROD) return cb(null, true); // curl/Postman em dev
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
}));

// ─── Limite de tamanho do body (proteção DoS) ───────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ─── Rate limiting global: 300 req / 15 min por IP ──────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
}));

// ─── Rate limiting no login: 10 tentativas / 15 min (anti força-bruta) ──────
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
}));

// ─── One-time data migrations (safe, idempotent) ─────────────────────────────
import pool from './db';
(async () => {
  try {
    // Merge "Marketing Próprio" + "Mídia/Ads" → "Marketing e Anúncios"
    const { rows: existing } = await pool.query(
      `SELECT id FROM financial_categories WHERE name = 'Marketing e Anúncios' AND type = 'expense'`
    );
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO financial_categories (name, type, color) VALUES ('Marketing e Anúncios', 'expense', '#f59e0b')`
      );
    }
    await pool.query(`
      DELETE FROM financial_categories
      WHERE name IN ('Marketing Próprio', 'Mídia/Ads') AND type = 'expense'
        AND NOT EXISTS (SELECT 1 FROM financial_expenses WHERE category_id = financial_categories.id)
    `);
  } catch (e) { console.error('[migration] category merge error:', e); }
})();

// ─── Rotas públicas ──────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ─── Rotas protegidas ────────────────────────────────────────────────────────
app.use('/api/dashboard',     requireAuth, dashboardRouter);
app.use('/api/revenues',      requireAuth, revenuesRouter);
app.use('/api/expenses',      requireAuth, expensesRouter);
app.use('/api/categories',    requireAuth, categoriesRouter);
app.use('/api/clients',       requireAuth, clientsRouter);
app.use('/api/sales-goals',   requireAuth, salesGoalsRouter);
app.use('/api/opportunities', requireAuth, opportunitiesRouter);
app.use('/api/scenarios',     requireAuth, scenariosRouter);
app.use('/api/churn',         requireAuth, churnRouter);
app.use('/api/products',      requireAuth, productsRouter);
app.use('/api/cards',         requireAuth, cardsRouter);
app.use('/api/employees',     requireAuth, employeesRouter);
app.use('/api/import',          requireAuth, importRouter);
app.use('/api/supplier-rules',  requireAuth, supplierRulesRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ─── Error handler — sem stack trace em produção ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: IS_PROD ? 'Erro interno. Tente novamente.' : err.message });
});

export default app;
