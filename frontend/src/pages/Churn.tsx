import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { UserX, TrendingDown, Clock, DollarSign, RefreshCw, AlertTriangle } from 'lucide-react';

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

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const tooltipStyle = { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' };

const REASON_COLORS: Record<string, string> = {
  'Preço': '#ef4444',
  'Qualidade do serviço': '#f97316',
  'Concorrência': '#eab308',
  'Corte de orçamento': '#8b5cf6',
  'Fechamento da empresa': '#6b7280',
  'Resultado insatisfatório': '#ec4899',
  'Decisão interna': '#14b8a6',
  'Não informado': '#94a3b8',
  'Outros': '#64748b',
};

const REACTIVATION_BADGE: Record<string, string> = {
  alta: 'badge badge-green',
  media: 'badge badge-amber',
  baixa: 'badge badge-red',
  nao: 'badge badge-slate',
};
const REACTIVATION_LABELS: Record<string, string> = {
  alta: 'Alta', media: 'Média', baixa: 'Baixa', nao: 'Não',
};

const CHURN_REASONS = ['Preço', 'Qualidade do serviço', 'Concorrência', 'Corte de orçamento', 'Resultado insatisfatório', 'Fechamento da empresa', 'Decisão interna', 'Outros'];

interface ChurnSummary {
  total_churned: number;
  mrr_lost: number;
  avg_lifetime_months: number;
  total_ltv_lost: number;
  churn_rate: string;
  monthly_churn: { month: string; count: number; mrr_lost: number }[];
}

interface ChurnClient {
  id: number;
  name: string;
  monthly_fee: number;
  start_date: string | null;
  churn_date: string;
  churn_reason: string | null;
  churn_notes: string | null;
  reactivation_potential: string | null;
  service_type: string | null;
  lifetime_months: number | null;
  ltv: number | null;
}

interface ByReason { reason: string; count: number; mrr_lost: number }

export default function Churn() {
  const [summary, setSummary] = useState<ChurnSummary | null>(null);
  const [clients, setClients] = useState<ChurnClient[]>([]);
  const [byReason, setByReason] = useState<ByReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ChurnClient | null>(null);
  const [reactivating, setReactivating] = useState<number | null>(null);

  const [form, setForm] = useState({
    churn_date: new Date().toISOString().split('T')[0],
    churn_reason: '',
    churn_notes: '',
    reactivation_potential: 'nao',
    start_date: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, r] = await Promise.all([
        authFetch(`${API}/churn/summary`).then(x => x.json()),
        authFetch(`${API}/churn/clients`).then(x => x.json()),
        authFetch(`${API}/churn/by-reason`).then(x => x.json()),
      ]);
      setSummary(s);
      setClients(c);
      setByReason(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (c: ChurnClient) => {
    setSelectedClient(c);
    setForm({
      churn_date: c.churn_date || new Date().toISOString().split('T')[0],
      churn_reason: c.churn_reason || '',
      churn_notes: c.churn_notes || '',
      reactivation_potential: c.reactivation_potential || 'nao',
      start_date: c.start_date || '',
    });
    setShowModal(true);
  };

  const saveChurn = async () => {
    if (!selectedClient) return;
    await authFetch(`${API}/churn/${selectedClient.id}/churn`, {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
    setShowModal(false);
    load();
  };

  const reactivate = async (id: number) => {
    if (!confirm('Reativar este cliente? Isso vai limpar os dados de churn.')) return;
    setReactivating(id);
    await authFetch(`${API}/churn/${id}/reactivate`, { method: 'PATCH' });
    setReactivating(null);
    load();
  };

  const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Churn</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cancelamentos, motivos e impacto financeiro</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><UserX size={14} /> Clientes cancelados</div>
          <div className="metric">{summary?.total_churned ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><TrendingDown size={14} /> MRR perdido</div>
          <div className="metric text-red-400">{fmt(summary?.mrr_lost ?? 0)}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><DollarSign size={14} /> LTV perdido total</div>
          <div className="metric text-amber-400">{fmt(summary?.total_ltv_lost ?? 0)}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><Clock size={14} /> Tempo médio de vida</div>
          <div className="metric">{summary?.avg_lifetime_months ?? 0} <span className="text-sm font-normal text-slate-500">meses</span></div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1"><AlertTriangle size={14} /> Taxa de churn</div>
          <div className="metric text-red-400">{summary?.churn_rate ?? 0}%</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By reason */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-300 mb-4">Cancelamentos por motivo</h2>
          {byReason.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-10">Nenhum cancelamento registrado ainda</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={byReason} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={80}>
                    {byReason.map((entry, i) => (
                      <Cell key={i} fill={REASON_COLORS[entry.reason] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} cliente(s)`, 'Cancelamentos']} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {byReason.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: REASON_COLORS[r.reason] ?? '#94a3b8' }} />
                      <span className="text-slate-400">{r.reason}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-slate-200">{r.count}x</div>
                      <div className="text-xs text-red-400">{fmt(r.mrr_lost)}/mês</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Monthly timeline */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-300 mb-4">Histórico de cancelamentos (6 meses)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary?.monthly_churn ?? []} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  name === 'count' ? `${v} cliente(s)` : fmt(v),
                  name === 'count' ? 'Cancelamentos' : 'MRR perdido'
                ]}
                contentStyle={tooltipStyle}
              />
              <Legend formatter={v => v === 'count' ? 'Cancelamentos' : 'MRR perdido'} wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} name="count" />
              <Bar yAxisId="right" dataKey="mrr_lost" fill="#f87171" opacity={0.6} radius={[4, 4, 0, 0]} name="mrr_lost" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clients list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <h2 className="font-semibold text-slate-300">Clientes cancelados</h2>
        </div>
        {clients.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-12">Nenhum cancelamento registrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left px-4 py-3">Cliente</th>
                  <th className="th text-left px-4 py-3">Serviço</th>
                  <th className="th text-right px-4 py-3">Mensalidade</th>
                  <th className="th text-left px-4 py-3">Tempo de vida</th>
                  <th className="th text-right px-4 py-3">LTV</th>
                  <th className="th text-left px-4 py-3">Data cancel.</th>
                  <th className="th text-left px-4 py-3">Motivo</th>
                  <th className="th text-left px-4 py-3">Reativação</th>
                  <th className="th text-left px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} className="tr">
                    <td className="td px-4 py-3 font-medium text-slate-200">{c.name}</td>
                    <td className="td px-4 py-3 max-w-[180px] truncate">{c.service_type || '—'}</td>
                    <td className="td px-4 py-3 text-right font-medium text-slate-200">{fmt(c.monthly_fee)}</td>
                    <td className="td px-4 py-3">{c.lifetime_months ? `${c.lifetime_months} meses` : '—'}</td>
                    <td className="td px-4 py-3 text-right font-medium text-amber-400">{c.ltv ? fmt(c.ltv) : '—'}</td>
                    <td className="td px-4 py-3">{fmtDate(c.churn_date)}</td>
                    <td className="td px-4 py-3">
                      {c.churn_reason ? (
                        <span className="badge badge-red">{c.churn_reason}</span>
                      ) : (
                        <span className="text-slate-500 text-xs">Não informado</span>
                      )}
                    </td>
                    <td className="td px-4 py-3">
                      {c.reactivation_potential && REACTIVATION_LABELS[c.reactivation_potential] ? (
                        <span className={REACTIVATION_BADGE[c.reactivation_potential]}>
                          {REACTIVATION_LABELS[c.reactivation_potential]}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="td px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(c)} className="text-xs text-slate-400 hover:text-blue-400 underline">Editar</button>
                        <button
                          onClick={() => reactivate(c.id)}
                          disabled={reactivating === c.id}
                          className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                        >
                          <RefreshCw size={12} /> Reativar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedClient && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-lg">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h3 className="font-semibold text-white">Dados de cancelamento — {selectedClient.name}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-dark mb-1 block">Data de início (contrato)</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="input-dark w-full" />
                </div>
                <div>
                  <label className="label-dark mb-1 block">Data de cancelamento</label>
                  <input type="date" value={form.churn_date} onChange={e => setForm(f => ({ ...f, churn_date: e.target.value }))}
                    className="input-dark w-full" />
                </div>
              </div>
              <div>
                <label className="label-dark mb-1 block">Motivo do cancelamento</label>
                <select value={form.churn_reason} onChange={e => setForm(f => ({ ...f, churn_reason: e.target.value }))}
                  className="input-dark w-full">
                  <option value="">Selecione...</option>
                  {CHURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label-dark mb-1 block">Potencial de reativação</label>
                <select value={form.reactivation_potential} onChange={e => setForm(f => ({ ...f, reactivation_potential: e.target.value }))}
                  className="input-dark w-full">
                  <option value="nao">Não</option>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
              <div>
                <label className="label-dark mb-1 block">Observações</label>
                <textarea value={form.churn_notes} onChange={e => setForm(f => ({ ...f, churn_notes: e.target.value }))}
                  rows={3} placeholder="O que aconteceu? O que poderia ter evitado o cancelamento?"
                  className="input-dark w-full resize-none" />
              </div>
              {selectedClient.monthly_fee > 0 && (
                <div className="rounded-lg p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <strong>Impacto:</strong> {fmt(selectedClient.monthly_fee)}/mês perdidos
                  {selectedClient.lifetime_months && ` · LTV: ${fmt(selectedClient.monthly_fee * selectedClient.lifetime_months)}`}
                </div>
              )}
            </div>
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setShowModal(false)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={saveChurn} className="btn-primary text-sm">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
