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
import settingsRouter from './routes/settings';
import tcvRouter from './routes/tcv';
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

  // Add risk_alert columns to agency_clients (idempotent)
  try {
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS risk_alert INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS risk_reason TEXT`);
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS risk_since TEXT`);
  } catch (e) { console.error('[migration] risk_alert columns error:', e); }

  // Allow 'perdido' status in financial_revenues (drop old CHECK, add new one)
  try {
    await pool.query(`
      ALTER TABLE financial_revenues
        DROP CONSTRAINT IF EXISTS financial_revenues_status_check
    `);
    await pool.query(`
      ALTER TABLE financial_revenues
        ADD CONSTRAINT financial_revenues_status_check
        CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado', 'perdido'))
    `);
  } catch (e) { console.error('[migration] revenues perdido status error:', e); }

  // Create company_settings table (idempotent)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Seed default
    await pool.query(`
      INSERT INTO company_settings (key, value) VALUES ('monthly_billable_hours', '160')
      ON CONFLICT (key) DO NOTHING
    `);
  } catch (e) { console.error('[migration] company_settings error:', e); }

  // Add client_type to agency_clients
  try {
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(10) DEFAULT 'mrr'`);
  } catch (e) { console.error('[migration] client_type column error:', e); }

  // TCV projects table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tcv_projects (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        contract_value NUMERIC(10,2) NOT NULL DEFAULT 0,
        estimated_hours NUMERIC(8,2) DEFAULT 0,
        start_date DATE,
        end_date DATE,
        status VARCHAR(20) DEFAULT 'em_andamento',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] tcv_projects error:', e); }

  // TCV payments table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tcv_payments (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES tcv_projects(id) ON DELETE CASCADE,
        description TEXT,
        amount NUMERIC(10,2) NOT NULL,
        due_date DATE,
        paid_date DATE,
        status VARCHAR(20) DEFAULT 'pendente',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] tcv_payments error:', e); }

  // Link opportunities → clients
  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES agency_clients(id) ON DELETE SET NULL`);
  } catch (e) { console.error('[migration] opportunities client_id error:', e); }

  // Add billing_type to products
  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_type VARCHAR(10) DEFAULT 'mrr'`);
  } catch (e) { console.error('[migration] products billing_type error:', e); }

  // Seed default pipeline stages if none exist
  try {
    const { rows: [cnt] } = await pool.query<{ c: string }>(`SELECT COUNT(*) as c FROM pipeline_stages`);
    if (Number(cnt.c) === 0) {
      await pool.query(`
        INSERT INTO pipeline_stages (key, label, color, bg_color, position, is_terminal) VALUES
          ('prospeccao', 'Prospecção',  '#94a3b8', 'rgba(148,163,184,0.12)', 1, 0),
          ('contato',    'Contato',     '#3b82f6', 'rgba(59,130,246,0.12)',  2, 0),
          ('proposta',   'Proposta',    '#8b5cf6', 'rgba(139,92,246,0.12)', 3, 0),
          ('negociacao', 'Negociação',  '#f59e0b', 'rgba(245,158,11,0.12)', 4, 0),
          ('fechado',    'Fechado',     '#10b981', 'rgba(16,185,129,0.12)', 5, 1),
          ('perdido',    'Perdido',     '#ef4444', 'rgba(239,68,68,0.12)',  6, 1)
      `);
    }
  } catch (e) { console.error('[migration] default pipeline stages error:', e); }
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
app.use('/api/settings',        requireAuth, settingsRouter);
app.use('/api/tcv',             requireAuth, tcvRouter);

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
