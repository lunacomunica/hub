import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Percent, AlertCircle, RefreshCw, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { getDashboard, getOpportunities } from '../api';
import type { DashboardData } from '../types';

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${Number(v).toFixed(1)}%`;

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface OppSummary {
  total_count: number;
  total_value: number;
  weighted_value: number;
  by_stage: { stage: string; count: number; total_value: number }[];
  win_rate: number;
  won_value: number;
}

export default function Relatorio() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DashboardData | null>(null);
  const [prevData, setPrevData] = useState<DashboardData | null>(null);
  const [oppSummary, setOppSummary] = useState<OppSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const getPrevMonthYear = (m: number, y: number) => {
    if (m === 1) return { pm: 12, py: y - 1 };
    return { pm: m - 1, py: y };
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { pm, py } = getPrevMonthYear(month, year);
      const [cur, prev, opp] = await Promise.all([
        getDashboard(month, year),
        getDashboard(pm, py),
        getOpportunities(),
      ]);
      setData(cur);
      setPrevData(prev);
      setOppSummary(opp.summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const calcDelta = (cur: number, prev: number) => {
    if (prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };

  const exportCSV = () => {
    if (!data) return;
    const { summary, revenue_by_category, expense_by_category, top_clients } = data;
    const totalRev = summary.total_revenue;

    const lines: string[] = [];

    lines.push('RELATÓRIO MENSAL');
    lines.push(`Mês/Ano,${MONTHS[month - 1]} ${year}`);
    lines.push('');

    lines.push('KPIs');
    lines.push('Indicador,Valor');
    lines.push(`Receita Total,${summary.total_revenue.toFixed(2)}`);
    lines.push(`Despesas Totais,${summary.total_expenses.toFixed(2)}`);
    lines.push(`Lucro Líquido,${summary.net_profit.toFixed(2)}`);
    lines.push(`Margem de Lucro (%),${summary.profit_margin.toFixed(2)}`);
    lines.push('');

    lines.push('RECEITAS POR CATEGORIA');
    lines.push('Categoria,Valor,% do Total');
    revenue_by_category.forEach(r => {
      const p = totalRev > 0 ? ((r.total / totalRev) * 100).toFixed(1) : '0.0';
      lines.push(`"${r.name || 'Sem categoria'}",${r.total.toFixed(2)},${p}`);
    });
    lines.push('');

    lines.push('DESPESAS POR CATEGORIA');
    lines.push('Categoria,Valor,% do Total');
    expense_by_category.forEach(e => {
      const p = summary.total_expenses > 0 ? ((e.total / summary.total_expenses) * 100).toFixed(1) : '0.0';
      lines.push(`"${e.name || 'Sem categoria'}",${e.total.toFixed(2)},${p}`);
    });
    lines.push('');

    lines.push('TOP CLIENTES');
    lines.push('Posição,Cliente,Receita,% do Total');
    top_clients.forEach((c, i) => {
      const p = totalRev > 0 ? ((c.total / totalRev) * 100).toFixed(1) : '0.0';
      lines.push(`${i + 1},"${c.client_name}",${c.total.toFixed(2)},${p}`);
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const { summary, revenue_by_category, expense_by_category, top_clients, goal_progress } = data;

  const deltaRevenue = prevData ? calcDelta(summary.total_revenue, prevData.summary.total_revenue) : null;
  const deltaExpenses = prevData ? calcDelta(summary.total_expenses, prevData.summary.total_expenses) : null;
  const deltaProfit = prevData ? calcDelta(summary.net_profit, prevData.summary.net_profit) : null;

  const totalRev = summary.total_revenue;
  const totalExp = summary.total_expenses;

  const revCats = [...revenue_by_category]
    .map(r => ({ ...r, name: r.name || 'Sem categoria' }))
    .sort((a, b) => b.total - a.total);
  const expCats = [...expense_by_category]
    .map(e => ({ ...e, name: e.name || 'Sem categoria' }))
    .sort((a, b) => b.total - a.total);

  // Pipeline count = all non-closed/lost stages
  const pipelineStages = ['prospeccao', 'contato', 'proposta', 'negociacao'];
  const pipelineItems = oppSummary?.by_stage.filter(s => pipelineStages.includes(s.stage)) ?? [];
  const pipelineCount = pipelineItems.reduce((acc, s) => acc + s.count, 0);
  const pipelineValue = pipelineItems.reduce((acc, s) => acc + s.total_value, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Relatório Mensal</h1>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="input-dark text-sm py-1.5"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
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
          <button onClick={exportCSV} className="btn-primary flex items-center gap-1.5 text-sm">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Seção 1 — KPIs */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">KPIs do Mês</h2>
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Receita Total"
            value={brl(summary.total_revenue)}
            color="emerald"
            icon={<TrendingUp size={20} />}
          />
          <KpiCard
            label="Despesas Totais"
            value={brl(summary.total_expenses)}
            color="red"
            icon={<TrendingDown size={20} />}
          />
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
      </section>

      {/* Seção 2 — Comparativo */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Comparativo com Mês Anterior</h2>
        <div className="grid grid-cols-3 gap-4">
          <DeltaCard label="Receita" current={summary.total_revenue} delta={deltaRevenue} positiveIsGood />
          <DeltaCard label="Despesas" current={summary.total_expenses} delta={deltaExpenses} positiveIsGood={false} />
          <DeltaCard label="Lucro Líquido" current={summary.net_profit} delta={deltaProfit} positiveIsGood />
        </div>
      </section>

      {/* Seção 3 — Meta do mês */}
      {goal_progress && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Meta do Mês</h2>
          <div className="card p-5">
            <div className="grid grid-cols-3 gap-6 mb-4">
              <div>
                <div className="label-dark mb-1">Meta</div>
                <div className="metric-md text-slate-200">{brl(goal_progress.target_revenue)}</div>
              </div>
              <div>
                <div className="label-dark mb-1">Realizado</div>
                <div className={`metric-md ${goal_progress.actual_revenue >= goal_progress.target_revenue ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {brl(goal_progress.actual_revenue)}
                </div>
              </div>
              <div>
                <div className="label-dark mb-1">Faltando</div>
                <div className={`metric-md ${goal_progress.actual_revenue >= goal_progress.target_revenue ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {goal_progress.actual_revenue >= goal_progress.target_revenue
                    ? `+${brl(goal_progress.actual_revenue - goal_progress.target_revenue)}`
                    : brl(goal_progress.target_revenue - goal_progress.actual_revenue)}
                </div>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div
                className={`h-full rounded-full transition-all ${goal_progress.progress_percent >= 100 ? 'bg-emerald-500' : goal_progress.progress_percent >= 70 ? 'bg-blue-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(goal_progress.progress_percent, 100)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-slate-500 text-right">{pct(goal_progress.progress_percent)} atingido</div>
          </div>
        </section>
      )}

      {/* Seção 4 — Receitas e Despesas por Categoria */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Por Categoria</h2>
        <div className="grid grid-cols-2 gap-4">
          <CategoryTable title="Receitas por Categoria" rows={revCats} total={totalRev} colorClass="text-emerald-400" />
          <CategoryTable title="Despesas por Categoria" rows={expCats} total={totalExp} colorClass="text-red-400" />
        </div>
      </section>

      {/* Seção 5 — Top Clientes */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Top Clientes</h2>
        <div className="card p-4">
          {top_clients.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">Nenhuma receita com cliente registrada neste mês</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left py-2 w-8">#</th>
                  <th className="th text-left py-2">Cliente</th>
                  <th className="th text-right py-2">Receita</th>
                  <th className="th text-right py-2">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {top_clients.map((c, i) => (
                  <tr key={i} className="tr">
                    <td className="td py-2 text-slate-500">{i + 1}</td>
                    <td className="td py-2 font-medium text-slate-200">{c.client_name}</td>
                    <td className="td py-2 text-right text-emerald-400 font-medium">{brl(c.total)}</td>
                    <td className="td py-2 text-right text-slate-400">
                      {totalRev > 0 ? pct((c.total / totalRev) * 100) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Seção 6 — Oportunidades */}
      {oppSummary && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Oportunidades do Mês</h2>
          <div className="grid grid-cols-4 gap-4">
            <OppCard label="Em Pipeline" value={String(pipelineCount)} suffix="oportunidades" color="blue" />
            <OppCard label="Valor em Pipeline" value={brl(pipelineValue)} color="blue" />
            <OppCard
              label="Taxa de Conversão"
              value={pct(oppSummary.win_rate)}
              color={oppSummary.win_rate >= 40 ? 'emerald' : oppSummary.win_rate >= 20 ? 'amber' : 'red'}
            />
            <OppCard label="Valor Ganho no Mês" value={brl(oppSummary.won_value)} color="emerald" />
          </div>
        </section>
      )}
    </div>
  );
}

// — Sub-components —

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  const iconColors: Record<string, string> = {
    emerald: 'icon-green',
    red: 'icon-red',
    blue: 'icon-blue',
    amber: 'icon-amber',
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="label-dark">{label}</span>
        <div className={iconColors[color] || 'icon-blue'}>{icon}</div>
      </div>
      <div className="metric">{value}</div>
    </div>
  );
}

function DeltaCard({ label, current, delta, positiveIsGood }: {
  label: string;
  current: number;
  delta: number | null;
  positiveIsGood: boolean;
}) {
  const isPositive = delta !== null && delta > 0;
  const isNeutral = delta === null || delta === 0;

  let deltaColor = 'text-slate-400';
  if (!isNeutral) {
    const good = positiveIsGood ? isPositive : !isPositive;
    deltaColor = good ? 'text-emerald-400' : 'text-red-400';
  }

  return (
    <div className="card p-4">
      <div className="label-dark mb-2">{label}</div>
      <div className="metric-md text-slate-200 mb-3">{brl(current)}</div>
      {isNeutral ? (
        <div className="text-xs text-slate-500">Sem dado anterior</div>
      ) : (
        <div className={`flex items-center gap-1 text-sm font-medium ${deltaColor}`}>
          {isPositive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          <span>{Math.abs(delta!).toFixed(1)}% vs mês anterior</span>
        </div>
      )}
    </div>
  );
}

function CategoryTable({
  title, rows, total, colorClass,
}: {
  title: string;
  rows: { name: string; color: string | null; total: number }[];
  total: number;
  colorClass: string;
}) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm py-4 text-center">Sem dados</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <th className="th text-left py-2">Categoria</th>
              <th className="th text-right py-2">Valor</th>
              <th className="th text-right py-2">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="tr">
                <td className="td py-2">
                  <div className="flex items-center gap-2">
                    {r.color && (
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                    )}
                    <span className="text-slate-300 truncate">{r.name}</span>
                  </div>
                </td>
                <td className={`td py-2 text-right font-medium ${colorClass}`}>{brl(r.total)}</td>
                <td className="td py-2 text-right text-slate-400">
                  {total > 0 ? pct((r.total / total) * 100) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OppCard({ label, value, suffix, color }: { label: string; value: string; suffix?: string; color: string }) {
  const metricColors: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
  };
  return (
    <div className="card p-4">
      <div className="label-dark mb-2">{label}</div>
      <div className={`metric-md font-bold ${metricColors[color] || 'text-blue-400'}`}>{value}</div>
      {suffix && <div className="text-xs text-slate-500 mt-1">{suffix}</div>}
    </div>
  );
}
