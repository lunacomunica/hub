import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { X, RefreshCw, Target, TrendingUp, Info } from 'lucide-react';
import { getScenarios, createScenario, updateScenario, deleteScenario, getBreakeven } from '../api';
import type { BreakevenData } from '../api';
import type { Scenario } from '../types';

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const tooltipStyle = { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' };

const TYPES: { key: Scenario['type']; label: string; textColor: string; borderColor: string; bgColor: string }[] = [
  { key: 'pessimista', label: 'Pessimista', textColor: 'text-red-400', borderColor: 'rgba(239,68,68,0.25)', bgColor: 'rgba(239,68,68,0.07)' },
  { key: 'realista', label: 'Realista', textColor: 'text-blue-400', borderColor: 'rgba(59,130,246,0.25)', bgColor: 'rgba(59,130,246,0.07)' },
  { key: 'otimista', label: 'Otimista', textColor: 'text-emerald-400', borderColor: 'rgba(16,185,129,0.25)', bgColor: 'rgba(16,185,129,0.07)' },
];

const TYPE_COLORS = { pessimista: '#ef4444', realista: '#3b82f6', otimista: '#10b981' };

const now = new Date();
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

const emptyScenario = (type: Scenario['type'], month: number, year: number): Partial<Scenario> => ({
  name: `Cenário ${TYPES.find(t => t.key === type)?.label} — ${String(month).padStart(2,'0')}/${year}`,
  month, year, type, revenue_projection: 0, expense_projection: 0,
  new_clients: 0, churn_clients: 0, avg_ticket: 0, notes: '',
});

export default function Scenarios() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [actual, setActual] = useState<{ revenue: number; expenses: number; profit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Scenario['type'] | null>(null);
  const [form, setForm] = useState<Partial<Scenario>>({});
  const [saving, setSaving] = useState(false);
  const [breakeven, setBreakeven] = useState<BreakevenData | null>(null);
  const [targetMargin, setTargetMargin] = useState(30);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getScenarios(month, year);
      setScenarios(d.scenarios);
      setActual(d.actual);
      const be = await getBreakeven().catch(() => null);
      setBreakeven(be);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [month, year]);

  const openModal = (type: Scenario['type']) => {
    const existing = scenarios.find(s => s.type === type);
    setForm(existing ? { ...existing } : emptyScenario(type, month, year));
    setModal(type);
  };
  const closeModal = () => { setModal(null); setForm({}); };

  const save = async () => {
    if (!form.name || !form.month || !form.year) return;
    setSaving(true);
    try {
      if (form.id) await updateScenario(form.id, form);
      else await createScenario(form);
      closeModal(); load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deletar este cenário?')) return;
    try { await deleteScenario(id); load(); }
    catch { alert('Erro ao deletar'); }
  };

  // Break-even calculations
  const beFixed = breakeven?.avg_fixed_costs ?? 0;
  const beDirectRate = breakeven?.direct_cost_rate ?? 0;
  const beMrr = breakeven?.current_mrr ?? 0;
  const beClients = breakeven?.client_count ?? 0;
  const beTicket = breakeven?.avg_ticket ?? 0;
  const beCurrentMargin = breakeven?.current_real_margin_pct ?? 0;

  // MRR needed for target: T = 1 - fixed/MRR - directRate  →  MRR = fixed / (1 - T - directRate)
  const tRate = targetMargin / 100;
  const denominator = 1 - tRate - beDirectRate;
  const mrrNeeded = denominator > 0 ? beFixed / denominator : Infinity;
  const mrrGap = Math.max(0, mrrNeeded - beMrr);
  const clientsNeeded = beTicket > 0 ? Math.ceil(mrrGap / beTicket) : 0;

  // Fixed cost reduction needed to hit target at current MRR (if mrrNeeded > beMrr)
  // T = (MRR - fixed_needed - direct) / MRR  →  fixed_needed = MRR * (1 - T - directRate)
  const fixedNeeded = beMrr * (1 - tRate - beDirectRate);
  const fixedReduction = Math.max(0, beFixed - fixedNeeded);

  // Chart data
  const chartData = [
    { name: 'Receita', ...(actual ? { Atual: actual.revenue } : {}), ...Object.fromEntries(scenarios.map(s => [TYPES.find(t => t.key === s.type)?.label || s.type, s.revenue_projection])) },
    { name: 'Despesas', ...(actual ? { Atual: actual.expenses } : {}), ...Object.fromEntries(scenarios.map(s => [TYPES.find(t => t.key === s.type)?.label || s.type, s.expense_projection])) },
    { name: 'Lucro', ...(actual ? { Atual: actual.profit } : {}), ...Object.fromEntries(scenarios.map(s => [TYPES.find(t => t.key === s.type)?.label || s.type, s.revenue_projection - s.expense_projection])) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cenários Financeiros</h1>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-dark text-sm py-1.5">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-dark text-sm py-1.5">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="p-1.5 text-slate-400 hover:text-blue-400"><RefreshCw size={15} /></button>
        </div>
      </div>

      {/* Break-even calculator */}
      {breakeven && (
        <div className="card p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-indigo-400" />
            <h2 className="font-semibold text-slate-300">Ponto de Equilíbrio — Margem Real</h2>
            <span className="text-xs text-slate-500 ml-1">baseado nos últimos 3 meses de custos fixos</span>
          </div>

          {/* Current state */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs text-slate-500 mb-1">MRR atual</div>
              <div className="font-semibold text-slate-200 text-sm">{brl(beMrr)}</div>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs text-slate-500 mb-1">Custos fixos (média)</div>
              <div className="font-semibold text-red-400 text-sm">{brl(beFixed)}</div>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs text-slate-500 mb-1">Ticket médio</div>
              <div className="font-semibold text-slate-200 text-sm">{brl(beTicket)}</div>
            </div>
            <div className={`rounded-lg p-3 text-center`} style={{ background: beCurrentMargin >= 30 ? 'rgba(16,185,129,0.08)' : beCurrentMargin >= 15 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${beCurrentMargin >= 30 ? 'rgba(16,185,129,0.25)' : beCurrentMargin >= 15 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
              <div className="text-xs text-slate-500 mb-1">Margem real hoje</div>
              <div className={`font-semibold text-sm ${beCurrentMargin >= 30 ? 'text-emerald-400' : beCurrentMargin >= 15 ? 'text-amber-400' : 'text-red-400'}`}>{beCurrentMargin.toFixed(1)}%</div>
            </div>
          </div>

          {/* Target margin slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300">Meta de margem real</label>
              <span className="text-lg font-bold text-indigo-400">{targetMargin}%</span>
            </div>
            <input
              type="range" min={5} max={60} step={5}
              value={targetMargin}
              onChange={e => setTargetMargin(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>5%</span><span>15%</span><span>25%</span><span>35%</span><span>45%</span><span>60%</span>
            </div>
          </div>

          {/* Results */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="text-xs text-slate-400 mb-1">MRR necessário</div>
              <div className="text-xl font-bold text-indigo-400">{denominator > 0 ? brl(mrrNeeded) : '—'}</div>
              {mrrGap > 0 && <div className="text-xs text-slate-500 mt-1">faltam {brl(mrrGap)} vs hoje</div>}
              {mrrGap === 0 && <div className="text-xs text-emerald-400 mt-1">✓ já atingido com MRR atual</div>}
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="text-xs text-slate-400 mb-1">Novos clientes necessários</div>
              <div className="text-xl font-bold text-indigo-400">{mrrGap > 0 ? `+${clientsNeeded}` : '—'}</div>
              <div className="text-xs text-slate-500 mt-1">ao ticket médio de {brl(beTicket)}</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="text-xs text-slate-400 mb-1">Ou: cortar custos fixos em</div>
              <div className="text-xl font-bold text-indigo-400">{fixedReduction > 0 ? brl(fixedReduction) : '—'}</div>
              <div className="text-xs text-slate-500 mt-1">mantendo o MRR atual</div>
            </div>
          </div>

          {/* Quick targets table */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Metas rápidas</div>
            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 30, 40].map(t => {
                const d = 1 - t / 100 - beDirectRate;
                const mrr = d > 0 ? beFixed / d : Infinity;
                const gap = Math.max(0, mrr - beMrr);
                const cl = beTicket > 0 ? Math.ceil(gap / beTicket) : 0;
                const reached = gap === 0;
                return (
                  <button key={t} onClick={() => setTargetMargin(t)}
                    className="rounded-lg p-3 text-center transition-all"
                    style={{ background: targetMargin === t ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${targetMargin === t ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'}` }}>
                    <div className={`text-sm font-bold mb-1 ${reached ? 'text-emerald-400' : 'text-slate-300'}`}>{t}%</div>
                    <div className="text-xs text-slate-400">{d > 0 ? brl(mrr) : '—'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{reached ? '✓ atingido' : `+${cl} clientes`}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500"></div></div>
      ) : (
        <>
          {/* 3 scenario cards */}
          <div className="grid grid-cols-3 gap-4">
            {TYPES.map(type => {
              const s = scenarios.find(sc => sc.type === type.key);
              const profit = s ? s.revenue_projection - s.expense_projection : null;
              return (
                <div key={type.key} className="rounded-xl p-4" style={{ border: `1px solid ${type.borderColor}`, background: type.bgColor }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`font-semibold ${type.textColor}`}>{type.label}</h3>
                    <div className="flex gap-1">
                      <button onClick={() => openModal(type.key)} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${type.textColor} hover:opacity-80 transition-opacity`}
                        style={{ border: `1px solid ${type.borderColor}`, background: 'rgba(0,0,0,0.2)' }}>
                        {s ? 'Editar' : 'Criar'}
                      </button>
                      {s && <button onClick={() => handleDelete(s.id)} className="p-1 text-slate-500 hover:text-red-400 rounded"><X size={14} /></button>}
                    </div>
                  </div>

                  {s ? (
                    <div className="space-y-2 text-sm">
                      <ScenRow label="Receita" value={brl(s.revenue_projection)} color="text-emerald-400" />
                      <ScenRow label="Despesas" value={brl(s.expense_projection)} color="text-red-400" />
                      <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <ScenRow label="Lucro" value={brl(profit!)} color={profit! >= 0 ? 'text-emerald-400' : 'text-red-400'} bold />
                      </div>
                      {s.new_clients > 0 && <ScenRow label="Novos clientes" value={String(s.new_clients)} />}
                      {s.churn_clients > 0 && <ScenRow label="Churn" value={String(s.churn_clients)} color="text-red-400" />}
                      {s.avg_ticket > 0 && <ScenRow label="Ticket médio" value={brl(s.avg_ticket)} />}
                      {s.notes && <p className="text-xs text-slate-500 mt-2 italic">"{s.notes}"</p>}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-sm text-slate-500">
                      Nenhum cenário criado.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Comparison table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-slate-300 text-sm">Comparativo — {MONTHS[month - 1]} {year}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(59,130,246,0.05)', borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left px-4 py-2.5">Métrica</th>
                  {actual && <th className="th text-right px-4 py-2.5">Realizado</th>}
                  {TYPES.map(t => (
                    <th key={t.key} className={`th text-right px-4 py-2.5 ${t.textColor}`}>{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Receita', key: 'revenue' as const, fmt: brl },
                  { label: 'Despesas', key: 'expenses' as const, fmt: brl },
                  { label: 'Lucro', key: 'profit' as const, fmt: brl },
                ].map(row => (
                  <tr key={row.label} className="tr">
                    <td className="td px-4 py-2.5 font-medium text-slate-300">{row.label}</td>
                    {actual && (
                      <td className="td px-4 py-2.5 text-right font-semibold text-slate-200">
                        {row.key === 'revenue' ? brl(actual.revenue) : row.key === 'expenses' ? brl(actual.expenses) : brl(actual.profit)}
                      </td>
                    )}
                    {TYPES.map(t => {
                      const s = scenarios.find(sc => sc.type === t.key);
                      const val = s ? (row.key === 'revenue' ? s.revenue_projection : row.key === 'expenses' ? s.expense_projection : s.revenue_projection - s.expense_projection) : null;
                      return (
                        <td key={t.key} className={`td px-4 py-2.5 text-right font-medium ${val === null ? 'text-slate-600' : val >= 0 ? 'text-slate-300' : 'text-red-400'}`}>
                          {val !== null ? brl(val) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart */}
          {scenarios.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold text-slate-300 mb-3 text-sm">Projetado vs Realizado</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3e" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  {actual && <Bar dataKey="Atual" fill="#475569" radius={[4, 4, 0, 0]} />}
                  {scenarios.map(s => (
                    <Bar key={s.type} dataKey={TYPES.find(t => t.key === s.type)?.label || s.type} fill={TYPE_COLORS[s.type]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Cenário {TYPES.find(t => t.key === modal)?.label}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nome">
                <input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-dark w-full" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Receita projetada (R$)">
                  <input type="number" step="0.01" value={form.revenue_projection || ''} onChange={e => setForm(f => ({ ...f, revenue_projection: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Despesas projetadas (R$)">
                  <input type="number" step="0.01" value={form.expense_projection || ''} onChange={e => setForm(f => ({ ...f, expense_projection: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Novos clientes">
                  <input type="number" value={form.new_clients || ''} onChange={e => setForm(f => ({ ...f, new_clients: parseInt(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Churn">
                  <input type="number" value={form.churn_clients || ''} onChange={e => setForm(f => ({ ...f, churn_clients: parseInt(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Ticket médio (R$)">
                  <input type="number" step="0.01" value={form.avg_ticket || ''} onChange={e => setForm(f => ({ ...f, avg_ticket: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
              </div>
              <Field label="Observações">
                <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-dark w-full resize-none" rows={2} />
              </Field>
              {form.revenue_projection !== undefined && form.expense_projection !== undefined && (
                <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Lucro projetado</span>
                    <span className={`font-bold ${(form.revenue_projection - form.expense_projection) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {brl(form.revenue_projection - form.expense_projection)}
                    </span>
                  </div>
                  {form.revenue_projection > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-slate-400">Margem</span>
                      <span className="font-medium text-slate-300">
                        {(((form.revenue_projection - form.expense_projection) / form.revenue_projection) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={closeModal} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${color || 'text-slate-300'}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-dark mb-1 block">{label}</label>
      {children}
    </div>
  );
}
