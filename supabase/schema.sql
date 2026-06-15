-- ============================================================
-- Hub Gestão — Schema PostgreSQL (Supabase)
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('revenue', 'expense')),
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_revenues (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  client_name TEXT,
  category_id INTEGER REFERENCES financial_categories(id) ON DELETE SET NULL,
  client_id INTEGER,
  amount NUMERIC NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  is_recurring INTEGER DEFAULT 0,
  recurrence_type TEXT CHECK(recurrence_type IN ('monthly', 'quarterly', 'yearly')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agency_clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_fee NUMERIC DEFAULT 0,
  margin_target NUMERIC DEFAULT 30,
  active INTEGER DEFAULT 1,
  start_date TEXT,
  notes TEXT,
  churn_date TEXT,
  churn_reason TEXT,
  churn_notes TEXT,
  reactivation_potential TEXT DEFAULT 'nao',
  service_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_costs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT DEFAULT 'fixo' CHECK(type IN ('fixo', 'variavel')),
  month INTEGER,
  year INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  category_id INTEGER REFERENCES financial_categories(id) ON DELETE SET NULL,
  supplier TEXT,
  client_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  is_fixed INTEGER DEFAULT 0,
  is_client_cost INTEGER DEFAULT 0,
  card_id INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_goals (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  target_revenue NUMERIC DEFAULT 0,
  target_new_clients INTEGER DEFAULT 0,
  target_recurring NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  category TEXT,
  description TEXT,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_goal_items (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES sales_goals(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  UNIQUE(goal_id, product_id)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client_name TEXT,
  value NUMERIC DEFAULT 0,
  stage TEXT DEFAULT 'prospeccao',
  probability INTEGER DEFAULT 20,
  expected_close_date TEXT,
  service_type TEXT,
  notes TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  closed_at TEXT,
  temperature TEXT DEFAULT 'morno',
  next_followup TEXT,
  owner_id INTEGER,
  source TEXT,
  stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
  lost_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_scenarios (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  type TEXT DEFAULT 'realista' CHECK(type IN ('pessimista', 'realista', 'otimista')),
  revenue_projection NUMERIC DEFAULT 0,
  expense_projection NUMERIC DEFAULT 0,
  new_clients INTEGER DEFAULT 0,
  churn_clients INTEGER DEFAULT 0,
  avg_ticket NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_cards (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  last4 TEXT,
  brand TEXT DEFAULT 'visa' CHECK(brand IN ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'outro')),
  credit_limit NUMERIC DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL,
  department TEXT,
  salary NUMERIC NOT NULL DEFAULT 0,
  admission_date TEXT NOT NULL,
  status TEXT DEFAULT 'ativo' CHECK(status IN ('ativo', 'ferias', 'licenca', 'inativo')),
  notes TEXT,
  avatar_color TEXT DEFAULT '#6366f1',
  photo_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_salary_history (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  previous_salary NUMERIC,
  new_salary NUMERIC NOT NULL,
  previous_role TEXT,
  new_role TEXT,
  change_date TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_overtime (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  hours NUMERIC NOT NULL DEFAULT 0,
  rate_multiplier NUMERIC DEFAULT 1.5,
  value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_payslips (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  gross_salary NUMERIC,
  net_salary NUMERIC,
  deductions NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_feedbacks (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  type TEXT DEFAULT 'positivo' CHECK(type IN ('positivo', 'construtivo', 'avaliacao')),
  content TEXT NOT NULL,
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'comercial' CHECK(role IN ('admin', 'comercial', 'financeiro')),
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  success INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  user_email TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  bg_color TEXT DEFAULT 'rgba(148,163,184,0.12)',
  position INTEGER DEFAULT 0,
  is_terminal INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS opportunity_activities (
  id SERIAL PRIMARY KEY,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'nota' CHECK(type IN ('nota', 'ligacao', 'email', 'reuniao', 'whatsapp', 'proposta')),
  content TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed: pipeline stages padrão ─────────────────────────────────────────────
INSERT INTO pipeline_stages (key, label, color, bg_color, position, is_terminal)
VALUES
  ('prospeccao', 'Prospecção',  '#94a3b8', 'rgba(100,116,139,0.15)', 0, 0),
  ('contato',    'Contato',     '#3b82f6', 'rgba(59,130,246,0.12)',  1, 0),
  ('proposta',   'Proposta',    '#8b5cf6', 'rgba(139,92,246,0.12)', 2, 0),
  ('negociacao', 'Negociação',  '#f59e0b', 'rgba(245,158,11,0.12)', 3, 0),
  ('fechado',    'Fechado',     '#10b981', 'rgba(16,185,129,0.12)', 4, 1),
  ('perdido',    'Perdido',     '#ef4444', 'rgba(239,68,68,0.12)',  5, 1)
ON CONFLICT (key) DO NOTHING;

-- ── Seed: categorias financeiras padrão ──────────────────────────────────────
INSERT INTO financial_categories (name, type, color) VALUES
  ('Mensalidade',        'revenue', '#10b981'),
  ('Projeto',            'revenue', '#3b82f6'),
  ('Consultoria',        'revenue', '#8b5cf6'),
  ('Bônus/Extra',        'revenue', '#f59e0b'),
  ('Salários',           'expense', '#ef4444'),
  ('Ferramentas/Software','expense','#f97316'),
  ('Mídia/Ads',          'expense', '#ec4899'),
  ('Infraestrutura',     'expense', '#14b8a6'),
  ('Impostos',           'expense', '#6b7280'),
  ('Marketing Próprio',  'expense', '#a855f7'),
  ('Outros',             'expense', '#64748b')
ON CONFLICT DO NOTHING;

-- ── Seed: usuário admin ───────────────────────────────────────────────────────
-- ATENÇÃO: substitua o hash abaixo pelo hash bcrypt da sua senha
-- Gere com: node -e "const b=require('bcryptjs');console.log(b.hashSync('Luna@2026',10))"
-- INSERT INTO users (name, email, password_hash, role)
-- VALUES ('Vanessa', 'vanessaraeski@gmail.com', '$2a$10$HASH_AQUI', 'admin')
-- ON CONFLICT (email) DO NOTHING;
