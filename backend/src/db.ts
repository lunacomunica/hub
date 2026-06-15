import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../financeiro.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS financial_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('revenue', 'expense')),
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financial_revenues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    client_name TEXT,
    category_id INTEGER REFERENCES financial_categories(id) ON DELETE SET NULL,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
    is_recurring INTEGER DEFAULT 0,
    recurrence_type TEXT CHECK(recurrence_type IN ('monthly', 'quarterly', 'yearly')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financial_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    category_id INTEGER REFERENCES financial_categories(id) ON DELETE SET NULL,
    supplier TEXT,
    client_name TEXT,
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
    is_fixed INTEGER DEFAULT 0,
    is_client_cost INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agency_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    monthly_fee REAL DEFAULT 0,
    margin_target REAL DEFAULT 30,
    active INTEGER DEFAULT 1,
    start_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    type TEXT DEFAULT 'fixo' CHECK(type IN ('fixo', 'variavel')),
    month INTEGER,
    year INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sales_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    target_revenue REAL DEFAULT 0,
    target_new_clients INTEGER DEFAULT 0,
    target_recurring REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(month, year)
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    client_name TEXT,
    value REAL DEFAULT 0,
    stage TEXT DEFAULT 'prospeccao' CHECK(stage IN ('prospeccao', 'contato', 'proposta', 'negociacao', 'fechado', 'perdido')),
    probability INTEGER DEFAULT 20,
    expected_close_date TEXT,
    service_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financial_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    type TEXT DEFAULT 'realista' CHECK(type IN ('pessimista', 'realista', 'otimista')),
    revenue_projection REAL DEFAULT 0,
    expense_projection REAL DEFAULT 0,
    new_clients INTEGER DEFAULT 0,
    churn_clients INTEGER DEFAULT 0,
    avg_ticket REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Products and goal items tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL DEFAULT 0,
    category TEXT,
    description TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sales_goal_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES sales_goals(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    UNIQUE(goal_id, product_id)
  );
`);

// Add product_id and closed_at to opportunities if missing
const oppCols = (db.prepare('PRAGMA table_info(opportunities)').all() as { name: string }[]).map(c => c.name);
if (!oppCols.includes('product_id')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE SET NULL`);
  db.exec(`ALTER TABLE opportunities ADD COLUMN closed_at TEXT`);
}
if (!oppCols.includes('temperature')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN temperature TEXT DEFAULT 'morno'`);
}
if (!oppCols.includes('next_followup')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN next_followup TEXT`);
}
if (!oppCols.includes('owner_id')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
}
if (!oppCols.includes('source')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN source TEXT`);
}
if (!oppCols.includes('stage_entered_at')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN stage_entered_at TEXT`);
  db.exec(`UPDATE opportunities SET stage_entered_at = created_at WHERE stage_entered_at IS NULL`);
}
if (!oppCols.includes('lost_reason')) {
  db.exec(`ALTER TABLE opportunities ADD COLUMN lost_reason TEXT`);
}

// Activity log for opportunities
db.exec(`
  CREATE TABLE IF NOT EXISTS opportunity_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'nota' CHECK(type IN ('nota', 'ligacao', 'email', 'reuniao', 'whatsapp', 'proposta')),
    content TEXT NOT NULL,
    author TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add churn columns if missing (safe migration)
const agencyClientsCols = (db.prepare('PRAGMA table_info(agency_clients)').all() as { name: string }[]).map(c => c.name);
if (!agencyClientsCols.includes('churn_date')) {
  db.exec(`ALTER TABLE agency_clients ADD COLUMN churn_date TEXT`);
  db.exec(`ALTER TABLE agency_clients ADD COLUMN churn_reason TEXT`);
  db.exec(`ALTER TABLE agency_clients ADD COLUMN churn_notes TEXT`);
  db.exec(`ALTER TABLE agency_clients ADD COLUMN reactivation_potential TEXT DEFAULT 'nao'`);
  db.exec(`ALTER TABLE agency_clients ADD COLUMN service_type TEXT`);
}

// Company cards table
db.exec(`
  CREATE TABLE IF NOT EXISTS company_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    last4 TEXT,
    brand TEXT DEFAULT 'visa' CHECK(brand IN ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'outro')),
    credit_limit REAL DEFAULT 0,
    closing_day INTEGER,
    due_day INTEGER,
    active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add card_id to financial_expenses if missing
const expCols = (db.prepare('PRAGMA table_info(financial_expenses)').all() as { name: string }[]).map(c => c.name);
if (!expCols.includes('card_id')) {
  db.exec(`ALTER TABLE financial_expenses ADD COLUMN card_id INTEGER REFERENCES company_cards(id) ON DELETE SET NULL`);
}

// Add client_id to financial_revenues if missing
const revCols = (db.prepare('PRAGMA table_info(financial_revenues)').all() as {name:string}[]).map(c => c.name);
if (!revCols.includes('client_id')) {
  db.exec(`ALTER TABLE financial_revenues ADD COLUMN client_id INTEGER REFERENCES agency_clients(id) ON DELETE SET NULL`);
}

