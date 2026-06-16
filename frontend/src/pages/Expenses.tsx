import { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, AlertCircle, X, Search, Download, Upload, BookOpen } from 'lucide-react';
import { getExpenses, getExpenseProjections, createExpense, updateExpense, updateExpenseStatus, deleteExpense, getCategories, bulkUpdateExpenses, bulkDeleteExpenses, getCards, CompanyCard, bulkImportExpenses, getSupplierRules, createSupplierRule, updateSupplierRule, deleteSupplierRule, syncEmployeesAsSuppliers, searchSuppliers, SupplierRule, getClients } from '../api';
import type { Expense, Category, AgencyClient } from '../types';
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
  const [projections, setProjections] = useState<(Expense & { is_projection: true })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<CompanyCard[]>([]);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
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
  const [bulkModal, setBulkModal] = useState<'rename' | 'categorize' | 'supplier' | 'status' | 'tipo' | 'delete' | null>(null);
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('');
  const [bulkSupplier, setBulkSupplier] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string>('pago');
  const [bulkIsFixed, setBulkIsFixed] = useState(false);
  const [bulkIsClientCost, setBulkIsClientCost] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Supplier rules
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState<SupplierRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleSupplier, setNewRuleSupplier] = useState('');
  const [newRuleCategoryId, setNewRuleCategoryId] = useState<number | ''>('');
  const [ruleSaving, setRuleSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [editRuleSupplier, setEditRuleSupplier] = useState('');
  const [editRuleCategoryId, setEditRuleCategoryId] = useState<number | ''>('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [expsResult, catsResult, cdsResult, clsResult, projResult] = await Promise.allSettled([
        getExpenses({ month: viewMode === 'annual' ? undefined : filterMonth, year: filterYear, status: filterStatus || undefined }),
        getCategories('expense'),
        getCards(true),
        getClients(),
        viewMode === 'monthly' ? getExpenseProjections(filterMonth, filterYear) : Promise.resolve([]),
      ]);
      if (expsResult.status === 'fulfilled') setItems(expsResult.value);
      else setError('Erro ao buscar despesas');
      if (catsResult.status === 'fulfilled') setCategories(catsResult.value);
      if (cdsResult.status === 'fulfilled') setCards(cdsResult.value);
      if (clsResult.status === 'fulfilled') setClients(clsResult.value);
      if (projResult.status === 'fulfilled') setProjections(projResult.value as (Expense & { is_projection: true })[]);
      else setProjections([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [viewMode, filterMonth, filterYear, filterStatus]);
  useEffect(() => { setSelected(new Set()); }, [viewMode, filterMonth, filterYear, filterStatus, search]);
  useEffect(() => { if (viewMode === 'annual') setProjections([]); }, [viewMode]);

  // Filtered list (frontend search)
  const filtered = items.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.description || '').toLowerCase().includes(q) || (r.supplier || '').toLowerCase().includes(q) || String(r.amount).includes(q);
  });
  const filteredProjections = projections.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.description || '').toLowerCase().includes(q) || (p.supplier || '').toLowerCase().includes(q) || String(p.amount).includes(q);
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

  const [confirmingProj, setConfirmingProj] = useState<string | null>(null);
  const confirmProjection = async (p: Expense & { is_projection: true }) => {
    setConfirmingProj(String(p.id));
    try {
      const m = String(filterMonth).padStart(2, '0');
      const day = new Date().getDate();
      const dateStr = `${filterYear}-${m}-${String(day).padStart(2, '0')}`;
      await createExpense({
        description: p.description,
        category_id: p.category_id,
        supplier: p.supplier,
        client_name: p.client_name,
        amount: p.amount,
        date: dateStr,
        status: 'pendente',
        is_fixed: 1,
        is_client_cost: p.is_client_cost,
        notes: p.notes,
        card_id: p.card_id,
      });
      load();
    } catch { alert('Erro ao confirmar despesa'); }
    finally { setConfirmingProj(null); }
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

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    setBulkSaving(true);
    try {
      await bulkDeleteExpenses(ids);
      setBulkModal(null);
      clearSelection();
      load();
    } catch {
      alert('Erro ao deletar despesas');
    } finally {
      setBulkSaving(false);
    }
  };

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const data = await getSupplierRules('expense');
      setRules(data);
    } catch { /* ignore */ }
    finally { setRulesLoading(false); }
  };

  const handleAddRule = async () => {
    if (!newRuleKeyword.trim() || (!newRuleSupplier.trim() && newRuleCategoryId === '')) return;
    setRuleSaving(true);
    try {
      await createSupplierRule({
        keyword: newRuleKeyword.trim(),
        trans_type: 'expense',
        category_id: newRuleCategoryId !== '' ? newRuleCategoryId : null,
        supplier: newRuleSupplier.trim() || null,
      });
      setNewRuleKeyword(''); setNewRuleSupplier(''); setNewRuleCategoryId('');
      loadRules();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao criar regra');
    } finally { setRuleSaving(false); }
  };

  const handleSaveRuleEdit = async (id: number) => {
    setRuleSaving(true);
    try {
      await updateSupplierRule(id, {
        category_id: editRuleCategoryId !== '' ? editRuleCategoryId : null,
        supplier: editRuleSupplier.trim() || null,
      });
      setEditingRule(null);
      loadRules();
    } catch { alert('Erro ao salvar'); }
    finally { setRuleSaving(false); }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Remover esta regra?')) return;
    try {
      await deleteSupplierRule(id);
      loadRules();
    } catch { alert('Erro ao remover regra'); }
  };

  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([]);
  const supplierSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSupplierInputChange = (val: string) => {
    setBulkSupplier(val);
    if (supplierSearchTimeout.current) clearTimeout(supplierSearchTimeout.current);
    if (val.length < 1) { setSupplierSuggestions([]); return; }
    supplierSearchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchSuppliers(val);
        setSupplierSuggestions(results);
      } catch { setSupplierSuggestions([]); }
    }, 200);
  };

  const [formSupplierSuggestions, setFormSupplierSuggestions] = useState<string[]>([]);
  const formSupplierTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFormSupplierChange = (val: string) => {
    setForm(f => ({ ...f, supplier: val }));
    if (formSupplierTimeout.current) clearTimeout(formSupplierTimeout.current);
    if (val.length < 1) { setFormSupplierSuggestions([]); return; }
    formSupplierTimeout.current = setTimeout(async () => {
      try {
        const results = await searchSuppliers(val);
        setFormSupplierSuggestions(results);
      } catch { setFormSupplierSuggestions([]); }
    }, 200);
  };

  const [syncing, setSyncing] = useState(false);
  const handleSyncEmployees = async () => {
    setSyncing(true);
    try {
      const result = await syncEmployeesAsSuppliers();
      loadRules();
      alert(`✅ ${result.employees} funcionários sincronizados como fornecedores!`);
    } catch { alert('Erro ao sincronizar'); }
    finally { setSyncing(false); }
  };

  const handleBulkSave = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const updates: Record<string, string | number | boolean> = {};
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
    } else if (bulkModal === 'tipo') {
      updates.is_fixed = bulkIsFixed;
      updates.is_client_cost = bulkIsClientCost;
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
          <button onClick={() => { setShowRules(true); loadRules(); }} className="btn-ghost flex items-center gap-1.5 text-sm" title="Regras de fornecedores">
            <BookOpen size={15} /> Regras
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por descrição, fornecedor ou valor..." className="input-dark text-sm py-1.5 pl-8 w-full" />
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
            <button onClick={() => { setBulkIsFixed(false); setBulkIsClientCost(false); setBulkModal('tipo'); }} className="btn-ghost text-xs px-3 py-1">Tipo</button>
            <button onClick={() => setBulkModal('delete')} className="text-xs px-3 py-1 rounded-md transition-colors" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
              <span className="flex items-center gap-1"><Trash2 size={12} /> Excluir</span>
            </button>
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
        ) : filtered.length === 0 && filteredProjections.length === 0 ? (
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
              {filteredProjections.map(p => (
                <tr key={p.id} className="tr border-l-2 border-amber-500/60 opacity-70">
                  <td className="td px-4 py-3 w-8"></td>
                  <td className="td px-4 py-3 text-amber-400/80">{String(filterMonth).padStart(2,'0')}/{filterYear}</td>
                  <td className="td px-4 py-3 font-medium text-slate-300">{p.description}</td>
                  <td className="td px-4 py-3">
                    {p.category_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (p.category_color || '#6366f1') + '22', color: p.category_color || '#6366f1' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.category_color || '#6366f1' }} />
                        {p.category_name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td px-4 py-3 text-slate-400">{p.supplier || '—'}</td>
                  <td className="td px-4 py-3 text-right font-semibold text-slate-300">{brl(p.amount)}</td>
                  <td className="td px-4 py-3 text-center">
                    <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>PROVISÃO</span>
                  </td>
                  <td className="td px-4 py-3 text-center">
                    <span className="badge badge-blue">Fixo</span>
                  </td>
                  <td className="td px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => confirmProjection(p)}
                        disabled={confirmingProj === String(p.id)}
                        className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-40"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                      >
                        {confirmingProj === String(p.id) ? '...' : 'Confirmar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.map(r => (
                <tr key={r.id} className={`tr transition-colors ${selected.has(r.id) ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''}`}>
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

      {/* Client picker modal */}
      {showClientPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="modal-card w-full max-w-sm max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white text-sm">Selecionar cliente</h2>
              <button onClick={() => setShowClientPicker(false)} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
            </div>
            <div className="px-3 pt-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="input-dark w-full text-sm pl-8 py-1.5"
                />
              </div>
            </div>
            <ul className="overflow-y-auto flex-1 px-2 py-2 space-y-0.5">
              {clients
                .filter(c => c.active && (clientSearch === '' || c.name.toLowerCase().includes(clientSearch.toLowerCase())))
                .map(c => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, client_name: c.name, is_client_cost: 1 })); setShowClientPicker(false); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5 transition-colors"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              {clients.filter(c => c.active && (clientSearch === '' || c.name.toLowerCase().includes(clientSearch.toLowerCase()))).length === 0 && (
                <li className="text-center text-slate-500 text-sm py-6">Nenhum cliente encontrado</li>
              )}
            </ul>
          </div>
        </div>
      )}

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
                  <div className="relative">
                    <input
                      value={form.supplier || ''}
                      onChange={e => handleFormSupplierChange(e.target.value)}
                      onBlur={() => setTimeout(() => setFormSupplierSuggestions([]), 150)}
                      className="input-dark w-full"
                      autoComplete="off"
                    />
                    {formSupplierSuggestions.length > 0 && (
                      <ul className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                        {formSupplierSuggestions.map(s => (
                          <li
                            key={s}
                            onMouseDown={() => { setForm(f => ({ ...f, supplier: s })); setFormSupplierSuggestions([]); }}
                            className="px-3 py-2 cursor-pointer hover:bg-white/5 text-slate-200"
                          >{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setClientSearch(''); setShowClientPicker(true); }}
                    className="input-dark w-full text-left flex items-center justify-between"
                  >
                    <span className={form.client_name ? 'text-slate-200' : 'text-slate-500'}>
                      {form.client_name || 'Selecionar cliente...'}
                    </span>
                    {form.client_name && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, client_name: '' })); }}
                        className="ml-2 text-slate-500 hover:text-slate-300"
                      >×</span>
                    )}
                  </button>
                </div>
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
              <button onClick={() => { setBulkModal(null); setSupplierSuggestions([]); }} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label="Fornecedor">
                <div style={{ position: 'relative' }}>
                  <input
                    value={bulkSupplier}
                    onChange={e => handleSupplierInputChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && supplierSuggestions.length === 0 && handleBulkSave()}
                    placeholder="Digite para buscar ou adicionar..."
                    className="input-dark w-full"
                    autoFocus
                  />
                  {supplierSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                      borderRadius: '8px', marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    }}>
                      {supplierSuggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => { setBulkSupplier(s); setSupplierSuggestions([]); }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '8px 14px', fontSize: '0.875rem',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-primary)', borderBottom: '1px solid var(--border-card)',
                          }}
                          className="hover:bg-white/5 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <p className="text-xs text-slate-500 mt-2">Deixe em branco para remover o fornecedor das selecionadas.</p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => { setBulkModal(null); setSupplierSuggestions([]); }} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleBulkSave} disabled={bulkSaving} className="btn-primary text-sm disabled:opacity-50">
                {bulkSaving ? 'Salvando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk tipo modal */}
      {bulkModal === 'tipo' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white">Tipo — {selected.size} {selected.size === 1 ? 'despesa' : 'despesas'}</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
                <input type="checkbox" checked={bulkIsFixed} onChange={e => setBulkIsFixed(e.target.checked)} className="w-4 h-4" />
                <div>
                  <span className="text-sm font-medium text-slate-200">Custo fixo</span>
                  <p className="text-xs text-slate-500 mt-0.5">Despesa recorrente mensal (aluguel, salários, assinaturas...)</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
                <input type="checkbox" checked={bulkIsClientCost} onChange={e => setBulkIsClientCost(e.target.checked)} className="w-4 h-4" />
                <div>
                  <span className="text-sm font-medium text-slate-200">Custo de cliente</span>
                  <p className="text-xs text-slate-500 mt-0.5">Despesa vinculada a um cliente específico</p>
                </div>
              </label>
              <p className="text-xs text-slate-600 pt-1">Desmarcados = remove a classificação das selecionadas.</p>
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

      {/* Bulk delete confirmation */}
      {bulkModal === 'delete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h2 className="font-semibold text-white flex items-center gap-2"><Trash2 size={16} className="text-red-400" /> Confirmar exclusão</h2>
              <button onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-300">
                Tem certeza que deseja excluir <strong className="text-white">{selected.size} {selected.size === 1 ? 'despesa' : 'despesas'}</strong>?
              </p>
              <p className="text-xs text-slate-500 mt-2">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setBulkModal(null)} className="btn-ghost text-sm">Cancelar</button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkSaving}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                {bulkSaving ? 'Excluindo...' : `Excluir ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier rules modal */}
      {showRules && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full" style={{ maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <div>
                <h2 className="font-semibold text-white">Regras de Fornecedores</h2>
                <p className="text-xs text-slate-500 mt-0.5">Palavras-chave que mapeiam automaticamente fornecedor e categoria durante a importação.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSyncEmployees}
                  disabled={syncing}
                  className="btn-ghost text-xs flex items-center gap-1.5 whitespace-nowrap"
                  title="Cria regras automáticas para todos os funcionários ativos"
                >
                  {syncing ? '...' : '👥 Sincronizar funcionários'}
                </button>
                <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Add new rule */}
              <div className="p-4 rounded-xl" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Nova regra</p>
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <label className="label-dark mb-1 block text-xs">Palavra-chave</label>
                    <input
                      value={newRuleKeyword}
                      onChange={e => setNewRuleKeyword(e.target.value)}
                      placeholder="ex: cleci, google ads, nubank..."
                      className="input-dark w-full text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="label-dark mb-1 block text-xs">Fornecedor</label>
                    <input
                      value={newRuleSupplier}
                      onChange={e => setNewRuleSupplier(e.target.value)}
                      placeholder="Nome do fornecedor"
                      className="input-dark w-full text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="label-dark mb-1 block text-xs">Categoria (opcional)</label>
                    <select value={newRuleCategoryId} onChange={e => setNewRuleCategoryId(e.target.value ? Number(e.target.value) : '')} className="input-dark w-full text-sm">
                      <option value="">— sem categoria —</option>
                      {categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={handleAddRule}
                    disabled={ruleSaving || !newRuleKeyword.trim() || (!newRuleSupplier.trim() && newRuleCategoryId === '')}
                    className="btn-primary text-sm disabled:opacity-40 whitespace-nowrap"
                    style={{ height: 38 }}
                  >
                    {ruleSaving ? '...' : '+ Adicionar'}
                  </button>
                </div>
              </div>

              {/* Rules table */}
              {rulesLoading ? (
                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>
              ) : rules.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
                  Nenhuma regra cadastrada. Adicione uma acima ou importe lançamentos — o sistema aprende automaticamente.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-card)', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-card)' }}>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Palavra-chave</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fornecedor</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Usos</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map(rule => (
                        <tr key={rule.id} style={{ borderTop: '1px solid var(--border-card)' }}>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{rule.keyword}</td>
                          <td className="px-4 py-2.5">
                            {editingRule === rule.id ? (
                              <input value={editRuleSupplier} onChange={e => setEditRuleSupplier(e.target.value)} className="input-dark text-xs py-1 w-full" />
                            ) : (
                              <span className="text-slate-200">{rule.supplier || <span className="text-slate-600">—</span>}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {editingRule === rule.id ? (
                              <select value={editRuleCategoryId} onChange={e => setEditRuleCategoryId(e.target.value ? Number(e.target.value) : '')} className="input-dark text-xs py-1 w-full">
                                <option value="">—</option>
                                {categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            ) : rule.category_name ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (rule.category_color || '#6366f1') + '22', color: rule.category_color || '#6366f1' }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: rule.category_color || '#6366f1' }} />
                                {rule.category_name}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs text-slate-500">{rule.usage_count}</td>
                          <td className="px-4 py-2.5">
                            {editingRule === rule.id ? (
                              <div className="flex items-center gap-1.5 justify-end">
                                <button onClick={() => handleSaveRuleEdit(rule.id)} disabled={ruleSaving} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40">Salvar</button>
                                <button onClick={() => setEditingRule(null)} className="text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-200">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => { setEditingRule(rule.id); setEditRuleSupplier(rule.supplier || ''); setEditRuleCategoryId(rule.category_id ?? ''); }} className="p-1.5 text-slate-500 hover:text-blue-400 rounded"><Pencil size={13} /></button>
                                <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={13} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <p className="text-xs text-slate-600">💡 O sistema também aprende automaticamente quando você confirma importações ou edita lançamentos.</p>
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
