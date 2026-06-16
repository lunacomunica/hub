import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, AlertCircle, X, Search, Download, Tag, Type, Upload, Users, Repeat2 } from 'lucide-react';
import { getRevenues, createRevenue, updateRevenue, updateRevenueStatus, deleteRevenue, getCategories, getClients, bulkUpdateRevenues, bulkImportRevenues, getRevenueProjections } from '../api';
import type { Revenue, Category, AgencyClient } from '../types';
import ImportModal from '../components/ImportModal';
import CategorySelect from '../components/CategorySelect';

type RevenueRow = Revenue & { client_id?: number | null; client_display_name?: string | null };

interface FormState extends Partial<RevenueRow> {
  client_id?: number | null;
}

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? d.split('-').reverse().join('/') : '—';

const STATUS_BADGE: Record<string, string> = {
  pago: 'badge badge-green',
  pendente: 'badge badge-amber',
  atrasado: 'badge badge-red',
  cancelado: 'badge badge-slate',
};
const STATUS_LABELS: Record<string, string> = {
  pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', cancelado: 'Cancelado',
};
const REC_LABELS: Record<string, string> = {
  monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual',
};

const now = new Date();

const EMPTY: FormState = {
  description: '', client_name: '', client_id: null, category_id: undefined, amount: 0,
  date: now.toISOString().slice(0, 10), due_date: '', status: 'pendente',
  is_recurring: 0, recurrence_type: undefined, notes: '',
};

