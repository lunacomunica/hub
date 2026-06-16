export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'comercial' | 'financeiro';
  active: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'revenue' | 'expense';
  color: string;
  created_at: string;
}

export interface Revenue {
  id: number;
  description: string;
  client_name: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  amount: number;
  date: string;
  due_date: string | null;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado' | 'perdido';
  client_id: number | null;
  client_display_name: string | null;
  is_recurring: number;
  recurrence_type: 'monthly' | 'quarterly' | 'yearly' | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: number;
  description: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  supplier: string | null;
  client_name: string | null;
  amount: number;
  date: string;
  due_date: string | null;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  is_fixed: number;
  is_client_cost: number;
  card_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyClient {
  id: number;
  name: string;
  monthly_fee: number;
  margin_target: number;
  active: number;
  start_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_type?: 'mrr' | 'tcv' | 'ambos';
  // risk alert (manual override)
  risk_alert?: number;
  risk_reason?: string | null;
  risk_since?: string | null;
  // computed
  monthly_cost?: number;
  allocated_fixed?: number;
  avg_shared_fixed?: number;
  margin?: number;
  margin_percent?: number;
  health?: 'saudavel' | 'atencao' | 'critico' | 'em_risco';
  costs?: ClientCost[];
}

export interface TcvPayment {
  id: number;
  project_id: number;
  description: string | null;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: 'pendente' | 'pago' | 'atrasado';
  created_at: string;
}

export interface TcvProject {
  id: number;
  client_id: number;
  client_name: string;
  title: string;
  contract_value: number;
  estimated_hours: number;
  start_date: string | null;
  end_date: string | null;
  status: 'proposta' | 'em_andamento' | 'concluido' | 'cancelado';
  notes: string | null;
  created_at: string;
  updated_at: string;
  // computed
  hour_cost: number;
  project_cost: number;
  margin: number;
  margin_pct: number;
  paid_amount: number;
  pending_amount: number;
  overdue_amount: number;
  payments: TcvPayment[];
}

export interface ClientCost {
  id: number;
  client_id: number;
  description: string;
  amount: number;
  type: 'fixo' | 'variavel';
  month: number | null;
  year: number | null;
  created_at: string;
}

export interface SalesGoal {
  id: number;
  month: number;
  year: number;
  target_revenue: number;
  target_new_clients: number;
  target_recurring: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: number;
  title: string;
  client_name: string | null;
  value: number;
  stage: string;
  probability: number;
  temperature: 'frio' | 'morno' | 'quente';
  next_followup: string | null;
  owner_id: number | null;
  owner_name: string | null;
  source: string | null;
  days_in_stage: number;
  activity_count: number;
  expected_close_date: string | null;
  service_type: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OppActivity {
  id: number;
  opportunity_id: number;
  type: 'nota' | 'ligacao' | 'email' | 'reuniao' | 'whatsapp' | 'proposta';
  content: string;
  author: string | null;
  created_at: string;
}

export interface PipelineStage {
  id: number;
  key: string;
  label: string;
  color: string;
  bg_color: string;
  position: number;
  is_terminal: number;
}

export interface Scenario {
  id: number;
  name: string;
  month: number;
  year: number;
  type: 'pessimista' | 'realista' | 'otimista';
  revenue_projection: number;
  expense_projection: number;
  new_clients: number;
  churn_clients: number;
  avg_ticket: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  profit_margin: number;
}

export interface MonthlyTrend {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ClientHealth extends AgencyClient {
  monthly_cost: number;
  margin: number;
  margin_percent: number;
  health: 'saudavel' | 'atencao' | 'critico';
}

export interface DashboardData {
  summary: DashboardSummary;
  monthly_trend: MonthlyTrend[];
  revenue_by_category: { name: string; color: string; total: number }[];
  expense_by_category: { name: string; color: string; total: number }[];
  top_clients: { client_name: string; total: number }[];
  opportunities_summary: { stage: string; count: number; total_value: number; weighted_value: number }[];
  goal_progress: { target_revenue: number; actual_revenue: number; progress_percent: number } | null;
  overdue: { revenues: number; expenses: number };
}
