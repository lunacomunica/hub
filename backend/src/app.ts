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
import referralPrizesRouter from './routes/referral-prizes';
import routineRouter from './routes/routine';
import companiesRouter from './routes/companies';
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

export async function runMigrations() {
  // Auth tables — must run first (login depends on these)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        ip TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_email TEXT,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        ip TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] auth tables error:', e); }

  try {
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

  try {
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS risk_alert INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS risk_reason TEXT`);
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS risk_since TEXT`);
  } catch (e) { console.error('[migration] risk_alert columns error:', e); }

  try {
    await pool.query(`ALTER TABLE financial_revenues DROP CONSTRAINT IF EXISTS financial_revenues_status_check`);
    await pool.query(`ALTER TABLE financial_revenues ADD CONSTRAINT financial_revenues_status_check CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado', 'perdido'))`);
  } catch (e) { console.error('[migration] revenues perdido status error:', e); }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS company_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`INSERT INTO company_settings (key, value) VALUES ('monthly_billable_hours', '160') ON CONFLICT (key) DO NOTHING`);
  } catch (e) { console.error('[migration] company_settings error:', e); }

  try {
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(10) DEFAULT 'mrr'`);
  } catch (e) { console.error('[migration] client_type column error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tcv_projects (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        contract_value NUMERIC(10,2) NOT NULL DEFAULT 0,
        estimated_hours NUMERIC(8,2) DEFAULT 0,
        start_date DATE, end_date DATE,
        status VARCHAR(20) DEFAULT 'em_andamento',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] tcv_projects error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tcv_payments (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES tcv_projects(id) ON DELETE CASCADE,
        description TEXT, amount NUMERIC(10,2) NOT NULL,
        due_date DATE, paid_date DATE,
        status VARCHAR(20) DEFAULT 'pendente',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] tcv_payments error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES agency_clients(id) ON DELETE SET NULL`);
  } catch (e) { console.error('[migration] opportunities client_id error:', e); }

  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_type VARCHAR(10) DEFAULT 'mrr'`);
  } catch (e) { console.error('[migration] products billing_type error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2)`);
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)`);
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS installments INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS payment_notes TEXT`);
  } catch (e) { console.error('[migration] opportunities negotiation fields error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS referral_name TEXT`);
  } catch (e) { console.error('[migration] opportunities referral_name error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opp_items JSONB DEFAULT '[]'::jsonb`);
  } catch (e) { console.error('[migration] opportunities opp_items column error:', e); }

  try {
    const NEW_SOURCES = ['Meta Ads', 'Turbinar Instagram', 'Instagram @vanessaraeski', 'TikTok @vanessaraeski'];
    const { rows: [row] } = await pool.query(`SELECT value FROM company_settings WHERE key = 'lead_sources'`);
    if (row) {
      const existing: string[] = JSON.parse(row.value);
      const merged = [...existing];
      for (const s of NEW_SOURCES) {
        if (!merged.includes(s)) {
          // Insert before 'Outro' if it exists, otherwise append
          const outroIdx = merged.indexOf('Outro');
          if (outroIdx >= 0) merged.splice(outroIdx, 0, s);
          else merged.push(s);
        }
      }
      await pool.query(`UPDATE company_settings SET value = $1, updated_at = NOW() WHERE key = 'lead_sources'`, [JSON.stringify(merged)]);
    }
  } catch (e) { console.error('[migration] lead_sources new entries error:', e); }

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

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opportunity_items (
        id SERIAL PRIMARY KEY,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '',
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        value NUMERIC(10,2) NOT NULL DEFAULT 0,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] opportunity_items error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunity_items ALTER COLUMN description SET DEFAULT ''`);
  } catch (e) { /* ignore if table doesn't exist yet */ }

  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS referral_type VARCHAR(10) DEFAULT 'external'`);
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS referral_client_id INTEGER REFERENCES agency_clients(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS referral_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL`);
  } catch (e) { console.error('[migration] referral columns error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_prizes (
        id SERIAL PRIMARY KEY,
        referral_name TEXT NOT NULL,
        referral_type VARCHAR(10) DEFAULT 'external',
        referral_client_id INTEGER REFERENCES agency_clients(id) ON DELETE SET NULL,
        referral_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
        opportunity_title TEXT,
        prize_date DATE NOT NULL DEFAULT CURRENT_DATE,
        prize_type VARCHAR(30) NOT NULL DEFAULT 'presente',
        prize_value NUMERIC(10,2) DEFAULT 0,
        revenue_generated NUMERIC(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) { console.error('[migration] referral_prizes error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunity_activities ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP DEFAULT NULL`);
  } catch (e) { console.error('[migration] opportunity_activities scheduled_at error:', e); }

  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT NULL`);
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_activity_type VARCHAR(20) DEFAULT NULL`);
  } catch (e) { console.error('[migration] opportunities last_activity fields error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routine_items (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT,
        category VARCHAR(50),
        type VARCHAR(10) NOT NULL DEFAULT 'daily',
        weekday INTEGER,
        position INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routine_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES routine_items(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        checked_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, item_id, date)
      )
    `);
    // Seed initial items if table is empty
    const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) as count FROM routine_items`);
    if (Number(count) === 0) {
      const seed = [
        // Daily (type='daily')
        ['Responder novos leads', 'Atender todos os leads que chegaram', 'Atendimento', 'daily', null, 0],
        ['Fazer follow-ups', 'Retomar contatos pendentes e confirmar próximos passos', 'Follow-up', 'daily', null, 1],
        ['Atualizar CRM', 'Registrar todas as interações e atualizar etapas', 'CRM', 'daily', null, 2],
        ['Confirmar agenda do dia', 'Verificar reuniões e compromissos agendados', 'Organização', 'daily', null, 3],
        ['Registrar informações', 'Inserir dados de contatos e interações no sistema', 'CRM', 'daily', null, 4],
        // Segunda (weekday=1)
        ['Revisar metas da semana', 'Verificar onde está em relação às metas e ajustar plano', 'Planejamento', 'weekday', 1, 0],
        ['Organizar agenda', 'Planejar reuniões e atividades da semana', 'Planejamento', 'weekday', 1, 1],
        ['Revisar pipeline', 'Avaliar todas as oportunidades abertas e priorizar', 'Planejamento', 'weekday', 1, 2],
        ['Planejar prospecção da semana', 'Definir canais e quantidade de contatos a prospectar', 'Planejamento', 'weekday', 1, 3],
        // Terça (weekday=2)
        ['Prospectar novos clientes', 'Buscar e abordar potenciais clientes qualificados', 'Prospecção', 'weekday', 2, 0],
        ['Ativar networking', 'Movimentar rede de contatos e parcerias', 'Prospecção', 'weekday', 2, 1],
        ['Buscar indicações', 'Solicitar indicações de clientes e parceiros atuais', 'Prospecção', 'weekday', 2, 2],
        ['Fazer cold outbound', 'Entrar em contato com leads frios via canais definidos', 'Prospecção', 'weekday', 2, 3],
        // Quarta (weekday=3)
        ['Realizar reuniões comerciais', 'Conduzir diagnóstico e apresentar proposta de valor', 'Reuniões', 'weekday', 3, 0],
        ['Diagnosticar clientes', 'Entender dores, objetivos e momento do lead', 'Reuniões', 'weekday', 3, 1],
        ['Apresentar proposta de valor', 'Mostrar como a solução resolve o problema do cliente', 'Reuniões', 'weekday', 3, 2],
        ['Definir próximo passo na reunião', 'Não sair da call sem próxima ação definida', 'Reuniões', 'weekday', 3, 3],
        // Quinta (weekday=4)
        ['Retomar propostas abertas', 'Confirmar recebimento e tirar dúvidas', 'Follow-up', 'weekday', 4, 0],
        ['Confirmar decisões pendentes', 'Fazer contato ativo para avançar oportunidades', 'Follow-up', 'weekday', 4, 1],
        ['Recuperar oportunidades paradas', 'Reativar leads que pararam de responder', 'Follow-up', 'weekday', 4, 2],
        ['Negociar pendências', 'Resolver objeções e encaminhar fechamentos', 'Follow-up', 'weekday', 4, 3],
        // Sexta (weekday=5)
        ['Atualizar CRM (fechamento semanal)', 'Garantir que todas as oportunidades estão atualizadas', 'Gestão', 'weekday', 5, 0],
        ['Revisar indicadores da semana', 'Analisar contatos, reuniões, propostas e conversões', 'Gestão', 'weekday', 5, 1],
        ['Identificar gargalos', 'Avaliar onde as oportunidades estão travando no funil', 'Gestão', 'weekday', 5, 2],
        ['Planejar próxima semana', 'Definir prioridades e ações para a semana seguinte', 'Gestão', 'weekday', 5, 3],
      ];
      for (const [label, description, category, type, weekday, position] of seed) {
        await pool.query(
          `INSERT INTO routine_items (label, description, category, type, weekday, position) VALUES ($1,$2,$3,$4,$5,$6)`,
          [label, description, category, type, weekday, position]
        );
      }
    }
  } catch (e) { console.error('[migration] routine tables error:', e); }

  try {
    await pool.query(`ALTER TABLE routine_items ADD COLUMN IF NOT EXISTS deliverables TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE routine_items ADD COLUMN IF NOT EXISTS how_to TEXT DEFAULT NULL`);
  } catch (e) { console.error('[migration] routine_items deliverables/how_to error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routine_item_users (
        item_id INTEGER REFERENCES routine_items(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (item_id, user_id)
      )
    `);
  } catch (e) { console.error('[migration] routine_item_users error:', e); }

  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS promise TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS deliverables TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS differentials TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS objections TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS pitch TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS faqs TEXT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS social_proof TEXT DEFAULT NULL`);
  } catch (e) { console.error('[migration] products detail columns error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(255) NOT NULL,
        slug      VARCHAR(100) UNIQUE NOT NULL,
        color     VARCHAR(7)   DEFAULT '#3b82f6',
        active    INTEGER      DEFAULT 1,
        created_at TIMESTAMP   DEFAULT NOW()
      )
    `);
    // seed Luna Comunica as company 1
    await pool.query(`
      INSERT INTO companies (id, name, slug, color)
      VALUES (1, 'Luna Comunica', 'luna-comunica', '#3b82f6')
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1`);
    await pool.query(`SELECT setval('companies_id_seq', GREATEST((SELECT MAX(id) FROM companies), 1))`);
  } catch (e) { console.error('[migration] companies error:', e); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_companies (
        user_id    INTEGER REFERENCES users(id)    ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, company_id)
      )
    `);
    // link all existing users to Luna Comunica
    await pool.query(`
      INSERT INTO user_companies (user_id, company_id)
      SELECT id, 1 FROM users
      ON CONFLICT DO NOTHING
    `);
  } catch (e) { console.error('[migration] user_companies error:', e); }

  // Phase 2: company_id on financial tables
  try {
    await pool.query(`ALTER TABLE financial_revenues ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1`);
    await pool.query(`UPDATE financial_revenues SET company_id = 1 WHERE company_id IS NULL`);
  } catch (e) { console.error('[migration] financial_revenues company_id error:', e); }

  try {
    await pool.query(`ALTER TABLE financial_expenses ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1`);
    await pool.query(`UPDATE financial_expenses SET company_id = 1 WHERE company_id IS NULL`);
  } catch (e) { console.error('[migration] financial_expenses company_id error:', e); }

  // Phase 3: company_id on commercial tables
  try {
    await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1`);
    await pool.query(`UPDATE opportunities SET company_id = 1 WHERE company_id IS NULL`);
  } catch (e) { console.error('[migration] opportunities company_id error:', e); }

  try {
    await pool.query(`ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1`);
    await pool.query(`UPDATE agency_clients SET company_id = 1 WHERE company_id IS NULL`);
  } catch (e) { console.error('[migration] agency_clients company_id error:', e); }

  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) DEFAULT 1`);
    await pool.query(`UPDATE products SET company_id = 1 WHERE company_id IS NULL`);
  } catch (e) { console.error('[migration] products company_id error:', e); }

  console.log('✅ Migrations concluídas');
}

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
app.use('/api/referral-prizes', requireAuth, referralPrizesRouter);
app.use('/api/routine',         requireAuth, routineRouter);
app.use('/api/companies',       requireAuth, companiesRouter);

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
