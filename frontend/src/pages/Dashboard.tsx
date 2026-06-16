import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Percent, AlertCircle, RefreshCw, Target, X, ChevronRight } from 'lucide-react';
import { getDashboard, getRevenues, getExpenses } from '../api';
import type { DashboardData, Revenue, Expense } from '../types';
import { useTheme } from '../context/ThemeContext';

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${Number(v).toFixed(1)}%`;

const STAGE_LABELS: Record<string, string> = {
  prospeccao: 'Prospecção',
  contato: 'Contato',
  proposta: 'Proposta',
  negociacao: 'Negociação',
};

export default function Dashboard() {
  const now = new Date();
  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Drill-down panel
  const [drilldown, setDrilldown] = useState<'revenue' | 'expense' | null>(null);
  const [drillItems, setDrillItems] = useState<(Revenue | Expense)[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const { theme } = useTheme();
  const tooltipStyle = theme === 'dark'
    ? { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' }
    : { backgroundColor: '#ffffff', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#1e293b' };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const d = await getDashboard(viewMode === 'annual' ? 0 : month, year);
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year, viewMode]);

  const months = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ];

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-slate-400">{error}</p>
        <button onClick={load} className="btn-primary flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const openDrilldown = async (type: 'revenue' | 'expense') => {
    setDrilldown(type);
    setDrillItems([]);
    setDrillLoading(true);
    try {
      const filters = viewMode === 'monthly'
        ? { month: month, year: year }
        : { year: year };
      if (type === 'revenue') {
        const rows = await getRevenues(filters);
        setDrillItems(rows);
      } else {
        const rows = await getExpenses(filters);
        setDrillItems(rows);
      }
    } catch { /* ignore */ }
    finally { setDrillLoading(false); }
  };

  const { summary, monthly_trend, revenue_by_category, expense_by_category, top_clients, opportunities_summary, goal_progress, overdue } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Dashboard Financeiro</h1>
        <div className="flex flex-col items-end gap-2">
          {/* Toggle Mensal / Anual */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-input)' }}>
            <button
              onClick={() => setViewMode('monthly')}
              className="text-sm px-4 py-1.5 transition-colors whitespace-nowrap"
              style={{
                background: viewMode === 'monthly' ? 'var(--primary, #6366f1)' : 'transparent',
                color: viewMode === 'monthly' ? '#fff' : 'var(--text-secondary)',
              }}
            >Mensal</button>
            <button
              onClick={() => setViewMode('annual')}
              className="text-sm px-4 py-1.5 transition-colors whitespace-nowrap"
              style={{
                background: viewMode === 'annual' ? 'var(--primary, #6366f1)' : 'transparent',
                color: viewMode === 'annual' ? '#fff' : 'var(--text-secondary)',
              }}
            >Anual</button>
          </div>
          {/* Selectors */}
          <div className="flex items-center gap-2">
            {viewMode === 'monthly' && (
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="input-dark text-sm py-1.5"
              >
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            )}
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="input-dark text-sm py-1.5"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Overdue alerts */}
      {(overdue.revenues > 0 || overdue.expenses > 0) && (
        <div className="flex gap-3">
          {overdue.revenues > 0 && (
            <div className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertCircle size={15} />
              <span>{overdue.revenues} receita{overdue.revenues > 1 ? 's' : ''} em atraso</span>
            </div>
          )}
          {overdue.expenses > 0 && (
            <div className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-amber-400" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <AlertCircle size={15} />
              <span>{overdue.expenses} despesa{overdue.expenses > 1 ? 's' : ''} em atraso</span>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Receita Total" value={brl(summary.total_revenue)} color="emerald" icon={<TrendingUp size={20} />} onClick={() => openDrilldown('revenue')} />
        <KpiCard label="Despesas Total" value={brl(summary.total_expenses)} color="red" icon={<TrendingDown size={20} />} onClick={() => openDrilldown('expense')} />
        <KpiCard
          label="Lucro Líquido"
          value={brl(summary.net_profit)}
          color={summary.net_profit >= 0 ? 'blue' : 'red'}
          icon={<DollarSign size={20} />}
        />
        <KpiCard
          label="Margem de Lucro"
          value={pct(summary.profit_margin)}
          color={summary.profit_margin >= 30 ? 'emerald' : summary.profit_margin >= 15 ? 'amber' : 'red'}
          icon={<Percent size={20} />}
        />
      </div>

      {/* Goal progress */}
      {goal_progress === null ? (
        <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-slate-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Target size={15} className="shrink-0" />
          <span>Nenhuma meta configurada para este mês — configure em <span className="text-blue-400">Planejamento</span></span>
        </div>
      ) : (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={15} className={
                goal_progress.progress_percent >= 100 ? 'text-emerald-400' :
                goal_progress.progress_percent >= 80 ? 'text-blue-400' :
                goal_progress.progress_percent >= 50 ? 'text-amber-400' : 'text-red-400'
              } />
              <span className="text-sm font-medium text-slate-300">Meta do mês</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                goal_progress.progress_percent >= 100
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : goal_progress.progress_percent >= 80
                  ? 'bg-blue-500/20 text-blue-400'
                  : goal_progress.progress_percent >= 50
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {goal_progress.progress_percent >= 100
                  ? '✅ Meta atingida!'
                  : goal_progress.progress_percent >= 80
                  ? 'Quase lá!'
                  : goal_progress.progress_percent >= 50
                  ? 'Em andamento'
                  : 'Atenção: meta em risco'}
              </span>
            </div>
            <span className="text-sm text-slate-400">
              {brl(goal_progress.actual_revenue)} / {brl(goal_progress.target_revenue)}
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div
              className={`h-full rounded-full transition-all ${
                goal_progress.progress_percent >= 100
                  ? 'bg-emerald-500 animate-pulse'
                  : goal_progress.progress_percent >= 80
                  ? 'bg-blue-500'
                  : goal_progress.progress_percent >= 50
                  ? 'bg-amber-400'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(goal_progress.progress_percent, 100)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-slate-500 text-right">{pct(goal_progress.progress_percent)} atingido</div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Line chart */}
        <div className="col-span-2 card p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">
            {viewMode === 'annual' ? `Receita vs Despesas — ${year}` : 'Receita vs Despesas — últimos 6 meses'}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly_trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3e" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Receita" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="Despesas" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" name="Lucro" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Opportunities funnel */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Funil de Oportunidades</h2>
          {opportunities_summary.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Nenhuma oportunidade ativa</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={opportunities_summary.map(o => ({ ...o, stage: STAGE_LABELS[o.stage] || o.stage }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3e" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}`} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10, fill: '#94a3b8' }} width={70} />
                <Tooltip formatter={(v: number, name: string) => name === 'count' ? v : brl(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Qtd" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Pie charts row */}
      <div className="grid grid-cols-2 gap-4">
        <PieSection title="Receitas por Categoria" data={revenue_by_category} />
        <PieSection title="Despesas por Categoria" data={expense_by_category} />
      </div>

      {/* Top clients */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Top 5 Clientes por Receita</h2>
        {top_clients.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">Nenhuma receita com cliente registrada neste mês</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                <th className="th text-left py-2">#</th>
                <th className="th text-left py-2">Cliente</th>
                <th className="th text-right py-2">Receita</th>
                <th className="th text-right py-2">% do total</th>
              </tr>
            </thead>
            <tbody>
              {top_clients.map((c, i) => (
                <tr key={i} className="tr">
                  <td className="td py-2 text-slate-500">{i + 1}</td>
                  <td className="td py-2 font-medium text-slate-200">{c.client_name}</td>
                  <td className="td py-2 text-right text-emerald-400 font-medium">{brl(c.total)}</td>
                  <td className="td py-2 text-right text-slate-400">
                    {summary.total_revenue > 0 ? pct((c.total / summary.total_revenue) * 100) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drilldown panel */}
      {drilldown && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDrilldown(null)} />
          {/* Drawer */}
          <div className="fixed top-0 right-0 h-full w-full max-w-xl z-50 flex flex-col shadow-2xl" style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-card)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border-card)' }}>
              <div>
                <h2 className="font-semibold text-white">
                  {drilldown === 'revenue' ? '📥 Receitas' : '📤 Despesas'}
                  <span className="text-slate-400 font-normal text-sm ml-2">
                    {viewMode === 'monthly' ? `${String(month).padStart(2,'0')}/${year}` : String(year)}
                  </span>
                </h2>
                {!drillLoading && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {drillItems.length} lançamento{drillItems.length !== 1 ? 's' : ''} · Total: <span className={drilldown === 'revenue' ? 'text-emerald-400' : 'text-red-400'}>
                      {brl(drillItems.reduce((s, r) => s + Number(r.amount), 0))}
                    </span>
                  </p>
                )}
              </div>
              <button onClick={() => setDrilldown(null)} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {drillLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                </div>
              ) : drillItems.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">Nenhum lançamento encontrado</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-card)' }}>
                    <tr>
                      <th className="th text-left px-4 py-3">Data</th>
                      <th className="th text-left px-4 py-3">Descrição</th>
                      <th className="th text-left px-4 py-3">Categoria</th>
                      <th className="th text-right px-4 py-3">Valor</th>
                      <th className="th text-center px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillItems.map((r, i) => {
                      const STATUS_COLOR: Record<string, string> = {
                        pago: 'badge badge-green', pendente: 'badge badge-amber',
                        atrasado: 'badge badge-red', cancelado: 'badge badge-slate',
                      };
                      const STATUS_LABEL: Record<string, string> = {
                        pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', cancelado: 'Cancelado',
                      };
                      const catName = (r as Revenue).category_name ?? null;
                      const catColor = (r as Revenue).category_color ?? '#6366f1';
                      const dateStr = r.date ? r.date.slice(0, 10).split('-').reverse().join('/') : '—';
                      return (
                        <tr key={i} className="tr" style={{ borderBottom: '1px solid var(--border-card)' }}>
                          <td className="td px-4 py-2.5 text-slate-400 whitespace-nowrap">{dateStr}</td>
                          <td className="td px-4 py-2.5 font-medium text-slate-200 max-w-[180px]">
                            <span className="line-clamp-2">{r.description}</span>
                          </td>
                          <td className="td px-4 py-2.5">
                            {catName ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: catColor + '22', color: catColor }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: catColor }} />
                                {catName}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className={`td px-4 py-2.5 text-right font-semibold whitespace-nowrap ${drilldown === 'revenue' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {brl(r.amount)}
                          </td>
                          <td className="td px-4 py-2.5 text-center">
                            <span className={STATUS_COLOR[r.status] || 'badge badge-slate'}>{STATUS_LABEL[r.status] || r.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer total */}
            {!drillLoading && drillItems.length > 0 && (
              <div className="px-5 py-4 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-card)' }}>
                <span className="text-sm text-slate-400">{drillItems.length} lançamentos</span>
                <span className={`text-lg font-semibold ${drilldown === 'revenue' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {brl(drillItems.reduce((s, r) => s + Number(r.amount), 0))}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, icon, onClick }: { label: string; value: string; color: string; icon: React.ReactNode; onClick?: () => void }) {
  const iconColors: Record<string, string> = {
    emerald: 'icon-green',
    red: 'icon-red',
    blue: 'icon-blue',
    amber: 'icon-amber',
  };
  return (
    <div
      className={`card p-4 overflow-hidden min-w-0 ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-blue-500/40 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="label-dark truncate pr-2">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={iconColors[color] || 'icon-blue'}>{icon}</div>
          {onClick && <ChevronRight size={13} className="text-slate-500" />}
        </div>
      </div>
      <div className="font-light tracking-tight leading-none truncate" style={{ fontSize: 'clamp(1.1rem, 2.6vw, 1.9rem)', color: 'var(--text-metric)' }}>{value}</div>
    </div>
  );
}

function PieSection({ title, data }: { title: string; data: { name: string | null; color: string | null; total: number }[] }) {
  const filled = data.map(d => ({ ...d, name: d.name || 'Sem categoria', color: d.color || '#94a3b8' }));
  const { theme } = useTheme();
  const tooltipStyle = theme === 'dark'
    ? { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' }
    : { backgroundColor: '#ffffff', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#1e293b' };
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-3">{title}</h2>
      {filled.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Sem dados</div>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie data={filled} dataKey="total" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                {filled.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5 overflow-hidden">
            {filled.slice(0, 6).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="truncate text-slate-400">{d.name}</span>
                <span className="ml-auto font-medium text-slate-300 shrink-0">{brl(d.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
