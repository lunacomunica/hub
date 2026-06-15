import { useEffect, useState } from 'react';
import { Plus, X, AlertCircle, RefreshCw, Trash2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getClients, createClient, updateClient, deleteClient, getClientCosts, addClientCost, deleteClientCost } from '../api';
import type { AgencyClient, ClientCost } from '../types';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${v.toFixed(1)}%`;

const HEALTH_CONFIG = {
  saudavel: {
    label: 'Saudável',
    cardBorder: 'rgba(16,185,129,0.25)',
    cardBg: 'rgba(16,185,129,0.06)',
    badge: 'badge badge-green',
    icon: <CheckCircle size={14} className="text-emerald-400" />,
    bar: 'bg-emerald-500',
  },
  atencao: {
    label: 'Atenção',
    cardBorder: 'rgba(245,158,11,0.25)',
    cardBg: 'rgba(245,158,11,0.06)',
    badge: 'badge badge-amber',
    icon: <AlertCircle size={14} className="text-amber-400" />,
    bar: 'bg-amber-500',
  },
  critico: {
    label: 'Crítico',
    cardBorder: 'rgba(239,68,68,0.25)',
    cardBg: 'rgba(239,68,68,0.06)',
    badge: 'badge badge-red',
    icon: <AlertCircle size={14} className="text-red-400" />,
    bar: 'bg-red-500',
  },
};

const EMPTY_CLIENT = { name: '', monthly_fee: 0, margin_target: 30, active: 1, start_date: '', notes: '' };
const EMPTY_COST = { description: '', amount: 0, type: 'fixo' as const, month: new Date().getMonth() + 1, year: new Date().getFullYear() };

export default function ClientHealth() {
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientModal, setClientModal] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<AgencyClient>>(EMPTY_CLIENT);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [clientCosts, setClientCosts] = useState<ClientCost[]>([]);
  const [costsLoading, setCostsLoading] = useState(false);
  const [costForm, setCostForm] = useState<{ description: string; amount: number; type: 'fixo' | 'variavel'; month: number; year: number }>(EMPTY_COST);
  const [addingCost, setAddingCost] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try { setClients(await getClients()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setClientForm({ ...EMPTY_CLIENT }); setClientModal(true); };
  const openEdit = (c: AgencyClient) => { setClientForm({ ...c }); setClientModal(true); };
  const closeClientModal = () => { setClientModal(false); setClientForm(EMPTY_CLIENT); };

  const saveClient = async () => {
    if (!clientForm.name) return;
    setSaving(true);
    try {
      if (clientForm.id) await updateClient(clientForm.id, clientForm);
      else await createClient(clientForm);
      closeClientModal(); load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deletar este cliente?')) return;
    try { await deleteClient(id); load(); }
    catch { alert('Erro ao deletar'); }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setShowCostForm(false);
    setCostsLoading(true);
    try { setClientCosts(await getClientCosts(id)); }
    catch { setClientCosts([]); }
    finally { setCostsLoading(false); }
  };

  const handleAddCost = async () => {
    if (!expandedId || !costForm.description || !costForm.amount) return;
    setAddingCost(true);
    try {
      await addClientCost(expandedId, costForm);
      setCostForm(EMPTY_COST);
      setShowCostForm(false);
      setClientCosts(await getClientCosts(expandedId));
      load();
    } catch { alert('Erro ao adicionar custo'); }
    finally { setAddingCost(false); }
  };

  const handleDeleteCost = async (costId: number) => {
    if (!expandedId) return;
    try {
      await deleteClientCost(expandedId, costId);
      setClientCosts(await getClientCosts(expandedId));
      load();
    } catch { alert('Erro ao deletar custo'); }
  };

  const activeClients = clients.filter(c => c.active);
  const totalMRR = activeClients.reduce((s, c) => s + c.monthly_fee, 0);
  const avgMargin = activeClients.length > 0
    ? activeClients.reduce((s, c) => s + (c.margin_percent || 0), 0) / activeClients.length
    : 0;

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500"></div></div>;
  if (error) return (
    <div className="flex flex-col items-center py-20 gap-3 text-red-400">
      <AlertCircle size={36} /><p>{error}</p>
      <button onClick={load} className="text-blue-400 underline text-sm">Tentar novamente</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Saúde de Clientes</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="label-dark mb-1">Clientes Ativos</div>
          <div className="metric">{activeClients.length}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">MRR Total</div>
          <div className="metric text-emerald-400">{brl(totalMRR)}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Margem Média</div>
          <div className={`metric ${avgMargin >= 30 ? 'text-emerald-400' : avgMargin >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
            {pct(avgMargin)}
          </div>
        </div>
      </div>

      {/* Client cards */}
      {clients.length === 0 ? (
        <div className="card py-12 text-center text-slate-500 text-sm">
          Nenhum cliente cadastrado.{' '}
          <button onClick={openCreate} className="text-blue-400 underline">Adicionar primeiro cliente</button>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(c => {
            const h = HEALTH_CONFIG[c.health || 'critico'];
            const marginPct = Math.min((c.margin_percent || 0), 100);
            const isExpanded = expandedId === c.id;
            return (
              <div key={c.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${h.cardBorder}` }}>
                <div className="p-4" style={{ background: h.cardBg }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-100 truncate">{c.name}</h3>
                          {!c.active && <span className="badge badge-slate">Inativo</span>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                          <span>Mensalidade: <strong className="text-slate-200">{brl(c.monthly_fee)}</strong></span>
                          <span>Custos: <strong className="text-red-400">{brl(c.monthly_cost || 0)}</strong></span>
                          <span>Margem: <strong className={c.margin && c.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{brl(c.margin || 0)}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className={`flex items-center gap-1.5 ${h.badge}`}>
                        {h.icon}{h.label}
                      </span>
                      <button onClick={() => openEdit(c)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded"><X size={13} className="rotate-45" /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={13} /></button>
                      <button onClick={() => toggleExpand(c.id)} className="p-1.5 text-slate-400 hover:text-slate-200 rounded">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Margin progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Margem: {pct(c.margin_percent || 0)}</span>
                      <span>Meta: {pct(c.margin_target)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div
                        className={`h-full rounded-full transition-all ${h.bar}`}
                        style={{ width: `${Math.max(0, Math.min(marginPct, 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Expanded: cost breakdown */}
                {isExpanded && (
                  <div className="p-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-300">Custos do cliente</h4>
                      <button onClick={() => setShowCostForm(v => !v)} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                        <Plus size={13} /> Adicionar custo
                      </button>
                    </div>

                    {showCostForm && (
                      <div className="rounded-lg p-3 mb-3 space-y-3" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="label-dark mb-1 block">Descrição</label>
                            <input value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} className="input-dark w-full text-sm" placeholder="Ex: Ferramenta X" />
                          </div>
                          <div>
                            <label className="label-dark mb-1 block">Valor (R$)</label>
                            <input type="number" step="0.01" value={costForm.amount || ''} onChange={e => setCostForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="input-dark w-full text-sm" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select value={costForm.type} onChange={e => setCostForm(f => ({ ...f, type: e.target.value as 'fixo' | 'variavel' }))} className="input-dark flex-1 text-sm">
                            <option value="fixo">Fixo</option>
                            <option value="variavel">Variável</option>
                          </select>
                          <button onClick={handleAddCost} disabled={addingCost} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                            {addingCost ? '...' : 'Salvar'}
                          </button>
                          <button onClick={() => setShowCostForm(false)} className="btn-ghost text-xs px-3 py-1.5">Cancelar</button>
                        </div>
                      </div>
                    )}

                    {costsLoading ? (
                      <div className="py-4 text-center text-slate-500 text-sm">Carregando...</div>
                    ) : clientCosts.length === 0 ? (
                      <div className="py-4 text-center text-slate-500 text-sm">Nenhum custo cadastrado para este cliente.</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                            <th className="th text-left py-1.5">Descrição</th>
                            <th className="th text-center py-1.5">Tipo</th>
                            <th className="th text-right py-1.5">Valor</th>
                            <th className="py-1.5 w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientCosts.map(cost => (
                            <tr key={cost.id} className="tr">
                              <td className="td py-2">{cost.description}</td>
                              <td className="td py-2 text-center">
                                <span className={cost.type === 'fixo' ? 'badge badge-blue' : 'badge badge-amber'}>
                                  {cost.type === 'fixo' ? 'Fixo' : 'Variável'}
                                </span>
                              </td>
                              <td className="td py-2 text-right font-medium text-slate-200">{brl(cost.amount)}</td>
                              <td className="td py-2 text-center">
                                <button onClick={() => handleDeleteCost(cost.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                            <td colSpan={2} className="py-2 text-xs font-semibold text-slate-400">Total</td>
                            <td className="py-2 text-right font-bold text-red-400">{brl(clientCosts.reduce((s, c) => s + c.amount, 0))}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Client Modal */}
      {clientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">{clientForm.id ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={closeClientModal} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nome *">
                <input value={clientForm.name || ''} onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))} className="input-dark w-full" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mensalidade (R$)">
                  <input type="number" step="0.01" value={clientForm.monthly_fee || ''} onChange={e => setClientForm(f => ({ ...f, monthly_fee: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Meta de margem (%)">
                  <input type="number" value={clientForm.margin_target || 30} onChange={e => setClientForm(f => ({ ...f, margin_target: parseFloat(e.target.value) || 30 }))} className="input-dark w-full" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data de início">
                  <input type="date" value={clientForm.start_date || ''} onChange={e => setClientForm(f => ({ ...f, start_date: e.target.value }))} className="input-dark w-full" />
                </Field>
                <Field label="Status">
                  <select value={clientForm.active ? '1' : '0'} onChange={e => setClientForm(f => ({ ...f, active: Number(e.target.value) }))} className="input-dark w-full">
                    <option value="1">Ativo</option>
                    <option value="0">Inativo</option>
                  </select>
                </Field>
              </div>
              <Field label="Observações">
                <textarea value={clientForm.notes || ''} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} className="input-dark w-full resize-none" rows={2} />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={closeClientModal} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={saveClient} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
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
