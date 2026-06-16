import { useEffect, useState } from 'react';
import { Plus, Pencil, CreditCard, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getCards, createCard, updateCard, deleteCard, getCardExpenses, CompanyCard } from '../api';

const fmt = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? d.split('-').reverse().join('/') : '—';

const BRANDS: { value: string; label: string; color: string }[] = [
  { value: 'visa',       label: 'Visa',       color: '#1a1f71' },
  { value: 'mastercard', label: 'Mastercard', color: '#eb001b' },
  { value: 'elo',        label: 'Elo',        color: '#00a4e0' },
  { value: 'amex',       label: 'Amex',       color: '#007bc1' },
  { value: 'hipercard',  label: 'Hipercard',  color: '#b22222' },
  { value: 'outro',      label: 'Outro',      color: '#6366f1' },
];

const emptyForm = {
  name: '', last4: '', brand: 'outro', credit_limit: 0,
  closing_day: '', due_day: '', notes: '', active: true,
};

interface Expense {
  id: number; description: string; amount: number; date: string;
  status: string; category_name: string | null; supplier: string | null;
}

export default function Cards() {
  const [cards, setCards] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CompanyCard | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<Record<number, Expense[]>>({});
  const [expMonth, setExpMonth] = useState(new Date().getMonth() + 1);
  const [expYear, setExpYear] = useState(new Date().getFullYear());

  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const YEARS = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  const load = async () => {
    setLoading(true);
    const data = await getCards();
    setCards(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadExpenses = async (cardId: number) => {
    const data = await getCardExpenses(cardId, expMonth, expYear);
    setExpenses(prev => ({ ...prev, [cardId]: data as Expense[] }));
  };

  const toggleExpand = (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadExpenses(id);
  };

  useEffect(() => {
    if (expanded) loadExpenses(expanded);
  }, [expMonth, expYear]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c: CompanyCard) => {
    setEditing(c);
    setForm({
      name: c.name, last4: c.last4 || '', brand: c.brand,
      credit_limit: c.credit_limit,
      closing_day: c.closing_day ? String(c.closing_day) : '',
      due_day: c.due_day ? String(c.due_day) : '',
      notes: c.notes || '', active: !!c.active,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Nome é obrigatório');
    const payload = {
      name: form.name,
      last4: form.last4 || null,
      brand: form.brand,
      credit_limit: Number(form.credit_limit) || 0,
      closing_day: form.closing_day ? Number(form.closing_day) : null,
      due_day: form.due_day ? Number(form.due_day) : null,
      notes: form.notes || null,
      active: form.active ? 1 : 0,
    };
    if (editing) await updateCard(editing.id, payload);
    else await createCard(payload);
    setShowModal(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('Desativar este cartão?')) return;
    await deleteCard(id);
    load();
  };

  const activeCards = cards.filter(c => c.active);
  const inactiveCards = cards.filter(c => !c.active);
  const totalLimit = activeCards.reduce((s, c) => s + (c.credit_limit || 0), 0);
  const totalUsed = activeCards.reduce((s, c) => s + (c.used_this_month || 0), 0);

  const getBrandInfo = (brand: string) => BRANDS.find(b => b.value === brand) || BRANDS[BRANDS.length - 1];
  const getUsagePercent = (c: CompanyCard) =>
    c.credit_limit > 0 ? Math.min(((c.used_this_month || 0) / c.credit_limit) * 100, 100) : 0;
  const getUsageColor = (pct: number) =>
    pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : '#10b981';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cartões da Empresa</h1>
          <p className="text-sm text-slate-500 mt-0.5">Controle de cartões corporativos e faturas</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Novo Cartão
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="label-dark mb-1">Cartões ativos</div>
          <div className="metric">{activeCards.length}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Limite total</div>
          <div className="metric">{totalLimit > 0 ? fmt(totalLimit) : '—'}</div>
        </div>
        <div className="card p-4">
          <div className="label-dark mb-1">Gasto este mês</div>
          <div className="metric text-rose-400">{fmt(totalUsed)}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Carregando...</div>
      ) : cards.length === 0 ? (
        <div className="card p-12 text-center">
          <CreditCard size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-500 mb-4">Nenhum cartão cadastrado ainda</p>
          <button onClick={openNew} className="btn-primary text-sm">Cadastrar primeiro cartão</button>
        </div>
      ) : (
        <div className="space-y-3">
          {activeCards.map(card => {
            const brand = getBrandInfo(card.brand);
            const usedPct = getUsagePercent(card);
            const usageColor = getUsageColor(usedPct);
            const isOpen = expanded === card.id;

            return (
              <div key={card.id} className="card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Card visual */}
                    <div className="flex items-center gap-4 flex-1">
                      <div
                        className="w-12 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: brand.color + '33', border: `1px solid ${brand.color}55` }}
                      >
                        <CreditCard size={18} style={{ color: brand.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{card.name}</span>
                          {card.last4 && (
                            <span className="text-xs text-slate-500 font-mono">•••• {card.last4}</span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: brand.color + '22', color: brand.color }}>
                            {brand.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          {card.closing_day && <span>Fechamento: dia {card.closing_day}</span>}
                          {card.due_day && <span>Vencimento: dia {card.due_day}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Valores */}
                    <div className="text-right shrink-0">
                      <div className="text-rose-400 font-semibold">{fmt(card.used_this_month || 0)}</div>
                      <div className="text-xs text-slate-500">
                        {card.credit_limit > 0 ? `de ${fmt(card.credit_limit)}` : 'sem limite definido'}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(card)} className="p-1.5 text-slate-500 hover:text-blue-400"><Pencil size={14} /></button>
                      <button onClick={() => remove(card.id)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                      <button onClick={() => toggleExpand(card.id)} className="p-1.5 text-slate-500 hover:text-slate-300">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Barra de uso */}
                  {card.credit_limit > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>{usedPct.toFixed(0)}% utilizado</span>
                        <span>Disponível: {fmt(Math.max(card.credit_limit - (card.used_this_month || 0), 0))}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-700">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${usedPct}%`, backgroundColor: usageColor }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Despesas expandidas */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                    <div className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-300">Despesas do cartão</span>
                      <div className="flex items-center gap-2">
                        <select value={expMonth} onChange={e => setExpMonth(Number(e.target.value))} className="input-dark text-xs py-1 px-2">
                          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <select value={expYear} onChange={e => setExpYear(Number(e.target.value))} className="input-dark text-xs py-1 px-2">
                          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    {!expenses[card.id] ? (
                      <div className="px-5 pb-4 text-sm text-slate-500">Carregando...</div>
                    ) : expenses[card.id].length === 0 ? (
                      <div className="px-5 pb-4 text-sm text-slate-500">Nenhuma despesa neste período</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                            <th className="th text-left px-5 py-2">Descrição</th>
                            <th className="th text-left px-4 py-2">Categoria</th>
                            <th className="th text-left px-4 py-2">Data</th>
                            <th className="th text-left px-4 py-2">Status</th>
                            <th className="th text-right px-5 py-2">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenses[card.id].map(e => (
                            <tr key={e.id} className="tr">
                              <td className="td px-5 py-2 text-slate-200">{e.description}</td>
                              <td className="td px-4 py-2 text-slate-400">{e.category_name || '—'}</td>
                              <td className="td px-4 py-2 text-slate-400">{fmtDate(e.date)}</td>
                              <td className="td px-4 py-2">
                                <span className={`badge-${e.status === 'pago' ? 'pago' : e.status === 'atrasado' ? 'atrasado' : 'pendente'}`}>
                                  {e.status}
                                </span>
                              </td>
                              <td className="td px-5 py-2 text-right font-semibold text-rose-400">{fmt(e.amount)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                            <td colSpan={4} className="px-5 py-2 text-sm font-semibold text-slate-300">Total</td>
                            <td className="px-5 py-2 text-right font-bold text-rose-400">
                              {fmt(expenses[card.id].reduce((s, e) => s + Number(e.amount), 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {inactiveCards.length > 0 && (
            <div className="card p-4">
              <div className="text-sm text-slate-500 font-semibold mb-2">Inativos ({inactiveCards.length})</div>
              <div className="space-y-1">
                {inactiveCards.map(card => (
                  <div key={card.id} className="flex items-center justify-between opacity-50 text-sm">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-slate-500" />
                      <span>{card.name}</span>
                      {card.last4 && <span className="font-mono text-slate-500">•••• {card.last4}</span>}
                    </div>
                    <button onClick={() => openEdit(card)} className="text-slate-500 hover:text-blue-400"><Pencil size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full max-w-md">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <h3 className="font-semibold text-white">{editing ? 'Editar Cartão' : 'Novo Cartão'}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Nome do cartão *">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Nubank PJ, Inter Empresarial..." className="input-dark w-full" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bandeira">
                  <select value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} className="input-dark w-full">
                    {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </Field>
                <Field label="Últimos 4 dígitos">
                  <input value={form.last4} onChange={e => setForm(f => ({ ...f, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder="0000" maxLength={4} className="input-dark w-full font-mono" />
                </Field>
              </div>
              <Field label="Limite (R$)">
                <input type="number" step="0.01" value={form.credit_limit}
                  onChange={e => setForm(f => ({ ...f, credit_limit: parseFloat(e.target.value) || 0 }))}
                  className="input-dark w-full" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dia de fechamento">
                  <input type="number" min="1" max="31" value={form.closing_day}
                    onChange={e => setForm(f => ({ ...f, closing_day: e.target.value }))}
                    placeholder="Ex: 20" className="input-dark w-full" />
                </Field>
                <Field label="Dia de vencimento">
                  <input type="number" min="1" max="31" value={form.due_day}
                    onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                    placeholder="Ex: 27" className="input-dark w-full" />
                </Field>
              </div>
              <Field label="Observações">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="input-dark w-full resize-none" placeholder="Alguma anotação sobre este cartão..." />
              </Field>
              {editing && (
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={!!form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                  Cartão ativo
                </label>
              )}
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
