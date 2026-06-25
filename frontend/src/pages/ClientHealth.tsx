import { useEffect, useState } from 'react';
import { Plus, X, AlertCircle, Trash2, CheckCircle, ChevronDown, ChevronUp, TrendingUp, ArrowRight, UserX, RefreshCw, ShieldAlert, Info, Briefcase, Pencil } from 'lucide-react';
import { getClients, createClient, updateClient, deleteClient, getClientCosts, addClientCost, deleteClientCost, getClientPlanHistory, addClientPlanChange, PlanHistoryEntry, registerChurn, reactivateClient, setClientRisk, getTcvProjects, createTcvProject, updateTcvProject, deleteTcvProject, addTcvPayment, updateTcvPayment, deleteTcvPayment } from '../api';
import type { AgencyClient, ClientCost, TcvProject, TcvPayment } from '../types';

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number | string) => `${Number(v).toFixed(1)}%`;

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
  em_risco: {
    label: 'Em risco',
    cardBorder: 'rgba(249,115,22,0.35)',
    cardBg: 'rgba(249,115,22,0.08)',
    badge: 'badge',
    icon: <ShieldAlert size={14} className="text-orange-400" />,
    bar: 'bg-orange-500',
  },
};

const STATUS_LABELS: Record<string, string> = {
  proposta: 'Proposta',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const EMPTY_CLIENT = { name: '', monthly_fee: 0, margin_target: 30, active: 1, start_date: '', notes: '', client_type: 'mrr' as const };
const EMPTY_COST = { description: '', amount: 0, type: 'fixo' as const, month: new Date().getMonth() + 1, year: new Date().getFullYear() };
const EMPTY_TCV_FORM: Partial<TcvProject> = { title: '', contract_value: 0, estimated_hours: 0, status: 'em_andamento', notes: '' };

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

  // Churn
  const [churnModal, setChurnModal] = useState<{ client: AgencyClient } | null>(null);
  const [churnDate, setChurnDate] = useState(new Date().toISOString().slice(0, 10));
  const [churnReason, setChurnReason] = useState('');
  const [churnNotes, setChurnNotes] = useState('');
  const [churnReactivation, setChurnReactivation] = useState('nao');
  const [churnSaving, setChurnSaving] = useState(false);
  const [reactivating, setReactivating] = useState<number | null>(null);

  // Risk alert
  const [riskModal, setRiskModal] = useState<{ client: AgencyClient } | null>(null);
  const [riskReason, setRiskReason] = useState('');
  const [riskSaving, setRiskSaving] = useState(false);

  // Plan change
  const [planModal, setPlanModal] = useState<{ client: AgencyClient } | null>(null);
  const [planFee, setPlanFee] = useState('');
  const [planType, setPlanType] = useState<'upgrade' | 'downgrade' | 'ajuste'>('upgrade');
  const [planNotes, setPlanNotes] = useState('');
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10));
  const [planSaving, setPlanSaving] = useState(false);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>([]);
  const [planHistoryLoading, setPlanHistoryLoading] = useState(false);

  // Filter
  const [typeFilter, setTypeFilter] = useState<'all' | 'mrr' | 'tcv'>('all');

  // Referrals
  const [clientReferrals, setClientReferrals] = useState<any[]>([]);

  // TCV
  const [tcvProjects, setTcvProjects] = useState<TcvProject[]>([]);
  const [tcvModal, setTcvModal] = useState<{ clientId: number; project?: TcvProject } | null>(null);
  const [tcvForm, setTcvForm] = useState<Partial<TcvProject>>(EMPTY_TCV_FORM);
  const [tcvSaving, setTcvSaving] = useState(false);
  const [addPaymentForm, setAddPaymentForm] = useState<{ projectId: number; amount: string; description: string; due_date: string; status: 'pendente' | 'pago' | 'atrasado' } | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [clientsData, projectsData] = await Promise.all([getClients(), getTcvProjects()]);
      setClients(clientsData);
      setTcvProjects(projectsData);
    }
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
    if (expandedId === id) { setExpandedId(null); setClientReferrals([]); return; }
    setExpandedId(id);
    setShowCostForm(false);
    setAddPaymentForm(null);
    setCostsLoading(true);
    setPlanHistoryLoading(true);
    try {
      const [costs, history] = await Promise.all([getClientCosts(id), getClientPlanHistory(id)]);
      setClientCosts(costs);
      setPlanHistory(history);
    } catch { setClientCosts([]); setPlanHistory([]); }
    finally { setCostsLoading(false); setPlanHistoryLoading(false); }
    // Fetch leads this client referred
    const token = localStorage.getItem('auth-token');
    fetch(`/api/opportunities/referrals/client/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setClientReferrals(Array.isArray(data) ? data : []))
      .catch(() => setClientReferrals([]));
  };

  const openChurnModal = (client: AgencyClient) => {
    setChurnModal({ client });
    setChurnDate(new Date().toISOString().slice(0, 10));
    setChurnReason('');
    setChurnNotes('');
    setChurnReactivation('nao');
  };

  const saveChurn = async () => {
    if (!churnModal) return;
    setChurnSaving(true);
    try {
      await registerChurn(churnModal.client.id, {
        churn_date: churnDate,
        churn_reason: churnReason || undefined,
        churn_notes: churnNotes || undefined,
        reactivation_potential: churnReactivation,
      });
      setChurnModal(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao registrar churn');
    } finally {
      setChurnSaving(false);
    }
  };

  const handleReactivate = async (id: number) => {
    if (!confirm('Reativar este cliente? Ele voltará para Saúde de Clientes.')) return;
    setReactivating(id);
    try { await reactivateClient(id); load(); }
    catch { alert('Erro ao reativar'); }
    finally { setReactivating(null); }
  };

  const openRiskModal = (client: AgencyClient) => {
    setRiskModal({ client });
    setRiskReason(client.risk_reason || '');
  };

  const saveRisk = async () => {
    if (!riskModal) return;
    setRiskSaving(true);
    try {
      await setClientRisk(riskModal.client.id, { risk_alert: true, risk_reason: riskReason });
      setRiskModal(null);
      load();
    } catch { alert('Erro ao marcar cliente em risco'); }
    finally { setRiskSaving(false); }
  };

  const clearRisk = async (client: AgencyClient) => {
    try {
      await setClientRisk(client.id, { risk_alert: false });
      load();
    } catch { alert('Erro ao remover alerta'); }
  };

  const openPlanModal = (client: AgencyClient) => {
    setPlanModal({ client });
    setPlanFee(String(client.monthly_fee));
    setPlanType('upgrade');
    setPlanNotes('');
    setPlanDate(new Date().toISOString().slice(0, 10));
  };

  const savePlanChange = async () => {
    if (!planModal || !planFee) return;
    setPlanSaving(true);
    try {
      await addClientPlanChange(planModal.client.id, {
        new_fee: parseFloat(planFee),
        change_type: planType,
        notes: planNotes.trim() || undefined,
        changed_at: planDate,
      });
      setPlanModal(null);
      load();
      if (expandedId === planModal.client.id) {
        setPlanHistory(await getClientPlanHistory(planModal.client.id));
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setPlanSaving(false);
    }
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

  // TCV handlers
  const openTcvCreate = (clientId: number) => {
    setTcvModal({ clientId });
    setTcvForm({ ...EMPTY_TCV_FORM, client_id: clientId });
  };

  const openTcvEdit = (project: TcvProject) => {
    setTcvModal({ clientId: project.client_id, project });
    setTcvForm({ ...project });
  };

  const saveTcvProject = async () => {
    if (!tcvModal || !tcvForm.title) return;
    setTcvSaving(true);
    try {
      if (tcvModal.project) {
        await updateTcvProject(tcvModal.project.id, tcvForm);
      } else {
        await createTcvProject({ ...tcvForm, client_id: tcvModal.clientId });
      }
      setTcvModal(null);
      const projects = await getTcvProjects();
      setTcvProjects(projects);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar projeto');
    } finally {
      setTcvSaving(false);
    }
  };

  const handleDeleteTcvProject = async (id: number) => {
    if (!confirm('Deletar este projeto e todos os pagamentos?')) return;
    try {
      await deleteTcvProject(id);
      setTcvProjects(await getTcvProjects());
    } catch { alert('Erro ao deletar projeto'); }
  };

  const handleMarkPaymentPaid = async (projectId: number, paymentId: number) => {
    try {
      await updateTcvPayment(projectId, paymentId, {
        status: 'pago',
        paid_date: new Date().toISOString().slice(0, 10),
      });
      setTcvProjects(await getTcvProjects());
    } catch { alert('Erro ao marcar pagamento'); }
  };

  const handleDeleteTcvPayment = async (projectId: number, paymentId: number) => {
    try {
      await deleteTcvPayment(projectId, paymentId);
      setTcvProjects(await getTcvProjects());
    } catch { alert('Erro ao deletar pagamento'); }
  };

  const handleAddPayment = async () => {
    if (!addPaymentForm || !addPaymentForm.amount) return;
    try {
      await addTcvPayment(addPaymentForm.projectId, {
        amount: parseFloat(addPaymentForm.amount),
        description: addPaymentForm.description || undefined,
        due_date: addPaymentForm.due_date || undefined,
        status: addPaymentForm.status,
      });
      setAddPaymentForm(null);
      setTcvProjects(await getTcvProjects());
    } catch { alert('Erro ao adicionar parcela'); }
  };

  const activeClients = clients.filter(c => c.active);
  // at-risk clients first, then alphabetical
  const sortedActiveClients = [...activeClients]
    .filter(c => {
      if (typeFilter === 'mrr') return !c.client_type || c.client_type === 'mrr' || c.client_type === 'ambos';
      if (typeFilter === 'tcv') return c.client_type === 'tcv' || c.client_type === 'ambos';
      return true;
    })
    .sort((a, b) => {
      const aRisk = a.risk_alert ? 1 : 0;
      const bRisk = b.risk_alert ? 1 : 0;
      if (bRisk !== aRisk) return bRisk - aRisk;
      return a.name.localeCompare(b.name);
    });
  const atRiskCount = activeClients.filter(c => c.risk_alert).length;
  const mrrClients = activeClients.filter(c => !c.client_type || c.client_type === 'mrr' || c.client_type === 'ambos');
  const totalMRR = mrrClients.reduce((s, c) => s + Number(c.monthly_fee), 0);
  const avgMargin = mrrClients.length > 0
    ? mrrClients.reduce((s, c) => s + (c.margin_percent || 0), 0) / mrrClients.length
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
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="label-dark mb-1">Clientes Ativos</div>
          <div className="metric">{activeClients.length}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">MRR Total</div>
          <div className="metric text-emerald-400">{brl(totalMRR)}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Margem Média (MRR)</div>
          <div className={`metric ${avgMargin >= 30 ? 'text-emerald-400' : avgMargin >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
            {pct(avgMargin)}
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ border: atRiskCount > 0 ? '1px solid rgba(249,115,22,0.4)' : '1px solid var(--border-card)', background: atRiskCount > 0 ? 'rgba(249,115,22,0.08)' : 'var(--bg-card)' }}>
          <div className="label-dark mb-1">Em risco</div>
          <div className={`metric ${atRiskCount > 0 ? 'text-orange-400' : 'text-slate-500'}`}>{atRiskCount}</div>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2">
        {([
          ['all', 'Todos', activeClients.length],
          ['mrr', 'MRR', activeClients.filter(c => !c.client_type || c.client_type === 'mrr' || c.client_type === 'ambos').length],
          ['tcv', 'TCV', activeClients.filter(c => c.client_type === 'tcv' || c.client_type === 'ambos').length],
        ] as const).map(([v, l, count]) => (
          <button
            key={v}
            onClick={() => setTypeFilter(v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              typeFilter === v
                ? v === 'mrr' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : v === 'tcv' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-white/10 border-white/20 text-slate-200'
                : 'border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-400'
            }`}
          >
            {l}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${typeFilter === v ? 'bg-white/15' : 'bg-white/5'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Margin calculation info box */}
      <div className="rounded-xl px-5 py-4 text-sm" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Info size={14} className="text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-300">Como calculamos a margem real</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Margem real = Mensalidade − Custos diretos do cliente − Rateio de custos fixos</strong>
          <br />
          O rateio distribui os custos fixos compartilhados da agência proporcionalmente ao MRR de cada cliente
          (quem paga mais, sustenta mais da estrutura). A base usada é a <strong className="text-slate-300">média dos últimos 3 meses</strong> de despesas
          fixas não alocadas a clientes — excluindo o que já está em "Custos do cliente" para evitar dupla contagem.
        </p>
      </div>

      {/* Client cards */}
      {activeClients.length === 0 ? (
        <div className="card py-12 text-center text-slate-500 text-sm">
          Nenhum cliente ativo.{' '}
          <button onClick={openCreate} className="text-blue-400 underline">Adicionar primeiro cliente</button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedActiveClients.map(c => {
            const h = HEALTH_CONFIG[c.health || 'critico'];
            const marginPct = Math.min((c.margin_percent || 0), 100);
            const isExpanded = expandedId === c.id;
            const isTcv = c.client_type === 'tcv' || c.client_type === 'ambos';
            const isMrr = !c.client_type || c.client_type === 'mrr' || c.client_type === 'ambos';
            const clientProjects = tcvProjects.filter(p => p.client_id === c.id && p.status !== 'cancelado');
            const tcvContractTotal = clientProjects.reduce((s, p) => s + Number(p.contract_value), 0);
            const tcvPaidTotal = clientProjects.reduce((s, p) => s + Number(p.paid_amount), 0);

            return (
              <div key={c.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${h.cardBorder}` }}>
                <div className="p-4" style={{ background: h.cardBg }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-100 truncate">{c.name}</h3>
                          {!c.active && <span className="badge badge-slate">Inativo</span>}
                          {c.client_type === 'tcv' && (
                            <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>TCV</span>
                          )}
                          {c.client_type === 'ambos' && (
                            <span className="badge" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8' }}>MRR+TCV</span>
                          )}
                        </div>
                        {c.risk_alert ? (
                          <div className="flex items-center gap-1.5 text-xs text-orange-400 mb-1">
                            <ShieldAlert size={11} />
                            <span className="font-medium">Em risco operacional</span>
                            {c.risk_reason && <span className="text-orange-300/70">— {c.risk_reason}</span>}
                            <button onClick={() => clearRisk(c)} className="ml-1 text-slate-500 hover:text-slate-300 underline">remover alerta</button>
                          </div>
                        ) : null}
                        {isMrr && (
                          <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span>Mensalidade: <strong className="text-slate-200">{brl(c.monthly_fee)}</strong></span>
                            <span>Custos diretos: <strong className="text-red-400">{brl(c.monthly_cost || 0)}</strong></span>
                            <span>Rateio fixos: <strong className="text-amber-400">{brl(c.allocated_fixed || 0)}</strong></span>
                            <span>Margem real: <strong className={c.margin && c.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{brl(c.margin || 0)}</strong></span>
                          </div>
                        )}
                        {isTcv && (
                          <div className="flex items-center gap-4 text-sm text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1.5"><Briefcase size={12} className="text-amber-400" />
                              <strong className="text-slate-300">{clientProjects.length}</strong> {clientProjects.length === 1 ? 'projeto' : 'projetos'}
                            </span>
                            <span>Contrato: <strong className="text-amber-300">{brl(tcvContractTotal)}</strong></span>
                            <span>Recebido: <strong className="text-emerald-400">{brl(tcvPaidTotal)}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className={`flex items-center gap-1.5 ${h.badge}`}>
                        {h.icon}{h.label}
                      </span>
                      {c.active ? (
                        <>
                          {isMrr && (
                            <button onClick={() => openPlanModal(c)} title="Mudar plano" className="p-1.5 text-slate-500 hover:text-emerald-400 rounded"><TrendingUp size={14} /></button>
                          )}
                          <button
                            onClick={() => c.risk_alert ? clearRisk(c) : openRiskModal(c)}
                            title={c.risk_alert ? 'Remover alerta de risco' : 'Marcar como em risco operacional'}
                            className={`p-1.5 rounded ${c.risk_alert ? 'text-orange-400 hover:text-orange-300' : 'text-slate-500 hover:text-orange-400'}`}
                          ><ShieldAlert size={14} /></button>
                          <button onClick={() => openChurnModal(c)} title="Registrar cancelamento" className="p-1.5 text-slate-500 hover:text-orange-400 rounded"><UserX size={14} /></button>
                        </>
                      ) : (
                        <button onClick={() => handleReactivate(c.id)} disabled={reactivating === c.id} title="Reativar cliente" className="p-1.5 text-slate-500 hover:text-emerald-400 rounded disabled:opacity-40"><RefreshCw size={14} /></button>
                      )}
                      <button onClick={() => openEdit(c)} title="Editar cliente" className="p-1.5 text-slate-500 hover:text-blue-400 rounded"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={13} /></button>
                      <button onClick={() => toggleExpand(c.id)} className="p-1.5 text-slate-400 hover:text-slate-200 rounded">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Margin progress bar — only for MRR clients */}
                  {isMrr && (
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
                  )}
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="p-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                    {/* MRR section: plan history + costs */}
                    {isMrr && (
                      <>
                        {/* Plan history */}
                        {(planHistoryLoading || planHistory.length > 0) && (
                          <div className="mb-4">
                            <h4 className="text-sm font-semibold text-slate-300 mb-2">Histórico de plano</h4>
                            {planHistoryLoading ? (
                              <div className="text-xs text-slate-500 py-2">Carregando...</div>
                            ) : (
                              <div className="space-y-1.5">
                                {planHistory.map(h => {
                                  const isUp = h.new_fee > h.old_fee;
                                  const typeLabel: Record<string, string> = { upgrade: 'Upgrade', downgrade: 'Downgrade', ajuste: 'Ajuste' };
                                  return (
                                    <div key={h.id} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                      <span className={`font-semibold px-1.5 py-0.5 rounded text-xs ${isUp ? 'text-emerald-400 bg-emerald-400/10' : h.new_fee < h.old_fee ? 'text-red-400 bg-red-400/10' : 'text-slate-400 bg-slate-400/10'}`}>
                                        {typeLabel[h.change_type] || h.change_type}
                                      </span>
                                      <span className="text-slate-400">{brl(h.old_fee)}</span>
                                      <ArrowRight size={11} className="text-slate-600" />
                                      <span className={`font-semibold ${isUp ? 'text-emerald-400' : h.new_fee < h.old_fee ? 'text-red-400' : 'text-slate-300'}`}>{brl(h.new_fee)}</span>
                                      <span className="text-slate-600 ml-auto">{h.changed_at?.slice(0, 10).split('-').reverse().join('/')}</span>
                                      {h.notes && <span className="text-slate-500 italic truncate max-w-[160px]">{h.notes}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

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
                                <td className="py-2 text-right font-bold text-red-400">{brl(clientCosts.reduce((s, c) => s + Number(c.amount), 0))}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        )}
                      </>
                    )}

                    {/* Referrals section */}
                    {isExpanded && clientReferrals.length > 0 && (
                      <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(245,158,11,0.15)' }}>
                        <h4 className="text-sm font-semibold text-amber-300 mb-2 flex items-center gap-2">
                          🤝 Indicações deste cliente
                        </h4>
                        <div className="space-y-1.5">
                          {clientReferrals.map((ref: any) => (
                            <div key={ref.id} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg"
                              style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)' }}>
                              <span className="text-slate-300 flex-1">{ref.title}</span>
                              <span className={ref.stage === 'fechado' ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                                {ref.stage === 'fechado' ? '✅ Fechado' : ref.stage}
                              </span>
                              <span className="text-emerald-400 font-semibold">{brl(Number(ref.value))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* TCV Projects section */}
                    {isTcv && (
                      <div className={isMrr ? 'mt-5 pt-4' : ''} style={isMrr ? { borderTop: '1px solid rgba(245,158,11,0.15)' } : {}}>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Briefcase size={14} className="text-amber-400" /> Projetos TCV
                          </h4>
                          <button onClick={() => openTcvCreate(c.id)} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300">
                            <Plus size={13} /> Novo Projeto
                          </button>
                        </div>

                        {clientProjects.length === 0 ? (
                          <div className="py-4 text-center text-slate-500 text-sm">Nenhum projeto ativo.</div>
                        ) : (
                          <div className="space-y-3">
                            {clientProjects.map(proj => {
                              const marginColor = proj.margin_pct >= 40 ? 'text-emerald-400' : proj.margin_pct >= 20 ? 'text-amber-400' : 'text-red-400';
                              return (
                                <div key={proj.id} className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-200 text-sm">{proj.title}</span>
                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>
                                          {STATUS_LABELS[proj.status] || proj.status}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                        <span>Valor: <strong className="text-amber-300">{brl(proj.contract_value)}</strong></span>
                                        <span>{proj.estimated_hours}h × {brl(proj.hour_cost)}/h = <strong className="text-slate-300">{brl(proj.project_cost)}</strong> custo</span>
                                        <span className={`font-semibold ${marginColor}`}>Margem: {pct(proj.margin_pct)}</span>
                                      </div>
                                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                        <span>Pago: <strong className="text-emerald-400">{brl(proj.paid_amount)}</strong></span>
                                        {proj.pending_amount > 0 && <span>Pendente: <strong className="text-slate-300">{brl(proj.pending_amount)}</strong></span>}
                                        {proj.overdue_amount > 0 && <span>Atrasado: <strong className="text-red-400">{brl(proj.overdue_amount)}</strong></span>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                      <button onClick={() => openTcvEdit(proj)} className="p-1 text-slate-500 hover:text-blue-400 rounded text-xs">Editar</button>
                                      <button onClick={() => handleDeleteTcvProject(proj.id)} className="p-1 text-slate-500 hover:text-red-400 rounded"><Trash2 size={12} /></button>
                                    </div>
                                  </div>

                                  {/* Payments */}
                                  {proj.payments.length > 0 && (
                                    <div className="mt-2 space-y-1.5">
                                      {proj.payments.map((pay: TcvPayment) => (
                                        <div key={pay.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                          <span className="text-slate-300 font-medium">{brl(pay.amount)}</span>
                                          {pay.description && <span className="text-slate-500">{pay.description}</span>}
                                          {pay.due_date && <span className="text-slate-500">venc {pay.due_date.slice(0, 10).split('-').reverse().join('/')}</span>}
                                          <span className={`ml-auto px-1.5 py-0.5 rounded font-semibold ${
                                            pay.status === 'pago' ? 'text-emerald-400 bg-emerald-400/10' :
                                            pay.status === 'atrasado' ? 'text-red-400 bg-red-400/10' :
                                            'text-slate-400 bg-slate-400/10'
                                          }`}>
                                            {pay.status === 'pago' ? 'Pago' : pay.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                                          </span>
                                          {pay.status !== 'pago' && (
                                            <button
                                              onClick={() => handleMarkPaymentPaid(proj.id, pay.id)}
                                              className="text-emerald-500 hover:text-emerald-400 text-xs px-1.5 py-0.5 rounded border border-emerald-500/30 hover:border-emerald-400/50"
                                            >
                                              Marcar pago
                                            </button>
                                          )}
                                          <button onClick={() => handleDeleteTcvPayment(proj.id, pay.id)} className="text-slate-600 hover:text-red-400 ml-1"><Trash2 size={11} /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Add payment form */}
                                  {addPaymentForm?.projectId === proj.id ? (
                                    <div className="mt-2 rounded p-2 space-y-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="label-dark mb-1 block text-xs">Valor (R$) *</label>
                                          <input type="number" step="0.01" value={addPaymentForm.amount} onChange={e => setAddPaymentForm(f => f ? { ...f, amount: e.target.value } : null)} className="input-dark w-full text-xs" />
                                        </div>
                                        <div>
                                          <label className="label-dark mb-1 block text-xs">Descrição</label>
                                          <input value={addPaymentForm.description} onChange={e => setAddPaymentForm(f => f ? { ...f, description: e.target.value } : null)} className="input-dark w-full text-xs" placeholder="Ex: Entrada" />
                                        </div>
                                        <div>
                                          <label className="label-dark mb-1 block text-xs">Vencimento</label>
                                          <input type="date" value={addPaymentForm.due_date} onChange={e => setAddPaymentForm(f => f ? { ...f, due_date: e.target.value } : null)} className="input-dark w-full text-xs" />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <select value={addPaymentForm.status} onChange={e => setAddPaymentForm(f => f ? { ...f, status: e.target.value as 'pendente' | 'pago' | 'atrasado' } : null)} className="input-dark text-xs flex-1">
                                          <option value="pendente">Pendente</option>
                                          <option value="pago">Pago</option>
                                          <option value="atrasado">Atrasado</option>
                                        </select>
                                        <button onClick={handleAddPayment} className="btn-primary text-xs px-3 py-1.5">Salvar</button>
                                        <button onClick={() => setAddPaymentForm(null)} className="btn-ghost text-xs px-3 py-1.5">Cancelar</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setAddPaymentForm({ projectId: proj.id, amount: '', description: '', due_date: '', status: 'pendente' })}
                                      className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-amber-400"
                                    >
                                      <Plus size={11} /> Adicionar parcela
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Risk Modal */}
      {riskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <ShieldAlert size={16} className="text-orange-400" /> Marcar como em risco
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{riskModal.client.name}</p>
              </div>
              <button onClick={() => setRiskModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg px-4 py-3 text-sm text-orange-300" style={{ background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)' }}>
                O cliente será destacado como <strong>em risco de cancelamento</strong> por falha operacional interna da agência.
              </div>
              <Field label="Motivo / O que aconteceu?">
                <textarea
                  autoFocus
                  value={riskReason}
                  onChange={e => setRiskReason(e.target.value)}
                  className="input-dark w-full resize-none"
                  rows={3}
                  placeholder="Ex: Entregamos o relatório com 2 semanas de atraso e demos 1 mês sem cobrar como retratação..."
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setRiskModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={saveRisk}
                disabled={riskSaving}
                className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.4)', color: '#fb923c' }}
              >
                {riskSaving ? 'Salvando...' : 'Confirmar alerta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Churn Modal */}
      {churnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2"><UserX size={16} className="text-orange-400" /> Registrar cancelamento</h2>
                <p className="text-xs text-slate-500 mt-0.5">{churnModal.client.name}</p>
              </div>
              <button onClick={() => setChurnModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Data do cancelamento">
                <input type="date" value={churnDate} onChange={e => setChurnDate(e.target.value)} className="input-dark w-full" />
              </Field>
              <Field label="Motivo do cancelamento">
                <select value={churnReason} onChange={e => setChurnReason(e.target.value)} className="input-dark w-full">
                  <option value="">Não informado</option>
                  <option value="Preço">Preço</option>
                  <option value="Resultado insatisfatório">Resultado insatisfatório</option>
                  <option value="Concorrência">Concorrência</option>
                  <option value="Corte de orçamento">Corte de orçamento</option>
                  <option value="Fechamento da empresa">Fechamento da empresa</option>
                  <option value="Decisão interna">Decisão interna</option>
                  <option value="Outros">Outros</option>
                </select>
              </Field>
              <Field label="Observações (opcional)">
                <textarea value={churnNotes} onChange={e => setChurnNotes(e.target.value)} className="input-dark w-full resize-none" rows={2} placeholder="Detalhes sobre o cancelamento..." />
              </Field>
              <Field label="Potencial de reativação">
                <div className="flex gap-2">
                  {[['nao', 'Não'], ['baixa', 'Baixo'], ['media', 'Médio'], ['alta', 'Alto']] .map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setChurnReactivation(v)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${churnReactivation === v
                        ? v === 'alta' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : v === 'media' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                          : v === 'baixa' ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                          : 'bg-slate-500/20 border-slate-500/50 text-slate-400'
                        : 'border-white/10 text-slate-500 hover:border-white/20'}`}
                    >{l}</button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setChurnModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={saveChurn}
                disabled={churnSaving}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50"
              >
                {churnSaving ? 'Registrando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Change Modal */}
      {planModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <div>
                <h2 className="font-semibold text-white">Mudança de plano</h2>
                <p className="text-xs text-slate-500 mt-0.5">{planModal.client.name}</p>
              </div>
              <button onClick={() => setPlanModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="text-center flex-1">
                  <div className="text-xs text-slate-500 mb-1">Mensalidade atual</div>
                  <div className="font-semibold text-slate-200">{brl(planModal.client.monthly_fee)}</div>
                </div>
                <ArrowRight size={16} className="text-slate-600" />
                <div className="text-center flex-1">
                  <div className="text-xs text-slate-500 mb-1">Nova mensalidade</div>
                  <div className={`font-semibold ${planFee && parseFloat(planFee) > planModal.client.monthly_fee ? 'text-emerald-400' : planFee && parseFloat(planFee) < planModal.client.monthly_fee ? 'text-red-400' : 'text-slate-400'}`}>
                    {planFee ? brl(planFee) : '—'}
                  </div>
                </div>
              </div>
              <Field label="Novo valor (R$) *">
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  value={planFee}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setPlanFee(e.target.value);
                    if (!isNaN(v)) {
                      if (v > planModal.client.monthly_fee) setPlanType('upgrade');
                      else if (v < planModal.client.monthly_fee) setPlanType('downgrade');
                      else setPlanType('ajuste');
                    }
                  }}
                  className="input-dark w-full"
                  placeholder="0,00"
                />
              </Field>
              <Field label="Tipo de mudança">
                <div className="flex gap-2">
                  {(['upgrade', 'downgrade', 'ajuste'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setPlanType(t)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${planType === t
                        ? t === 'upgrade' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : t === 'downgrade' ? 'bg-red-500/20 border-red-500/50 text-red-400'
                          : 'bg-slate-500/20 border-slate-500/50 text-slate-300'
                        : 'border-white/10 text-slate-500 hover:border-white/20'}`}
                    >
                      {t === 'upgrade' ? '↑ Upgrade' : t === 'downgrade' ? '↓ Downgrade' : '↔ Ajuste'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Data da mudança">
                <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} className="input-dark w-full" />
              </Field>
              <Field label="Observações (opcional)">
                <input value={planNotes} onChange={e => setPlanNotes(e.target.value)} className="input-dark w-full" placeholder="Ex: Adicionou gestão de redes sociais" />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setPlanModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={savePlanChange}
                disabled={planSaving || !planFee || parseFloat(planFee) === planModal.client.monthly_fee}
                className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <TrendingUp size={14} />
                {planSaving ? 'Salvando...' : 'Registrar mudança'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TCV Project Modal */}
      {tcvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Briefcase size={16} className="text-amber-400" />
                {tcvModal.project ? 'Editar Projeto' : 'Novo Projeto TCV'}
              </h2>
              <button onClick={() => setTcvModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Título *">
                <input value={tcvForm.title || ''} onChange={e => setTcvForm(f => ({ ...f, title: e.target.value }))} className="input-dark w-full" placeholder="Ex: Site Institucional" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor do contrato (R$)">
                  <input type="number" step="0.01" value={tcvForm.contract_value || ''} onChange={e => setTcvForm(f => ({ ...f, contract_value: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Horas estimadas">
                  <input type="number" step="0.5" value={tcvForm.estimated_hours || ''} onChange={e => setTcvForm(f => ({ ...f, estimated_hours: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
              </div>
              {tcvModal.project && tcvModal.project.hour_cost > 0 && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <span className="text-slate-400">Custo estimado: </span>
                  <strong className="text-slate-200">{brl((tcvForm.estimated_hours || 0) * tcvModal.project.hour_cost)}</strong>
                  {(tcvForm.contract_value || 0) > 0 && (
                    <>
                      <span className="text-slate-500 mx-2">|</span>
                      <span className="text-slate-400">Margem projetada: </span>
                      <strong className={
                        ((tcvForm.contract_value || 0) - (tcvForm.estimated_hours || 0) * tcvModal.project.hour_cost) / (tcvForm.contract_value || 1) * 100 >= 40
                          ? 'text-emerald-400' : 'text-amber-400'
                      }>
                        {pct(((tcvForm.contract_value || 0) - (tcvForm.estimated_hours || 0) * tcvModal.project.hour_cost) / (tcvForm.contract_value || 1) * 100)}
                      </strong>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data de início">
                  <input type="date" value={tcvForm.start_date || ''} onChange={e => setTcvForm(f => ({ ...f, start_date: e.target.value }))} className="input-dark w-full" />
                </Field>
                <Field label="Data de entrega">
                  <input type="date" value={tcvForm.end_date || ''} onChange={e => setTcvForm(f => ({ ...f, end_date: e.target.value }))} className="input-dark w-full" />
                </Field>
              </div>
              <Field label="Status">
                <select value={tcvForm.status || 'em_andamento'} onChange={e => setTcvForm(f => ({ ...f, status: e.target.value as TcvProject['status'] }))} className="input-dark w-full">
                  <option value="proposta">Proposta</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </Field>
              <Field label="Observações">
                <textarea value={tcvForm.notes || ''} onChange={e => setTcvForm(f => ({ ...f, notes: e.target.value }))} className="input-dark w-full resize-none" rows={2} />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(245,158,11,0.15)' }}>
              <button onClick={() => setTcvModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={saveTcvProject}
                disabled={tcvSaving || !tcvForm.title}
                className="text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}
              >
                {tcvSaving ? 'Salvando...' : 'Salvar projeto'}
              </button>
            </div>
          </div>
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
              <Field label="Tipo de cliente">
                <div className="flex gap-2">
                  {([['mrr', 'MRR (Recorrente)'], ['tcv', 'TCV (Projeto)'], ['ambos', 'MRR + TCV']] as const).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setClientForm(f => ({ ...f, client_type: v }))}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        (clientForm.client_type || 'mrr') === v
                          ? v === 'mrr' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                            : v === 'tcv' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                            : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                          : 'border-white/10 text-slate-500 hover:border-white/20'
                      }`}
                    >{l}</button>
                  ))}
                </div>
              </Field>
              {((clientForm.client_type || 'mrr') === 'mrr' || clientForm.client_type === 'ambos') && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mensalidade (R$)">
                    <input type="number" step="0.01" value={clientForm.monthly_fee || ''} onChange={e => setClientForm(f => ({ ...f, monthly_fee: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                  </Field>
                  <Field label="Meta de margem (%)">
                    <input type="number" value={clientForm.margin_target || 30} onChange={e => setClientForm(f => ({ ...f, margin_target: parseFloat(e.target.value) || 30 }))} className="input-dark w-full" />
                  </Field>
                </div>
              )}
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
