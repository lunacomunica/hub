import type { Category, Revenue, Expense, AgencyClient, ClientCost, SalesGoal, Opportunity, OppActivity, PipelineStage, Scenario, DashboardData, User } from '../types';

const BASE = '/api';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth-token');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

  let res: Response;
  try {
    res = await fetch(`${BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      ...options,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('O servidor demorou demais para responder. Tente novamente.');
    }
    throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    localStorage.removeItem('auth-token');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Dashboard
export const getDashboard = (month?: number, year?: number): Promise<DashboardData> => {
  const params = new URLSearchParams();
  if (month !== undefined) params.set('month', String(month)); // 0 = annual view
  if (year) params.set('year', String(year));
  return req(`/dashboard?${params}`);
};

// Revenues
export const getRevenues = (filters?: { month?: number; year?: number; status?: string; client_name?: string; category_id?: number }): Promise<Revenue[]> => {
  const params = new URLSearchParams();
  if (filters?.month) params.set('month', String(filters.month));
  if (filters?.year) params.set('year', String(filters.year));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.client_name) params.set('client_name', filters.client_name);
  if (filters?.category_id) params.set('category_id', String(filters.category_id));
  return req(`/revenues?${params}`);
};
export const createRevenue = (data: Partial<Revenue>): Promise<Revenue> =>
  req('/revenues', { method: 'POST', body: JSON.stringify(data) });
export const updateRevenue = (id: number, data: Partial<Revenue>): Promise<Revenue> =>
  req(`/revenues/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updateRevenueStatus = (id: number, status: string): Promise<{ success: boolean; status: string }> =>
  req(`/revenues/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const deleteRevenue = (id: number): Promise<{ success: boolean }> =>
  req(`/revenues/${id}`, { method: 'DELETE' });
export const bulkUpdateRevenues = (ids: number[], updates: Record<string, unknown>): Promise<{ success: boolean; updated: number }> =>
  req('/revenues/bulk', { method: 'PATCH', body: JSON.stringify({ ids, updates }) });

// Expenses
export const getExpenses = (filters?: { month?: number; year?: number; status?: string; is_fixed?: number; is_client_cost?: number; category_id?: number }): Promise<Expense[]> => {
  const params = new URLSearchParams();
  if (filters?.month) params.set('month', String(filters.month));
  if (filters?.year) params.set('year', String(filters.year));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.is_fixed !== undefined) params.set('is_fixed', String(filters.is_fixed));
  if (filters?.is_client_cost !== undefined) params.set('is_client_cost', String(filters.is_client_cost));
  if (filters?.category_id) params.set('category_id', String(filters.category_id));
  return req(`/expenses?${params}`);
};
export const createExpense = (data: Partial<Expense>): Promise<Expense> =>
  req('/expenses', { method: 'POST', body: JSON.stringify(data) });
export const updateExpense = (id: number, data: Partial<Expense>): Promise<Expense> =>
  req(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updateExpenseStatus = (id: number, status: string): Promise<{ success: boolean; status: string }> =>
  req(`/expenses/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const deleteExpense = (id: number): Promise<{ success: boolean }> =>
  req(`/expenses/${id}`, { method: 'DELETE' });
export const bulkUpdateExpenses = (ids: number[], updates: Record<string, unknown>): Promise<{ success: boolean; updated: number }> =>
  req('/expenses/bulk', { method: 'PATCH', body: JSON.stringify({ ids, updates }) });

// Categories
export const getCategories = (type?: 'revenue' | 'expense'): Promise<Category[]> => {
  const params = type ? `?type=${type}` : '';
  return req(`/categories${params}`);
};
export const createCategory = (data: Partial<Category>): Promise<Category> =>
  req('/categories', { method: 'POST', body: JSON.stringify(data) });
export const updateCategory = (id: number, data: Partial<Category>): Promise<Category> =>
  req(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCategory = (id: number): Promise<{ success: boolean }> =>
  req(`/categories/${id}`, { method: 'DELETE' });

// Clients
export const getClients = (): Promise<AgencyClient[]> => req('/clients');
export const getClient = (id: number): Promise<AgencyClient> => req(`/clients/${id}`);
export const createClient = (data: Partial<AgencyClient>): Promise<AgencyClient> =>
  req('/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id: number, data: Partial<AgencyClient>): Promise<AgencyClient> =>
  req(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClient = (id: number): Promise<{ success: boolean }> =>
  req(`/clients/${id}`, { method: 'DELETE' });
export const getClientCosts = (id: number): Promise<ClientCost[]> => req(`/clients/${id}/costs`);
export const addClientCost = (id: number, data: Partial<ClientCost>): Promise<ClientCost> =>
  req(`/clients/${id}/costs`, { method: 'POST', body: JSON.stringify(data) });
export const deleteClientCost = (clientId: number, costId: number): Promise<{ success: boolean }> =>
  req(`/clients/${clientId}/costs/${costId}`, { method: 'DELETE' });

// Sales Goals
export const getSalesGoals = (filters?: { month?: number; year?: number }): Promise<SalesGoal[]> => {
  const params = new URLSearchParams();
  if (filters?.month) params.set('month', String(filters.month));
  if (filters?.year) params.set('year', String(filters.year));
  return req(`/sales-goals?${params}`);
};
export const getSalesGoal = (month: number, year: number): Promise<{ goal: SalesGoal | null; actual_revenue: number; actual_new_clients: number }> =>
  req(`/sales-goals/${month}/${year}`);
export const createSalesGoal = (data: Partial<SalesGoal>): Promise<SalesGoal> =>
  req('/sales-goals', { method: 'POST', body: JSON.stringify(data) });
export const updateSalesGoal = (id: number, data: Partial<SalesGoal>): Promise<SalesGoal> =>
  req(`/sales-goals/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Opportunities
export interface OppSummary {
  total_count: number; total_value: number; weighted_value: number;
  by_stage: { stage: string; count: number; total_value: number }[];
  win_rate: number; won_value: number; negotiation_value: number;
  overdue_followups: number; today_followups: number; soon_followups: number;
  lost_value: number;
  lost_reasons: { reason: string; count: number; total_value: number }[];
}
export const getOpportunities = (filters?: { stage?: string }): Promise<{ items: Opportunity[]; summary: OppSummary }> => {
  const params = filters?.stage ? `?stage=${filters.stage}` : '';
  return req(`/opportunities${params}`);
};
export const createOpportunity = (data: Partial<Opportunity>): Promise<Opportunity> =>
  req('/opportunities', { method: 'POST', body: JSON.stringify(data) });
export const updateOpportunity = (id: number, data: Partial<Opportunity>): Promise<Opportunity> =>
  req(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteOpportunity = (id: number): Promise<{ success: boolean }> =>
  req(`/opportunities/${id}`, { method: 'DELETE' });

// Opportunity activities
export const getOppActivities = (oppId: number): Promise<OppActivity[]> =>
  req(`/opportunities/${oppId}/activities`);
export const addOppActivity = (oppId: number, data: { type: string; content: string; author?: string }): Promise<OppActivity> =>
  req(`/opportunities/${oppId}/activities`, { method: 'POST', body: JSON.stringify(data) });
export const deleteOppActivity = (oppId: number, actId: number): Promise<{ success: boolean }> =>
  req(`/opportunities/${oppId}/activities/${actId}`, { method: 'DELETE' });

// Pipeline stages
export const getPipelineStages = (): Promise<PipelineStage[]> =>
  req('/opportunities/stages');
export const createPipelineStage = (data: { key: string; label: string; color?: string; bg_color?: string }): Promise<PipelineStage> =>
  req('/opportunities/stages', { method: 'POST', body: JSON.stringify(data) });
export const updatePipelineStage = (id: number, data: Partial<PipelineStage>): Promise<PipelineStage> =>
  req(`/opportunities/stages/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePipelineStage = (id: number): Promise<{ success: boolean }> =>
  req(`/opportunities/stages/${id}`, { method: 'DELETE' });

// Scenarios
export const getScenarios = (month?: number, year?: number): Promise<{ scenarios: Scenario[]; actual: { revenue: number; expenses: number; profit: number } | null }> => {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  return req(`/scenarios?${params}`);
};
export const createScenario = (data: Partial<Scenario>): Promise<Scenario> =>
  req('/scenarios', { method: 'POST', body: JSON.stringify(data) });
export const updateScenario = (id: number, data: Partial<Scenario>): Promise<Scenario> =>
  req(`/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteScenario = (id: number): Promise<{ success: boolean }> =>
  req(`/scenarios/${id}`, { method: 'DELETE' });

// Cards
export interface CompanyCard {
  id: number; name: string; last4: string | null; brand: string;
  credit_limit: number; closing_day: number | null; due_day: number | null;
  active: number; notes: string | null;
  used_this_month?: number; current_invoice?: number;
}
export const getCards = (activeOnly = false): Promise<CompanyCard[]> =>
  req(`/cards${activeOnly ? '?active=1' : ''}`);
export const createCard = (data: Partial<CompanyCard>): Promise<CompanyCard> =>
  req('/cards', { method: 'POST', body: JSON.stringify(data) });
export const updateCard = (id: number, data: Partial<CompanyCard>): Promise<CompanyCard> =>
  req(`/cards/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCard = (id: number): Promise<{ success: boolean }> =>
  req(`/cards/${id}`, { method: 'DELETE' });
export const getCardExpenses = (id: number, month?: number, year?: number) => {
  const p = new URLSearchParams();
  if (month) p.set('month', String(month));
  if (year) p.set('year', String(year));
  return req<object[]>(`/cards/${id}/expenses?${p}`);
};

// Products
export const getProducts = (activeOnly = false): Promise<{ id: number; name: string; price: number; category: string | null; description: string | null; active: number }[]> =>
  req(`/products${activeOnly ? '?active=true' : ''}`);

// Auth
export const login = (email: string, password: string) =>
  req<{ token: string; user: { id: number; name: string; email: string; role: string } }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
export const getMe = () => req<{ id: number; name: string; email: string; role: string }>('/auth/me');
export const getUsers = () => req<User[]>('/auth/users');
export const createUser = (data: { name: string; email: string; password: string; role: string }) =>
  req('/auth/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUser = (id: number, data: Partial<{ name: string; password: string; role: string; active: number }>) =>
  req(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteUser = (id: number) => req(`/auth/users/${id}`, { method: 'DELETE' });

// Auth / Profile
export const updateProfile = (data: { name?: string; current_password?: string; new_password?: string }): Promise<{ id: number; name: string; email: string; role: string }> =>
  req('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });

// Import
export async function previewImport(file: File, filter?: 'revenue' | 'expense'): Promise<{ rows: { date: string; description: string; amount: number; category_id?: number; supplier?: string; duplicate?: boolean }[]; total: number }> {
  const token = localStorage.getItem('auth-token');
  const formData = new FormData();
  formData.append('file', file);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  const url = filter ? `/api/import/preview?filter=${filter}` : '/api/import/preview';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao processar arquivo' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export const bulkImportRevenues = (items: { description: string; date: string; amount: number; category_id?: number; client_name?: string }[]): Promise<{ imported: number }> =>
  req('/revenues/bulk-import', { method: 'POST', body: JSON.stringify({ items }) });

export const bulkImportExpenses = (items: { description: string; date: string; amount: number; category_id?: number; supplier?: string }[]): Promise<{ imported: number }> =>
  req('/expenses/bulk-import', { method: 'POST', body: JSON.stringify({ items }) });
