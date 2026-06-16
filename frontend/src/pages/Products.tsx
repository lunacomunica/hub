import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Package, Tag } from 'lucide-react';
import { getCategories } from '../api';
import type { Category } from '../types';

const BASE = '/api/products';
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

interface Product {
  id: number;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  active: number;
}

const empty = { name: '', price: 0, category: '', description: '', active: true };

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(empty);
  const [filterCat, setFilterCat] = useState('');

  const load = async () => {
    setLoading(true);
    const [data, cats] = await Promise.all([
      authFetch(BASE).then(r => r.json()),
      getCategories('revenue').catch(() => []),
    ]);
    setProducts(Array.isArray(data) ? data : []);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setShowModal(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, price: p.price, category: p.category || '', description: p.description || '', active: !!p.active });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Nome é obrigatório');
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${BASE}/${editing.id}` : BASE;
    await authFetch(url, { method, body: JSON.stringify(form) });
    setShowModal(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('Excluir produto? Isso pode afetar metas vinculadas.')) return;
    await authFetch(`${BASE}/${id}`, { method: 'DELETE' });
    load();
  };

  const active = products.filter(p => p.active && (!filterCat || p.category === filterCat));
  const inactive = products.filter(p => !p.active && (!filterCat || p.category === filterCat));

  // Category breakdown (active only)
  const catBreakdown = categories
    .map(c => ({
      ...c,
      count: products.filter(p => p.active && p.category === c.name).length,
      mrr: products.filter(p => p.active && p.category === c.name).reduce((s, p) => s + p.price, 0),
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.mrr - a.mrr);

  const allActiveMrr = products.filter(p => p.active).reduce((s, p) => s + p.price, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Produtos & Serviços</h1>
          <p className="text-sm text-slate-500 mt-0.5">Catálogo de serviços vinculado às metas de vendas</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Novo Produto
        </button>
      </div>

      {/* Filters */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCat('')}
            className="text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={filterCat === '' ? { background: 'var(--primary,#6366f1)', color: '#fff' } : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
          >
            Todas
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setFilterCat(prev => prev === c.name ? '' : c.name)}
              className="text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              style={filterCat === c.name
                ? { background: (c.color || '#6366f1') + '33', color: c.color || '#6366f1', border: `1px solid ${c.color || '#6366f1'}66` }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: c.color || '#6366f1' }} />
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="label-dark mb-1">Produtos ativos</div>
          <div className="metric">{active.length}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Ticket médio</div>
          <div className="metric">
            {active.length > 0 ? fmt(active.reduce((s, p) => s + p.price, 0) / active.length) : '—'}
          </div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Receita potencial/mês</div>
          <div className="metric text-emerald-400">{fmt(active.reduce((s, p) => s + p.price, 0))}</div>
        </div>
      </div>

      {/* Category breakdown */}
      {catBreakdown.length > 0 && !filterCat && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={15} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300">Receita potencial por categoria</h2>
          </div>
          <div className="space-y-3">
            {catBreakdown.map(c => {
              const pct = allActiveMrr > 0 ? (c.mrr / allActiveMrr) * 100 : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color || '#6366f1' }} />
                      <span className="text-slate-300 font-medium">{c.name}</span>
                      <span className="text-slate-500 text-xs">{c.count} produto{c.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-emerald-400">{fmt(c.mrr)}</span>
                      <span className="text-xs text-slate-500 ml-2">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c.color || '#6366f1' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-500">Carregando...</div>
      ) : products.length === 0 ? (
        <div className="card p-12 text-center">
          <Package size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-500 mb-4">Nenhum produto cadastrado ainda</p>
          <button onClick={openNew} className="btn-primary text-sm">Cadastrar primeiro produto</button>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="px-5 py-3 text-sm font-semibold text-slate-300" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              Ativos ({active.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left px-4 py-3">Nome</th>
                  <th className="th text-left px-4 py-3">Categoria</th>
                  <th className="th text-left px-4 py-3">Descrição</th>
                  <th className="th text-right px-4 py-3">Preço</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {active.map(p => (
                  <tr key={p.id} className="tr">
                    <td className="td px-4 py-3 font-medium text-slate-200">{p.name}</td>
                    <td className="td px-4 py-3">
                      {p.category ? (() => {
                        const cat = categories.find(c => c.name === p.category);
                        return cat ? (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: (cat.color || '#6366f1') + '22', color: cat.color || '#6366f1' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color || '#6366f1' }} />
                            {p.category}
                          </span>
                        ) : <span className="text-slate-400 text-xs">{p.category}</span>;
                      })() : '—'}
                    </td>
                    <td className="td px-4 py-3 max-w-[260px] truncate">{p.description || '—'}</td>
                    <td className="td px-4 py-3 text-right font-semibold text-emerald-400">{fmt(p.price)}</td>
                    <td className="td px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(p)} className="text-slate-500 hover:text-blue-400"><Pencil size={14} /></button>
                        <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inactive.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 text-sm font-semibold text-slate-500" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                Inativos ({inactive.length})
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {inactive.map(p => (
                    <tr key={p.id} className="tr opacity-50">
                      <td className="td px-4 py-3">{p.name}</td>
                      <td className="td px-4 py-3">{p.category || '—'}</td>
                      <td className="td px-4 py-3 text-right">{fmt(p.price)}</td>
                      <td className="td px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(p)} className="text-slate-500 hover:text-blue-400"><Pencil size={14} /></button>
                          <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-md">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h3 className="font-semibold text-white">{editing ? 'Editar Produto' : 'Novo Produto'}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Nome do serviço *">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Plano Start, Gestão Eleva..." className="input-dark w-full" />
              </Field>
              <Field label="Preço mensal (R$)">
                <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
              </Field>
              <Field label="Categoria">
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="input-dark w-full"
                >
                  <option value="">Sem categoria</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição">
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="input-dark w-full resize-none" placeholder="O que está incluso neste serviço..." />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={!!form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                Produto ativo
              </label>
            </div>
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => setShowModal(false)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={save} className="btn-primary text-sm">Salvar</button>
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
