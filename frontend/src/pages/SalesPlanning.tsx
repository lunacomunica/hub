import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, RefreshCw, Target, CheckCircle2, Link } from 'lucide-react';

const API = '/api';

function authFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem('auth-token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${Math.min(v, 999).toFixed(1)}%`;
const fmtDate = (d: string) => d ? d.split('-').reverse().join('/') : '—';

const now = new Date();
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

const tooltipStyle = { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' };

interface Product { id: number; name: string; price: number; category: string | null; active: number }
interface GoalItem {
  id?: number; product_id: number; quantity: number; unit_price: number;
  product_name?: string; product_category?: string | null;
  target_revenue?: number; actual_count?: number; actual_revenue?: number;
  pipeline_count?: number; pipeline_value?: number;
}
interface GoalData {
  goal: { id: number; month: number; year: number; target_new_clients: number; notes: string | null } | null;
  items: GoalItem[];
  actual_revenue: number;
  actual_new_clients: number;
  total_target: number;
  total_actual_from_opps: number;
  unlinked_closed: number;
}
interface ClosingOpp { id: number; title: string; client_name: string | null; value: number; probability: number; expected_close_date: string | null; stage: string; product_name?: string | null }

export default function SalesPlanning() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [goalData, setGoalData] = useState<GoalData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<GoalItem[]>([]);
  const [notes, setNotes] = useState('');
  const [targetNewClients] = useState(0);
  const [closingOpps, setClosingOpps] = useState<ClosingOpp[]>([]);
  const [history, setHistory] = useState<{ month: string; revenue: number; goal: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [gd, prods, opps] = await Promise.all([
        authFetch(`${API}/sales-goals/${month}/${year}`).then(r => r.json()),
        authFetch(`${API}/products`).then(r => r.json()),
        authFetch(`${API}/opportunities`).then(r => r.json()),
      ]);
      setGoalData(gd);
      setProducts(Array.isArray(prods) ? prods.filter((p: Product) => p.active) : []);
      setItems(gd.items.length > 0 ? gd.items : []);
      setNotes(gd.goal?.notes || '');


      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-31`;
      setClosingOpps(opps.items.filter((o: ClosingOpp) =>
        o.expected_close_date && o.expected_close_date >= startDate && o.expected_close_date <= endDate
        && !['fechado', 'perdido'].includes(o.stage)
      ));

      const hist = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const r = await authFetch(`${API}/sales-goals/${m}/${y}`).then(x => x.json());
        hist.push({ month: `${String(m).padStart(2,'0')}/${y}`, revenue: r.actual_revenue, goal: r.total_target || 0 });
      }
      setHistory(hist);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [month, year]);

  const addItem = () => {
    const unused = products.find(p => !items.some(i => i.product_id === p.id));
    if (!unused) return;
    setItems(prev => [...prev, { product_id: unused.id, quantity: 1, unit_price: unused.price }]);
  };

  const updateItem = (idx: number, field: keyof GoalItem, value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') {
        const p = products.find(x => x.id === value);
        if (p) updated.unit_price = p.price;
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const saveGoal = async () => {
    setSaving(true);
    try {
      await authFetch(`${API}/sales-goals`, {
        method: 'POST',
        body: JSON.stringify({ month, year, target_new_clients: targetNewClients, notes, items }),
      });
      load();
    } catch { alert('Erro ao salvar meta'); }
    finally { setSaving(false); }
  };

  const totalTarget = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalActual = goalData?.total_actual_from_opps || 0;
  const overallPct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const closingValue = closingOpps.reduce((s, o) => s + o.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Planejamento de Vendas</h1>
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

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="label-dark mb-1">Meta total</div>
              <div className="metric-md">{brl(totalTarget)}</div>
            </div>
            <div className="card p-4">
              <div className="label-dark mb-1">Realizado (opps)</div>
              <div className="metric-md text-emerald-400">{brl(totalActual)}</div>
            </div>
            <div className="card p-4">
              <div className="label-dark mb-1">Receita registrada</div>
              <div className="metric-md text-blue-400">{brl(goalData?.actual_revenue || 0)}</div>
            </div>
            <div className={`rounded-xl p-4 ${overallPct >= 100 ? 'border border-emerald-500/30' : overallPct >= 70 ? 'border border-blue-500/30' : 'border border-amber-500/30'}`}
              style={{ background: overallPct >= 100 ? 'rgba(16,185,129,0.08)' : overallPct >= 70 ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.08)' }}>
              <div className="label-dark mb-1">Atingimento</div>
              <div className={`metric-md ${overallPct >= 100 ? 'text-emerald-400' : overallPct >= 70 ? 'text-blue-400' : 'text-amber-400'}`}>{pct(overallPct)}</div>
            </div>
          </div>

          {/* Progress bar */}
          {totalTarget > 0 && (
            <div className="card p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-slate-300">Progresso geral da meta</span>
                <span className="text-slate-500">{brl(totalActual)} de {brl(totalTarget)}</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className={`h-full rounded-full transition-all ${overallPct >= 100 ? 'bg-emerald-500' : overallPct >= 70 ? 'bg-blue-500' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(overallPct, 100)}%` }} />
              </div>
            </div>
          )}

          {/* Goal items table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-slate-300 flex items-center gap-2"><Target size={15} className="text-blue-400" /> Meta por produto</h2>
              <button onClick={addItem} disabled={products.length === 0} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-40">
                <Plus size={13} /> Adicionar linha
              </button>
            </div>

            {products.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Cadastre produtos em <strong className="text-slate-300">Produtos & Serviços</strong> para montar a meta por produto.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                      <th className="th text-left px-4 py-3 w-8">#</th>
                      <th className="th text-left px-4 py-3">Produto / Serviço</th>
                      <th className="th text-center px-4 py-3 w-24">Qtde meta</th>
                      <th className="th text-right px-4 py-3 w-36">Preço unit.</th>
                      <th className="th text-right px-4 py-3 w-36">Receita meta</th>
                      <th className="th text-center px-4 py-3 w-24">Em pipeline</th>
                      <th className="th text-center px-4 py-3 w-24">Fechados</th>
                      <th className="th text-right px-4 py-3 w-36">Realizado</th>
                      <th className="th text-center px-4 py-3 w-16">%</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const target = item.quantity * item.unit_price;
                      const actual = item.actual_revenue ?? 0;
                      const itemPct = target > 0 ? (actual / target) * 100 : 0;
                      const actualCount = item.actual_count ?? 0;
                      return (
                        <tr key={idx} className="tr">
                          <td className="td px-4 py-2.5 text-slate-500 text-xs">{idx + 1}</td>
                          <td className="td px-4 py-2.5">
                            <select
                              value={item.product_id}
                              onChange={e => updateItem(idx, 'product_id', Number(e.target.value))}
                              className="input-dark w-full text-sm py-1.5"
                            >
                              {products.map(p => (
                                <option key={p.id} value={p.id} disabled={items.some((it, i) => i !== idx && it.product_id === p.id)}>
                                  {p.name}{p.category ? ` — ${p.category}` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="td px-4 py-2.5">
                            <input type="number" min={1} value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                              className="input-dark w-full text-sm py-1.5 text-center" />
                          </td>
                          <td className="td px-4 py-2.5">
                            <input type="number" step="0.01" value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="input-dark w-full text-sm py-1.5 text-right" />
                          </td>
                          <td className="td px-4 py-2.5 text-right font-medium text-slate-300">{brl(target)}</td>
                          <td className="td px-4 py-2.5 text-center">
                            {(item.pipeline_count ?? 0) > 0 ? (
                              <span className="badge badge-blue" title={`${brl(item.pipeline_value ?? 0)} em aberto`}>
                                {item.pipeline_count}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="td px-4 py-2.5 text-center">
                            <span className={`badge ${actualCount > 0 ? 'badge-green' : 'badge-slate'} inline-flex items-center gap-1`}>
                              {actualCount > 0 && <CheckCircle2 size={10} />} {actualCount}/{item.quantity}
                            </span>
                          </td>
                          <td className="td px-4 py-2.5 text-right font-medium text-emerald-400">{brl(actual)}</td>
                          <td className="td px-4 py-2.5 text-center">
                            <span className={`text-xs font-bold ${itemPct >= 100 ? 'text-emerald-400' : itemPct >= 70 ? 'text-blue-400' : 'text-amber-400'}`}>
                              {target > 0 ? pct(itemPct) : '—'}
                            </span>
                          </td>
                          <td className="td px-4 py-2.5">
                            <button onClick={() => removeItem(idx)} className="text-slate-600 hover:text-red-400"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Total row */}
                    {items.length > 0 && (
                      <tr className="font-semibold" style={{ background: 'rgba(59,130,246,0.06)', borderTop: '1px solid rgba(59,130,246,0.15)' }}>
                        <td className="px-4 py-3 text-xs text-slate-500" colSpan={4}>Total</td>
                        <td className="px-4 py-3 text-right text-slate-200">{brl(totalTarget)}</td>
                        <td className="px-4 py-3 text-center text-blue-400 font-medium">{items.reduce((s, i) => s + (i.pipeline_count ?? 0), 0)}</td>
                        <td className="px-4 py-3 text-center text-slate-400">{items.reduce((s, i) => s + (i.actual_count ?? 0), 0)}/{items.reduce((s, i) => s + i.quantity, 0)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">{brl(totalActual)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-bold ${overallPct >= 100 ? 'text-emerald-400' : overallPct >= 70 ? 'text-blue-400' : 'text-amber-400'}`}>
                            {totalTarget > 0 ? pct(overallPct) : '—'}
                          </span>
                        </td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
                {items.length === 0 && (
                  <div className="px-5 py-6 text-center text-slate-500 text-sm">Adicione linhas para montar a meta por produto</div>
                )}
              </div>
            )}

            <div className="px-5 py-4 flex items-end gap-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <div className="flex-1">
                <label className="label-dark mb-1 block">Observações</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto do mês, estratégias..."
                  className="input-dark w-full text-sm py-1.5" />
              </div>
              <button onClick={saveGoal} disabled={saving} className="btn-primary text-sm disabled:opacity-50 shrink-0">
                {saving ? 'Salvando...' : 'Salvar meta'}
              </button>
            </div>
          </div>

          {/* Unlinked closed opps note */}
          {(goalData?.unlinked_closed ?? 0) > 0 && (
            <div className="rounded-xl px-5 py-3 flex items-center gap-3 text-sm text-amber-400" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <Link size={15} />
              <span><strong>{brl(goalData!.unlinked_closed)}</strong> em oportunidades fechadas sem produto vinculado contam para o total mas não para linhas individuais.</span>
            </div>
          )}

          {/* Closing opps */}
          {closingOpps.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-300 mb-3">Oportunidades com fechamento esperado em {MONTHS[month - 1]}</h2>
              <div className="flex items-center justify-between mb-3 text-sm">
                <span className="text-slate-500">{closingOpps.length} oportunidade{closingOpps.length > 1 ? 's' : ''}</span>
                <span className="font-semibold text-blue-400">{brl(closingValue)} em jogo</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                    <th className="th text-left py-2">Título</th>
                    <th className="th text-left py-2">Cliente</th>
                    <th className="th text-left py-2">Produto</th>
                    <th className="th text-right py-2">Valor</th>
                    <th className="th text-center py-2">Prob.</th>
                    <th className="th text-center py-2">Previsão</th>
                  </tr>
                </thead>
                <tbody>
                  {closingOpps.map(o => (
                    <tr key={o.id} className="tr">
                      <td className="td py-2 font-medium text-slate-200">{o.title}</td>
                      <td className="td py-2">{o.client_name || '—'}</td>
                      <td className="td py-2 text-xs">{o.product_name || '—'}</td>
                      <td className="td py-2 text-right font-semibold text-emerald-400">{brl(o.value)}</td>
                      <td className="td py-2 text-center">{o.probability}%</td>
                      <td className="td py-2 text-center">{fmtDate(o.expected_close_date || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Historical */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-300 mb-3">Histórico — últimos 3 meses</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={history} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3e" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="goal" name="Meta" fill="#334155" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Realizado" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
