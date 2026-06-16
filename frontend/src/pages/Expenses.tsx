import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, AlertCircle, X, Search, Download, Upload } from 'lucide-react';
import { getExpenses, createExpense, updateExpense, updateExpenseStatus, deleteExpense, getCategories, bulkUpdateExpenses, getCards, CompanyCard, bulkImportExpenses } from '../api';
import type { Expense, Category } from '../types';
import ImportModal from '../components/ImportModal';
import CategorySelect from '../components/CategorySelect';

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

const now = new Date();
const EMPTY: Partial<Expense> = {
  description: '', category_id: undefined, supplier: '', client_name: '', amount: 0,
  date: now.toISOString().slice(0, 10), due_date: '', status: 'pendente',
  is_fixed: 0, is_client_cost: 0, notes: '',
};

export default function Expenses() {
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Partial<Expense>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState<'rename' | 'categorize' | 'supplier' | 'status' | null>(null);
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('');
  const [bulkSupplier, setBulkSupplier] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string>('pago');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [expsResult, catsResult, cdsResult] = await Promise.allSettled([
        getExpenses({ month: viewMode === 'annual' ? undefined : filterMonth, year: filterYear, status: filterStatus || undefined }),
        getCategories('expense'),
        getCards(true),
      ]);
      if (expsResult.status === 'fulfilled') setItems(expsResult.value);
      else setError('Erro ao buscar despesas');
      if (catsResult.status === 'fulfilled') setCategories(catsResult.value);
      if (cdsResult.status === 'fulfilled') setCards(cdsResult.value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [viewMode, filterMonth, filterYear, filterStatus]);

  // Filtered list (frontend search)
  const filtered = items.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.description || '').toLowerCase().includes(q) || (r.supplier || '').toLowerCase().includes(q);
  });

  const openCreate = () => { setForm({ ...EMPTY }); setModal(true); };
  const openEdit = (r: Expense) => { setForm({ ...r }); setModal(true); };
  const closeModal = () => { setModal(false); setForm(EMPTY); };

  const save = async () => {
    if (!form.description || !form.amount || !form.date) return;
    setSaving(true);
    try {
      if (form.id) await updateExpense(form.id, form);
      else await createExpense(form);
      closeModal(); load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleStatusClick = async (r: Expense) => {
    const cycle: Expense['status'][] = ['pendente', 'pago', 'atrasado', 'cancelado'];
    const next = cycle[(cycle.indexOf(r.status) + 1) % cycle.length];
    try { await updateExpenseStatus(r.id, next); load(); }
    catch { alert('Erro ao atualizar status'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deletar esta despesa?')) return;
    setDeleting(id);
    try { await deleteExpense(id); load(); }
    catch { alert('Erro ao deletar'); }
    finally { setDeleting(null); }
  };

  // Selection helpers
  const allVisibleIds = filtered.map(r => r.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allVisibleIds));
    }
  };
  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const handleBulkSave = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const updates: Record<string, string | number> = {};
    if (bulkModal === 'rename') {
      if (!bulkDescription.trim()) return;
      updates.description = bulkDescription.trim();
    } else if (bulkModal === 'categorize') {
      if (bulkCategoryId === '') return;
      updates.category_id = bulkCategoryId as number;
    } else if (bulkModal === 'supplier') {
      updates.supplier = bulkSupplier.trim();
    } else if (bulkModal === 'status') {
      if (!bulkStatus) return;
      updates.status = bulkStatus;
    }
    setBulkSaving(true);
    try {
      await bulkUpdateExpenses(ids, updates);
      setBulkModal(null);
      setBulkDescription('');
      setBulkCategoryId('');
      setBulkSupplier('');
      setBulkStatus('pago');
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
    const cols = ['Data', 'Descrição', 'Categoria', 'Fornecedor', 'Valor', 'Status', 'Tipo'];
    const rows = filtered.map(r => [
      fmtDate(r.date),
      r.description,
      r.category_name || '',
      r.supplier || '',
      Number(r.amount).toFixed(2).replace('.', ','),
      STATUS_LABELS[r.status] || r.status,
      [r.is_fixed ? 'Fixo' : '', r.is_client_cost ? 'Cliente' : ''].filter(Boolean).join('+') || '—',
    ]);
    const csvContent = [cols, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const mm = String(filterMonth).padStart(2, '0');
    a.href = url;
    a.download = `despesas-${mm}-${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const paid = items.filter(r => r.status === 'pago').reduce((s, r) => s + Number(r.amount), 0);
  const pending = items.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.amount), 0);
  const fixed = items.filter(r => r.is_fixed).reduce((s, r) => s + Number(r.amount), 0);

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Despesas</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 text-sm">
            <Download size={15} /> CSV
          </button>
          <button onClick={() => setShowImport(true)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Upload size={15} /> Importar
          </button>
          <button onClick={openCreate} className="btn-danger flex items-center gap-2 text-sm">
            <Plus size={16} /> Nova Despesa
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
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por descrição ou fornecedor..." className="input-dark text-sm py-1.5 pl-8 w-full" />
        </div>
        <button onClick={load} className="p-1.5 text-slate-400 hover:text-blue-400"><RefreshCw size={15} /></button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="label-dark mb-1">Pago</div>
          <div className="metric-md text-red-400">{brl(paid)}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">A pagar</div>
          <div className="metric-md text-amber-400">{brl(pending)}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Custos fixos</div>
          <div className="metric-md text-slate-300">{brl(fixed)}</div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)' }}>
          <span className="text-slate-300 font-medium">{selected.size} {selected.size === 1 ? 'despesa selecionada' : 'despesas selecionadas'}</span>
          <div className="flex items-center gap-2 ml-2">
            <button onClick={() => { setBulkDescription(''); setBulkModal('rename'); }} className="btn-ghost text-xs px-3 py-1">Renomear</button>
            <button onClick={() => { setBulkCategoryId(''); setBulkModal('categorize'); }} className="btn-ghost text-xs px-3 py-1">Categorizar</button>
            <button onClick={() => { setBulkSupplier(''); setBulkModal('supplier'); }} className="btn-ghost text-xs px-3 py-1">Fornecedor</button>
            <button onClick={() => { setBulkStatus('pago'); setBulkModal('status'); }} className="btn-ghost text-xs px-3 py-1">Status</button>
          </div>
          <button onClick={clearSelection} className="ml-auto text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>
        ) : error ? (
          <div className="flex flex-col items-center py-12 gap-3 text-red-400">
            <AlertCircle size={32} /><p className="text-sm">{error}</p>
            <button onClick={load} className="text-xs text-blue-400 underline">Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {items.length === 0
              ? <><span>Nenhuma despesa encontrada. </span><button onClick={openCreate} className="text-blue-400 underline">Adicionar primeira despesa</button></>
              : 'Nenhum resultado para a busca.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                <th className="th px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    title="Selecionar todos"
                    className="cursor-pointer"
                  />
                </th>
                <th className="th text-left px-4 py-3">Data</th>
                <th className="th text-left px-4 py-3">Descrição</th>
                <th className="th text-left px-4 py-3">Categoria</th>
                <th className="th text-left px-4 py-3">Fornecedor</th>
                <th className="th text-right px-4 py-3">Valor</th>
                <th className="th text-center px-4 py-3">Status</th>
                <th className="th text-center px-4 py-3">Tipo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="tr">
                  <td className="td px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="td px-4 py-3">{fmtDate(r.date)}</td>
                  <td className="td px-4 py-3 font-medium text-slate-200">{r.description}</td>
                  <td className="td px-4 py-3">
                    {r.category_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (r.category_color || '#6366f1') + '22', color: r.category_color || '#6366f1' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.category_color || '#6366f1' }} />
                        {r.category_name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td px-4 py-3">{r.supplier || '—'}</td>
                  <td className="td px-4 py-3 text-right font-semibold text-slate-200">{brl(r.amount)}</td>
                  <td className="td px-4 py-3 text-center">
                    <button onClick={() => handleStatusClick(r)} className={`cursor-pointer hover:opacity-80 ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </button>
                  </td>
                  <td className="td px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {!!r.is_fixed && <span className="badge badge-blue">Fixo</span>}
                      {!!r.is_client_cost && <span className="badge badge-purple">Cliente</span>}
                      {!r.is_fixed && !r.is_client_cost && <span className="text-slate-600">—</span>}
                    </div>
                  </td>
                  <td className="td px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CRUD Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">{form.id ? 'Editar Despesa' : 'Nova Despesa'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Descrição *">
                <input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-dark w-full" placeholder="Ex: Salário designer" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria">
                  <CategorySelect
                    value={form.category_id}
                    onChange={id => setForm(f => ({ ...f, category_id: id }))}
                    categories={categories}
                    onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
                    type="expense"
                  />
                </Field>
                <Field label="Fornecedor">
                  <input value={form.supplier || ''} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="input-dark w-full" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor (R$) *">
                  <input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
                </Field>
                <Field label="Status">
                  <select value={form.status || 'pendente'} onChange={e => setForm(f => ({ ...f, status: e.target.value as Expense['status'] }))} className="input-dark w-full">
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
              <Field label="Cliente (se custo de cliente)">
                <input value={form.client_name || ''} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="input-dark w-full" />
              </Field>
              {cards.length > 0 && (
                <Field label="Cartão utilizado">
                  <select value={form.card_id || ''} onChange={e => setForm(f => ({ ...f, card_id: e.target.value ? Number(e.target.value) : null }))} className="input-dark w-full">
                    <option value="">Sem cartão / débito / pix</option>
                    {cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` •••• ${c.last4}` : ''}</option>)}
                  </select>
                </Field>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_fixed} onChange={e => setForm(f => ({ ...f, is_fixed: e.target.checked ? 1 : 0 }))} />
                  <span className="text-sm text-slate-300">Custo fixo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_client_cost} onChange={e => setForm(f => ({ ...f, is_client_cost: e.target.checked ? 1 : 0 }))} />
                  <span className="text-sm text-slate-300">Custo de cliente</span>
                </label>
              </div>
              <Field label="Observações">
                <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-dark w-full resize-none" rows={2} />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={closeModal} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn-danger text-sm disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk rename modal */}
      {bulkModal === 'rename' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Renomear {selected.size} {selected.size === 1 ? 'despesa' : 'despesas'}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Nova descrição">
                <input
                  autoFocus
                  value={bulkDescription}
                  onChange={e => setBulkDescription(e.target.value)}
                  className="input-dark w-full"
                  placeholder="Ex: Salário equipe"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleBulkSave} disabled={bulkSaving || !bulkDescription.trim()} className="btn-primary text-sm disabled:opacity-50">
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk categorize modal */}
      {bulkModal === 'categorize' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Categorizar {selected.size} {selected.size === 1 ? 'despesa' : 'despesas'}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Categoria">
                <CategorySelect
                  value={bulkCategoryId || undefined}
                  onChange={id => setBulkCategoryId(id ?? '')}
                  categories={categories}
                  onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
                  type="expense"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleBulkSave} disabled={bulkSaving || bulkCategoryId === ''} className="btn-primary text-sm disabled:opacity-50">
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk status modal */}
      {bulkModal === 'status' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Status — {selected.size} {selected.size === 1 ? 'despesa' : 'despesas'}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Novo status">
                <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="input-dark w-full">
                  <option value="pago">✅ Pago</option>
                  <option value="pendente">🕐 Pendente</option>
                  <option value="atrasado">⚠️ Atrasado</option>
                  <option value="cancelado">✖ Cancelado</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleBulkSave} disabled={bulkSaving} className="btn-primary text-sm disabled:opacity-50">
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk supplier modal */}
      {bulkModal === 'supplier' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Fornecedor — {selected.size} {selected.size === 1 ? 'despesa' : 'despesas'}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Fornecedor">
                <input
                  value={bulkSupplier}
                  onChange={e => setBulkSupplier(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBulkSave()}
                  placeholder="Nome do fornecedor..."
                  className="input-dark w-full"
                  autoFocus
                />
              </Field>
              <p className="text-xs text-slate-500 mt-2">Deixe em branco para remover o fornecedor das selecionadas.</p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleBulkSave} disabled={bulkSaving} className="btn-primary text-sm disabled:opacity-50">
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          type="expense"
          categories={categories}
          onImport={async (items) => { await bulkImportExpenses(items); await load(); }}
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