// People (HR) management tables
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cpf TEXT,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL,
    department TEXT,
    salary REAL NOT NULL DEFAULT 0,
    admission_date TEXT NOT NULL,
    status TEXT DEFAULT 'ativo' CHECK(status IN ('ativo', 'ferias', 'licenca', 'inativo')),
    notes TEXT,
    avatar_color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employee_salary_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    previous_salary REAL,
    new_salary REAL NOT NULL,
    previous_role TEXT,
    new_role TEXT,
    change_date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employee_overtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    hours REAL NOT NULL DEFAULT 0,
    rate_multiplier REAL DEFAULT 1.5,
    value REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employee_payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    gross_salary REAL,
    net_salary REAL,
    deductions REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employee_feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    type TEXT DEFAULT 'positivo' CHECK(type IN ('positivo', 'construtivo', 'avaliacao')),
    content TEXT NOT NULL,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Users table + login_attempts (brute force protection)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'comercial' CHECK(role IN ('admin', 'comercial', 'financeiro')),
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip TEXT,
    success INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT,
    action TEXT NOT NULL,
    resource TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add photo_path to employees if missing
const empCols = (db.prepare('PRAGMA table_info(employees)').all() as { name: string }[]).map(c => c.name);
if (!empCols.includes('photo_path')) {
  db.exec(`ALTER TABLE employees ADD COLUMN photo_path TEXT`);
}

// Pipeline stages table (custom kanban columns)
db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    color TEXT DEFAULT '#94a3b8',
    bg_color TEXT DEFAULT 'rgba(148,163,184,0.12)',
    position INTEGER DEFAULT 0,
    is_terminal INTEGER DEFAULT 0
  );
`);

// Seed default stages if empty
const stageCount = (db.prepare('SELECT COUNT(*) as c FROM pipeline_stages').get() as { c: number }).c;
if (stageCount === 0) {
  const insStage = db.prepare('INSERT INTO pipeline_stages (key, label, color, bg_color, position, is_terminal) VALUES (?,?,?,?,?,?)');
  const defaultStages: [string, string, string, string, number, number][] = [
    ['prospeccao', 'Prospecção',  '#94a3b8', 'rgba(100,116,139,0.15)', 0, 0],
    ['contato',    'Contato',     '#3b82f6', 'rgba(59,130,246,0.12)',  1, 0],
    ['proposta',   'Proposta',    '#8b5cf6', 'rgba(139,92,246,0.12)', 2, 0],
    ['negociacao', 'Negociação',  '#f59e0b', 'rgba(245,158,11,0.12)', 3, 0],
    ['fechado',    'Fechado',     '#10b981', 'rgba(16,185,129,0.12)', 4, 1],
    ['perdido',    'Perdido',     '#ef4444', 'rgba(239,68,68,0.12)',  5, 1],
  ];
  defaultStages.forEach(args => insStage.run(...args));
}

// Remove CHECK constraint from opportunities.stage to support custom stages
const oppSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='opportunities'").get() as any)?.sql || '';
if (oppSql.includes("CHECK(stage IN")) {
  db.exec(`
    CREATE TABLE opportunities_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client_name TEXT,
      value REAL DEFAULT 0,
      stage TEXT DEFAULT 'prospeccao',
      probability INTEGER DEFAULT 20,
      expected_close_date TEXT,
      service_type TEXT,
      notes TEXT,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO opportunities_v2 SELECT id, title, client_name, value, stage, probability, expected_close_date, service_type, notes, product_id, closed_at, created_at, updated_at FROM opportunities;
    DROP TABLE opportunities;
    ALTER TABLE opportunities_v2 RENAME TO opportunities;
  `);
}

// Seed admin user if not exists
const adminExists = db.prepare("SELECT id FROM users WHERE email = 'vanessaraeski@gmail.com'").get();
if (!adminExists) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('Luna@2026', 10);
  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Vanessa', 'vanessaraeski@gmail.com', hash, 'admin');
}

// Seed default categories if empty
const categoryCount = (db.prepare('SELECT COUNT(*) as c FROM financial_categories').get() as { c: number }).c;
if (categoryCount === 0) {
  const insertCat = db.prepare('INSERT INTO financial_categories (name, type, color) VALUES (?, ?, ?)');
  const seedCategories: [string, string, string][] = [
    ['Mensalidade', 'revenue', '#10b981'],
    ['Projeto', 'revenue', '#3b82f6'],
    ['Consultoria', 'revenue', '#8b5cf6'],
    ['Bônus/Extra', 'revenue', '#f59e0b'],
    ['Salários', 'expense', '#ef4444'],
    ['Ferramentas/Software', 'expense', '#f97316'],
    ['Mídia/Ads', 'expense', '#ec4899'],
    ['Infraestrutura', 'expense', '#14b8a6'],
    ['Impostos', 'expense', '#6b7280'],
    ['Marketing Próprio', 'expense', '#a855f7'],
    ['Outros', 'expense', '#64748b'],
  ];
  seedCategories.forEach(([name, type, color]) => insertCat.run(name, type, color));
}

export default db;