export default function Revenues() {
  const [items, setItems] = useState<RevenueRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterStatus, setFilterStatus] = useState('');

  // Search
  const [search, setSearch] = useState('');

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState<'rename' | 'categorize' | 'client' | 'recurring' | null>(null);
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('');
  const [bulkClientId, setBulkClientId] = useState<number | null>(null);
  const [bulkClientName, setBulkClientName] = useState('');
  const [bulkClientSearch, setBulkClientSearch] = useState('');
  const [bulkIsRecurring, setBulkIsRecurring] = useState(true);
  const [bulkRecurrenceType, setBulkRecurrenceType] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [projections, setProjections] = useState<(RevenueRow & { is_projection: true })[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [revsResult, catsResult, clsResult, projResult] = await Promise.allSettled([
        getRevenues({ month: viewMode === 'annual' ? undefined : filterMonth, year: filterYear, status: filterStatus || undefined }),
        getCategories('revenue'),
        getClients(),
        viewMode === 'monthly' ? getRevenueProjections(filterMonth, filterYear) : Promise.resolve([]),
      ]);
      if (revsResult.status === 'fulfilled') setItems(revsResult.value as RevenueRow[]);
      else setError('Erro ao buscar receitas');
      if (catsResult.status === 'fulfilled') setCategories(catsResult.value);
      if (clsResult.status === 'fulfilled') setClients(clsResult.value);
      if (projResult.status === 'fulfilled') setProjections(projResult.value as (RevenueRow & { is_projection: true })[]);
      else setProjections([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [viewMode, filterMonth, filterYear, filterStatus]);

  // Filtered items (frontend search)
  const visibleItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(r =>
      (r.description || '').toLowerCase().includes(q) ||
      (r.client_display_name || r.client_name || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  // Summary computed from visibleItems
  const paid = visibleItems.filter(r => r.status === 'pago').reduce((s, r) => s + Number(r.amount), 0);
  const pending = visibleItems.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.amount), 0);
  const overdue = visibleItems.filter(r => r.status === 'atrasado').reduce((s, r) => s + Number(r.amount), 0);

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  // Modal helpers
  const openCreate = () => { setForm({ ...EMPTY }); setModal(true); };
  const openEdit = (r: RevenueRow) => { setForm({ ...r }); setModal(true); };
  const closeModal = () => { setModal(false); setForm(EMPTY); };

  const save = async () => {
    if (!form.description || !form.amount || !form.date) return;
    setSaving(true);
    try {
      const payload: Partial<RevenueRow> = { ...form };
      if (form.id) {
        await updateRevenue(form.id, payload as Partial<Revenue>);
      } else {
        await createRevenue(payload as Partial<Revenue>);
      }
      closeModal();
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusClick = async (r: RevenueRow) => {
    const cycle: Revenue['status'][] = ['pendente', 'pago', 'atrasado', 'cancelado'];
    const next = cycle[(cycle.indexOf(r.status) + 1) % cycle.length];
    try {
      await updateRevenueStatus(r.id, next);
      load();
    } catch {
      alert('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deletar esta receita?')) return;
    setDeleting(id);
    try { await deleteRevenue(id); load(); } catch { alert('Erro ao deletar'); }
    finally { setDeleting(null); }
  };

  // Bulk selection helpers
  const allVisible = visibleItems.map(r => r.id);
  const allChecked = allVisible.length > 0 && allVisible.every(id => selected.has(id));
  const someChecked = allVisible.some(id => selected.has(id));

  const toggleAll = () => {
    if (allChecked) {
      setSelected(prev => { const s = new Set(prev); allVisible.forEach(id => s.delete(id)); return s; });
    } else {
      setSelected(prev => { const s = new Set(prev); allVisible.forEach(id => s.add(id)); return s; });
    }
  };

  const toggleOne = (id: number) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const clearSelection = () => setSelected(new Set());

  const selectedIds = Array.from(selected);

  const saveBulk = async (updates: Record<string, string | number | null | undefined>) => {
    setBulkSaving(true);
    try {
      await bulkUpdateRevenues(selectedIds, updates);
      setBulkModal(null);
      clearSelection();
      load();
    } catch {
      alert('Erro ao atualizar em lote');
    } finally {
      setBulkSaving(false);
    }
  };

  // CSV export
  const exportCSV = () => {
    const mm = String(filterMonth).padStart(2, '0');
    const header = ['Data', 'Descrição', 'Cliente', 'Categoria', 'Valor', 'Status'];
    const rows = visibleItems.map(r => [
      fmtDate(r.date),
      `"${(r.description || '').replace(/"/g, '""')}"`,
      `"${((r.client_display_name || r.client_name) || '').replace(/"/g, '""')}"`,
      `"${(r.category_name || '').replace(/"/g, '""')}"`,
      Number(r.amount).toFixed(2).replace('.', ','),
      STATUS_LABELS[r.status] || r.status,
    ]);
    const csv = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receitas-${mm}-${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Client name display helper
  const clientDisplayName = (r: RevenueRow) => r.client_display_name || r.client_name || '—';

  // Form: when a client is selected from dropdown, set client_id and client_name
  const handleClientSelect = (val: string) => {
    if (!val) {
      setForm(f => ({ ...f, client_id: null }));
    } else {
      const cl = clients.find(c => c.id === Number(val));
      setForm(f => ({ ...f, client_id: Number(val), client_name: cl?.name || '' }));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Receitas</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => setShowImport(true)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Upload size={15} /> Importar
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nova Receita
          </button>
        </div>
      </div>

      {/* Filters — compact single row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Toggle Mensal / Anual */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-input)' }}>
          <button onClick={() => setViewMode('monthly')} className="text-sm px-3 py-1.5 transition-colors whitespace-nowrap"
            style={{ background: viewMode === 'monthly' ? 'var(--primary,#6366f1)' : 'transparent', color: viewMode === 'monthly' ? '#fff' : 'var(--text-secondary)' }}>
            Mensal
          </button>
          <button onClick={() => setViewMode('annual')} className="text-sm px-3 py-1.5 transition-colors whitespace-nowrap"
            style={{ background: viewMode === 'annual' ? 'var(--primary,#6366f1)' : 'transparent', color: viewMode === 'annual' ? '#fff' : 'var(--text-secondary)' }}>
            Anual
          </button>
        </div>
        {viewMode === 'monthly' && (
          <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="input-dark text-sm py-1.5">
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        )}
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="input-dark text-sm py-1.5">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-dark text-sm py-1.5">
          <option value="">Todos os status</option>
          <option value="pago">Pago</option>
          <option value="pendente">Pendente</option>
          <option value="atrasado">Atrasado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button onClick={load} className="p-1.5 text-slate-400 hover:text-blue-400"><RefreshCw size={15} /></button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="label-dark mb-1">Recebido</div>
          <div className="metric-md text-emerald-400">{brl(paid)}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">A receber</div>
          <div className="metric-md text-amber-400">{brl(pending)}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Em atraso</div>
          <div className="metric-md text-red-400">{brl(overdue)}</div>
        </div>
      </div>

      {/* Search / Bulk action bar */}
      {selected.size > 0 ? (
        <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {selected.size} {selected.size === 1 ? 'receita selecionada' : 'receitas selecionadas'}
          </span>
          <button
            onClick={() => { setBulkDescription(''); setBulkModal('rename'); }}
            className="btn-ghost flex items-center gap-1.5 text-sm"
          >
            <Type size={13} /> Renomear
          </button>
          <button
            onClick={() => { setBulkCategoryId(''); setBulkModal('categorize'); }}
            className="btn-ghost flex items-center gap-1.5 text-sm"
          >
            <Tag size={13} /> Categorizar
          </button>
          <button
            onClick={() => { setBulkClientId(null); setBulkClientName(''); setBulkClientSearch(''); setBulkModal('client'); }}
            className="btn-ghost flex items-center gap-1.5 text-sm"
          >
            <Users size={13} /> Cliente
          </button>
          <button
            onClick={() => { setBulkIsRecurring(true); setBulkRecurrenceType('monthly'); setBulkModal('recurring'); }}
            className="btn-ghost flex items-center gap-1.5 text-sm"
          >
            <Repeat2 size={13} /> Recorrente
          </button>
          <button onClick={clearSelection} className="btn-ghost flex items-center gap-1.5 text-sm ml-auto">
            <X size={13} /> Desmarcar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark w-full pl-8 text-sm"
            placeholder="Buscar por descrição ou cliente..."
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>
        ) : error ? (
          <div className="flex flex-col items-center py-12 gap-3 text-red-400">
            <AlertCircle size={32} />
            <p className="text-sm">{error}</p>
            <button onClick={load} className="text-xs text-blue-400 underline">Tentar novamente</button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {items.length === 0
              ? <><span>Nenhuma receita encontrada.{' '}</span><button onClick={openCreate} className="text-blue-400 underline">Adicionar primeira receita</button></>
              : 'Nenhuma receita corresponde à busca.'
            }
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                <th className="th px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="rounded cursor-pointer"
                    title="Selecionar todos"
                  />
                </th>
                <th className="th text-left px-4 py-3">Data</th>
                <th className="th text-left px-4 py-3">Descrição</th>
                <th className="th text-left px-4 py-3">Cliente</th>
                <th className="th text-left px-4 py-3">Categoria</th>
                <th className="th text-right px-4 py-3">Valor</th>
                <th className="th text-center px-4 py-3">Status</th>
                <th className="th text-center px-4 py-3">Rec.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(r => (
                <tr key={r.id} className={`tr transition-colors ${selected.has(r.id) ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''}`}>
                  <td className="td px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="rounded cursor-pointer"
                    />
                  </td>
                  <td className="td px-4 py-3">{fmtDate(r.date)}</td>
                  <td className="td px-4 py-3 font-medium text-slate-200">{r.description}</td>
                  <td className="td px-4 py-3">{clientDisplayName(r)}</td>
                  <td className="td px-4 py-3">
                    {r.category_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (r.category_color || '#6366f1') + '22', color: r.category_color || '#6366f1' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.category_color || '#6366f1' }} />
                        {r.category_name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td px-4 py-3 text-right font-semibold text-slate-200">{brl(r.amount)}</td>
                  <td className="td px-4 py-3 text-center">
                    <button
                      onClick={() => handleStatusClick(r)}
                      className={`cursor-pointer transition-opacity hover:opacity-80 ${STATUS_BADGE[r.status]}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </button>
                  </td>
                  <td className="td px-4 py-3 text-center">
                    {r.is_recurring ? (
                      <span className="badge badge-purple">
                        {REC_LABELS[r.recurrence_type || 'monthly'] || '✓'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Projections */}
              {projections.filter(p => {
                const q = search.toLowerCase();
                return !q || (p.description || '').toLowerCase().includes(q) || (p.client_display_name || p.client_name || '').toLowerCase().includes(q);
              }).map(p => (
                <tr key={p.id} className="tr opacity-60" style={{ borderLeft: '3px solid #f59e0b' }}>
                  <td className="td px-4 py-3 w-8">
                    <input type="checkbox" disabled className="rounded cursor-not-allowed opacity-40" />
                  </td>
                  <td className="td px-4 py-3 text-slate-400 text-xs italic">—</td>
                  <td className="td px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 text-xs">{p.description}</span>
                    </div>
                  </td>
                  <td className="td px-4 py-3 text-xs text-slate-400">{p.client_display_name || p.client_name || '—'}</td>
                  <td className="td px-4 py-3">
                    {p.category_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (p.category_color || '#6366f1') + '22', color: p.category_color || '#6366f1' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.category_color || '#6366f1' }} />
                        {p.category_name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td px-4 py-3 text-right font-semibold text-slate-300">{brl(p.amount)}</td>
                  <td className="td px-4 py-3 text-center">
                    <span className="badge badge-amber text-xs">PROVISÃO</span>
                  </td>
                  <td className="td px-4 py-3 text-center">
                    <span className="badge badge-purple text-xs">{REC_LABELS[p.recurrence_type || 'monthly']}</span>
                  </td>
                  <td className="td px-4 py-3">
                    <button
                      onClick={() => {
                        const today = new Date();
                        const day = String(today.getDate()).padStart(2, '0');
                        const m = String(filterMonth).padStart(2, '0');
                        setForm({ ...p, id: undefined, date: `${filterYear}-${m}-${day}`, status: 'pendente' });
                        setModal(true);
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
                    >
                      + Confirmar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">{form.id ? 'Editar Receita' : 'Nova Receita'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Descrição *">
                <input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-dark w-full" placeholder="Ex: Mensalidade Cliente X" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cliente">
                  {clients.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={form.client_id ?? ''}
                        onChange={e => handleClientSelect(e.target.value)}
                        className="input-dark w-full"
                      >
                        <option value="">— Sem cliente vinculado —</option>
                        {clients.filter(c => c.active).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {!form.client_id && (
                        <input
                          value={form.client_name || ''}
                          onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                          className="input-dark w-full text-xs"
                          placeholder="Ou nome livre (opcional)"
                        />
                      )}
                    </div>
                  ) : (
                    <input value={form.client_name || ''} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="input-dark w-full" placeholder="Nome do cliente" />
                  )}
                </Field>
                <Field label="Categoria">
                  <CategorySelect
                    value={form.category_id}
                    onChange={id => setForm(f => ({ ...f, category_id: id }))}
                    categories={categories}
                    onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
                    type="revenue"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor (R$) *">
                  <input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Status">
                  <select value={form.status || 'pendente'} onChange={e => setForm(f => ({ ...f, status: e.target.value as Revenue['status'] }))} className="input-dark w-full">
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data *">
                  <input type="date" value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input-dark w-full" />
                </Field>
                <Field label="Vencimento">
                  <input type="date" value={form.due_date || ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input-dark w-full" />
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked ? 1 : 0 }))} className="rounded" />
                  <span className="text-sm text-slate-300">Recorrente</span>
                </label>
                {!!form.is_recurring && (
                  <select value={form.recurrence_type || 'monthly'} onChange={e => setForm(f => ({ ...f, recurrence_type: e.target.value as Revenue['recurrence_type'] }))} className="input-dark flex-1">
                    <option value="monthly">Mensal</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="yearly">Anual</option>
                  </select>
                )}
              </div>
              <Field label="Observações">
                <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-dark w-full resize-none" rows={2} />
              </Field>
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

      {/* Bulk Rename Modal */}
      {bulkModal === 'rename' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Renomear {selectedIds.length} receita{selectedIds.length !== 1 ? 's' : ''}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Nova descrição">
                <input
                  value={bulkDescription}
                  onChange={e => setBulkDescription(e.target.value)}
                  className="input-dark w-full"
                  placeholder="Digite a nova descrição..."
                  autoFocus
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={() => { if (bulkDescription.trim()) saveBulk({ description: bulkDescription.trim() }); }}
                disabled={bulkSaving || !bulkDescription.trim()}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {bulkSaving ? 'Salvando...' : 'Aplicar a todos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Categorize Modal */}
      {bulkModal === 'categorize' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Categorizar {selectedIds.length} receita{selectedIds.length !== 1 ? 's' : ''}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Categoria">
                <select
                  value={bulkCategoryId}
                  onChange={e => setBulkCategoryId(e.target.value ? Number(e.target.value) : '')}
                  className="input-dark w-full"
                  autoFocus
                >
                  <option value="">Sem categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={() => saveBulk({ category_id: bulkCategoryId !== '' ? Number(bulkCategoryId) : undefined })}
                disabled={bulkSaving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {bulkSaving ? 'Salvando...' : 'Aplicar a todos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Client Modal */}
      {bulkModal === 'client' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white text-sm">Cliente — {selectedIds.length} receita{selectedIds.length !== 1 ? 's' : ''}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
            </div>
            <div className="px-3 pt-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={bulkClientSearch}
                  onChange={e => setBulkClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="input-dark w-full text-sm pl-8 py-1.5"
                />
              </div>
            </div>
            <ul className="overflow-y-auto flex-1 px-2 py-2 space-y-0.5">
              <li>
                <button
                  type="button"
                  onClick={() => { setBulkClientId(null); setBulkClientName(''); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${bulkClientId === null && bulkClientName === '' ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:bg-white/5'}`}
                >
                  — Remover cliente
                </button>
              </li>
              {clients
                .filter(c => c.active && (bulkClientSearch === '' || c.name.toLowerCase().includes(bulkClientSearch.toLowerCase())))
                .map(c => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { setBulkClientId(c.id); setBulkClientName(c.name); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${bulkClientId === c.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-200 hover:bg-white/5'}`}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
            </ul>
            <div className="flex justify-end gap-3 px-4 py-3" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={() => saveBulk({ client_id: bulkClientId, client_name: bulkClientId ? bulkClientName : null })}
                disabled={bulkSaving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Recurring Modal */}
      {bulkModal === 'recurring' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Recorrente — {selectedIds.length} receita{selectedIds.length !== 1 ? 's' : ''}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
                  <input type="radio" checked={bulkIsRecurring} onChange={() => setBulkIsRecurring(true)} className="w-4 h-4" />
                  <div>
                    <span className="text-sm font-medium text-slate-200">Marcar como recorrente</span>
                    <p className="text-xs text-slate-500 mt-0.5">Receita se repete periodicamente</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
                  <input type="radio" checked={!bulkIsRecurring} onChange={() => setBulkIsRecurring(false)} className="w-4 h-4" />
                  <div>
                    <span className="text-sm font-medium text-slate-200">Remover recorrência</span>
                    <p className="text-xs text-slate-500 mt-0.5">Receita pontual, sem repetição</p>
                  </div>
                </label>
              </div>
              {bulkIsRecurring && (
                <div>
                  <label className="label-dark mb-1 block">Frequência</label>
                  <select value={bulkRecurrenceType} onChange={e => setBulkRecurrenceType(e.target.value as typeof bulkRecurrenceType)} className="input-dark w-full">
                    <option value="monthly">Mensal</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={() => saveBulk({ is_recurring: bulkIsRecurring ? 1 : 0, recurrence_type: bulkIsRecurring ? bulkRecurrenceType : null })}
                disabled={bulkSaving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          type="revenue"
          categories={categories}
          onImport={async (items) => { await bulkImportRevenues(items); await load(); }}
          onClose={() => setShowImport(false)}
        />
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
