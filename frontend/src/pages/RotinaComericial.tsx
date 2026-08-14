import { useEffect, useState } from 'react';
import { Check, Plus, Pencil, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface RoutineItem {
  id: number;
  label: string;
  description: string | null;
  category: string | null;
  type: 'daily' | 'weekday';
  weekday: number | null;
  position: number;
  active: boolean;
}

interface PerformanceRow {
  date: string;
  checked_count: string;
  total_count: string;
}

const WEEKDAY_NAMES = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const WEEKDAY_FOCUS = ['', 'Planejamento e Organização', 'Prospecção', 'Reuniões Comerciais', 'Follow-up', 'Gestão'];
const WEEKDAY_COLORS: Record<number, { color: string; bg: string; border: string }> = {
  1: { color: '#818cf8', bg: 'rgba(129,140,248,0.1)',  border: 'rgba(129,140,248,0.25)' },
  2: { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.25)'  },
  3: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)'  },
  4: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)'  },
  5: { color: '#f472b6', bg: 'rgba(244,114,182,0.1)',  border: 'rgba(244,114,182,0.25)' },
};
const CATEGORY_COLORS: Record<string, string> = {
  'Atendimento': '#60a5fa',
  'Follow-up':   '#f59e0b',
  'CRM':         '#34d399',
  'Organização': '#a78bfa',
  'Planejamento':'#818cf8',
  'Prospecção':  '#34d399',
  'Reuniões':    '#60a5fa',
  'Gestão':      '#f472b6',
};

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

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayWeekday(): number {
  const d = new Date().getDay(); // 0=sun,1=mon,...,6=sat
  return d; // we use 1-5 for mon-fri, 0 and 6 are weekend
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 48, stroke = 4, color = '#3b82f6' }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.4s ease' }} />
    </svg>
  );
}

// ── Admin: manage items modal ─────────────────────────────────────────────────
const EMPTY_ITEM = { label: '', description: '', category: '', type: 'daily' as 'daily' | 'weekday', weekday: null as number | null, position: 0, active: true };

function ItemModal({ item, onSave, onClose }: {
  item: Partial<RoutineItem> | null;
  onSave: (data: typeof EMPTY_ITEM) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    ...EMPTY_ITEM,
    ...(item ? {
      label: item.label || '',
      description: item.description || '',
      category: item.category || '',
      type: item.type || 'daily',
      weekday: item.weekday ?? null,
      position: item.position ?? 0,
      active: item.active !== false,
    } : {}),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{item?.id ? 'Editar item' : 'Novo item'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label-dark block mb-1">Descrição *</label>
            <input className="input-dark w-full" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Responder novos leads" />
          </div>
          <div>
            <label className="label-dark block mb-1">Detalhe (opcional)</label>
            <input className="input-dark w-full" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Explicação adicional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-dark block mb-1">Categoria</label>
              <select className="input-dark w-full" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Sem categoria</option>
                {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label-dark block mb-1">Posição</label>
              <input type="number" className="input-dark w-full" value={form.position} onChange={e => setForm(f => ({ ...f, position: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="label-dark block mb-1">Recorrência</label>
            <div className="flex gap-2">
              <button onClick={() => setForm(f => ({ ...f, type: 'daily', weekday: null }))}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: form.type === 'daily' ? 'rgba(59,130,246,0.2)' : 'rgba(15,23,42,0.5)', border: `1px solid ${form.type === 'daily' ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`, color: form.type === 'daily' ? '#93c5fd' : '#64748b' }}>
                Todo dia
              </button>
              <button onClick={() => setForm(f => ({ ...f, type: 'weekday', weekday: f.weekday ?? 1 }))}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: form.type === 'weekday' ? 'rgba(59,130,246,0.2)' : 'rgba(15,23,42,0.5)', border: `1px solid ${form.type === 'weekday' ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`, color: form.type === 'weekday' ? '#93c5fd' : '#64748b' }}>
                Dia fixo
              </button>
            </div>
          </div>
          {form.type === 'weekday' && (
            <div>
              <label className="label-dark block mb-1">Dia da semana</label>
              <div className="flex gap-1.5">
                {[1,2,3,4,5].map(d => (
                  <button key={d} onClick={() => setForm(f => ({ ...f, weekday: d }))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: form.weekday === d ? WEEKDAY_COLORS[d].bg : 'rgba(15,23,42,0.5)', border: `1px solid ${form.weekday === d ? WEEKDAY_COLORS[d].border : 'rgba(59,130,246,0.1)'}`, color: form.weekday === d ? WEEKDAY_COLORS[d].color : '#64748b' }}>
                    {WEEKDAY_NAMES[d].slice(0,3)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
            <span className="text-sm text-slate-300">Ativo</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">Cancelar</button>
          <button onClick={() => form.label.trim() && onSave(form)} className="btn-primary text-sm px-4 py-2">Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RotinaComericial() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState<RoutineItem[]>([]);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [performance, setPerformance] = useState<PerformanceRow[]>([]);
  const [comercialUsers, setComercialUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rotina' | 'gerenciar'>('rotina');
  const [itemModal, setItemModal] = useState<Partial<RoutineItem> | null | false>(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const today = localToday();
  const weekday = todayWeekday();

  const targetUserId = selectedUserId ?? (user?.id ?? null);

  const load = async () => {
    setLoading(true);
    try {
      const [itemsRes, checksRes, perfRes] = await Promise.all([
        authFetch('/api/routine/items').then(r => r.json()),
        authFetch(`/api/routine/checks?date=${today}${isAdmin && selectedUserId ? `&user_id=${selectedUserId}` : ''}`).then(r => r.json()),
        authFetch(`/api/routine/performance?weeks=4${isAdmin && selectedUserId ? `&user_id=${selectedUserId}` : ''}`).then(r => r.json()),
      ]);
      setItems(Array.isArray(itemsRes) ? itemsRes.filter((i: RoutineItem) => i.active) : []);
      setCheckedIds(Array.isArray(checksRes) ? checksRes : []);
      if (perfRes?.performance) setPerformance(perfRes.performance);
      if (perfRes?.users) setComercialUsers(perfRes.users);
    } finally { setLoading(false); }
  };

  const loadAllItems = async () => {
    const res = await authFetch('/api/routine/items').then(r => r.json());
    setItems(Array.isArray(res) ? res : []);
  };

  useEffect(() => { load(); }, [selectedUserId]);

  const toggle = async (itemId: number) => {
    const body: Record<string, unknown> = { item_id: itemId, date: today };
    if (isAdmin && selectedUserId) body.user_id = selectedUserId;
    const res = await authFetch('/api/routine/checks', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
    setCheckedIds(prev => res.checked ? [...prev, itemId] : prev.filter(id => id !== itemId));
  };

  const saveItem = async (form: typeof EMPTY_ITEM) => {
    const editing = itemModal && (itemModal as RoutineItem).id;
    if (editing) {
      await authFetch(`/api/routine/items/${(itemModal as RoutineItem).id}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await authFetch('/api/routine/items', { method: 'POST', body: JSON.stringify(form) });
    }
    setItemModal(false);
    loadAllItems();
  };

  const deleteItem = async (id: number) => {
    if (!confirm('Excluir item?')) return;
    await authFetch(`/api/routine/items/${id}`, { method: 'DELETE' });
    loadAllItems();
  };

  // Items for today's checklist
  const dailyItems = items.filter(i => i.type === 'daily');
  const todayItems = weekday >= 1 && weekday <= 5
    ? items.filter(i => i.type === 'weekday' && i.weekday === weekday)
    : [];
  const allTodayItems = [...dailyItems, ...todayItems];
  const checkedToday = allTodayItems.filter(i => checkedIds.includes(i.id)).length;
  const pct = allTodayItems.length > 0 ? Math.round((checkedToday / allTodayItems.length) * 100) : 0;

  const todayColors = weekday >= 1 && weekday <= 5 ? WEEKDAY_COLORS[weekday] : { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' };

  // Group weekday items for the "Agenda da Semana" section
  const weekDays = [1,2,3,4,5];

  // Performance: last 5 weekdays
  const recentDays = performance.slice(0, 5);

  const toggleCategory = (key: string) => setExpandedCategories(p => ({ ...p, [key]: !p[key] }));

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Rotina Comercial</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {weekday >= 1 && weekday <= 5
              ? `${WEEKDAY_NAMES[weekday]} — foco em ${WEEKDAY_FOCUS[weekday]}`
              : 'Fim de semana — descanse e planeje a semana!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <select
              value={selectedUserId ?? ''}
              onChange={e => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
              className="input-dark text-sm pr-8"
              style={{ minWidth: 160 }}>
              <option value="">Minha visão</option>
              {comercialUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={() => { setTab('rotina'); load(); }}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                style={{ background: tab === 'rotina' ? '#3b82f6' : 'transparent', color: tab === 'rotina' ? '#fff' : '#64748b', border: 'none' }}>
                Rotina
              </button>
              <button onClick={() => { setTab('gerenciar'); loadAllItems(); }}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                style={{ background: tab === 'gerenciar' ? '#3b82f6' : 'transparent', color: tab === 'gerenciar' ? '#fff' : '#64748b', border: 'none' }}>
                Gerenciar itens
              </button>
            </div>
          )}
        </div>
      </div>

      {tab === 'rotina' && (
        <>
          {/* Today card + mini performance */}
          <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: '1fr auto' }}>
            {/* Today card */}
            <div className="card p-5" style={{ border: `1px solid ${todayColors.border}`, background: `linear-gradient(135deg, rgba(10,17,38,0.9) 0%, ${todayColors.bg} 100%)` }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: todayColors.color }}>
                    Checklist de hoje
                  </div>
                  <div className="text-lg font-bold text-white">
                    {checkedToday} de {allTodayItems.length} entregas concluídas
                  </div>
                </div>
                <div className="relative flex items-center justify-center">
                  <ProgressRing pct={pct} size={56} stroke={5} color={todayColors.color} />
                  <span className="absolute text-xs font-bold" style={{ color: todayColors.color }}>{pct}%</span>
                </div>
              </div>

              {/* Daily items */}
              {dailyItems.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-2">Atividades diárias</div>
                  {dailyItems.map(item => {
                    const checked = checkedIds.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => toggle(item.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all group"
                        style={{ background: checked ? 'rgba(52,211,153,0.08)' : 'rgba(15,23,42,0.5)', border: `1px solid ${checked ? 'rgba(52,211,153,0.2)' : 'rgba(59,130,246,0.08)'}` }}>
                        <div className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all"
                          style={{ border: `1.5px solid ${checked ? '#34d399' : '#334155'}`, background: checked ? '#34d399' : 'transparent' }}>
                          {checked && <Check size={9} color="#000" />}
                        </div>
                        <span className="text-sm flex-1" style={{ color: checked ? '#64748b' : '#e2e8f0', textDecoration: checked ? 'line-through' : 'none' }}>
                          {item.label}
                        </span>
                        {item.category && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                            style={{ background: `${CATEGORY_COLORS[item.category] ?? '#64748b'}18`, color: CATEGORY_COLORS[item.category] ?? '#64748b' }}>
                            {item.category}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Today's weekday items */}
              {todayItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: todayColors.color }}>
                    {weekday >= 1 && weekday <= 5 ? WEEKDAY_FOCUS[weekday] : ''}
                  </div>
                  {todayItems.map(item => {
                    const checked = checkedIds.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => toggle(item.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all"
                        style={{ background: checked ? 'rgba(52,211,153,0.08)' : 'rgba(15,23,42,0.5)', border: `1px solid ${checked ? 'rgba(52,211,153,0.2)' : todayColors.border}` }}>
                        <div className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all"
                          style={{ border: `1.5px solid ${checked ? '#34d399' : todayColors.color}`, background: checked ? '#34d399' : 'transparent' }}>
                          {checked && <Check size={9} color="#000" />}
                        </div>
                        <span className="text-sm flex-1" style={{ color: checked ? '#64748b' : '#e2e8f0', textDecoration: checked ? 'line-through' : 'none' }}>
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="text-xs text-slate-600 truncate max-w-32">{item.description}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {weekday === 0 || weekday === 6 ? (
                <p className="text-sm text-slate-500 text-center py-4">Sem checklist no fim de semana 🎉</p>
              ) : null}
            </div>

            {/* Mini performance — last 5 days */}
            <div className="card p-4 flex flex-col gap-2" style={{ minWidth: 160 }}>
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-1">Últimos 5 dias</div>
              {recentDays.length === 0 && <p className="text-xs text-slate-600">Sem histórico ainda</p>}
              {recentDays.map(day => {
                const pctDay = day.total_count && Number(day.total_count) > 0
                  ? Math.round((Number(day.checked_count) / Number(day.total_count)) * 100)
                  : 0;
                const d = new Date(day.date + 'T12:00:00');
                const wd = d.getDay();
                const col = wd >= 1 && wd <= 5 ? WEEKDAY_COLORS[wd].color : '#64748b';
                return (
                  <div key={day.date} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-8 shrink-0">{WEEKDAY_NAMES[wd]?.slice(0,3) ?? '—'}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pctDay}%`, background: col }} />
                    </div>
                    <span className="text-xs font-medium shrink-0" style={{ color: pctDay >= 80 ? '#34d399' : pctDay >= 50 ? '#f59e0b' : '#94a3b8', width: 32, textAlign: 'right' }}>
                      {pctDay}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda da semana */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Agenda da Semana</h2>
            <div className="grid grid-cols-5 gap-3">
              {weekDays.map(d => {
                const col = WEEKDAY_COLORS[d];
                const dayItems = items.filter(i => i.type === 'weekday' && i.weekday === d);
                const isToday = d === weekday;
                const expanded = expandedCategories[`day-${d}`] ?? false;
                return (
                  <div key={d} className="card p-3 flex flex-col gap-2"
                    style={{ border: isToday ? `1px solid ${col.border}` : '1px solid rgba(59,130,246,0.1)', background: isToday ? col.bg : undefined }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold" style={{ color: col.color }}>{WEEKDAY_NAMES[d]}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{WEEKDAY_FOCUS[d]}</div>
                      </div>
                      {isToday && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}>hoje</span>}
                    </div>
                    <div className="space-y-1">
                      {(expanded ? dayItems : dayItems.slice(0,2)).map(item => (
                        <div key={item.id} className="text-xs text-slate-400 flex items-start gap-1.5">
                          <span style={{ color: col.color, flexShrink: 0, marginTop: 2 }}>·</span>
                          {item.label}
                        </div>
                      ))}
                      {dayItems.length > 2 && (
                        <button onClick={() => toggleCategory(`day-${d}`)}
                          className="text-xs flex items-center gap-0.5 transition-colors mt-1"
                          style={{ color: col.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          {expanded ? <><ChevronUp size={11} /> menos</> : <><ChevronDown size={11} /> +{dayItems.length - 2} mais</>}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Performance table (admin or self) */}
          {performance.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Histórico das últimas 4 semanas</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="label-dark pb-2 pr-4">Data</th>
                      <th className="label-dark pb-2 pr-4">Dia</th>
                      <th className="label-dark pb-2 pr-4">Concluídos</th>
                      <th className="label-dark pb-2 pr-4">Total</th>
                      <th className="label-dark pb-2">% Conclusão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {performance.map(row => {
                      const pctRow = row.total_count && Number(row.total_count) > 0
                        ? Math.round((Number(row.checked_count) / Number(row.total_count)) * 100)
                        : 0;
                      const d = new Date(row.date + 'T12:00:00');
                      const wd = d.getDay();
                      const col = wd >= 1 && wd <= 5 ? WEEKDAY_COLORS[wd].color : '#64748b';
                      const isToday = row.date === today;
                      return (
                        <tr key={row.date} style={{ background: isToday ? 'rgba(59,130,246,0.05)' : undefined }}>
                          <td className="py-2 pr-4 text-slate-400 font-variant-numeric">
                            {d.toLocaleDateString('pt-BR')}
                            {isToday && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>hoje</span>}
                          </td>
                          <td className="py-2 pr-4 font-medium" style={{ color: col }}>{WEEKDAY_NAMES[wd] ?? '—'}</td>
                          <td className="py-2 pr-4 text-slate-300">{row.checked_count ?? 0}</td>
                          <td className="py-2 pr-4 text-slate-500">{row.total_count ?? 0}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div className="h-full rounded-full" style={{ width: `${pctRow}%`, background: pctRow >= 80 ? '#34d399' : pctRow >= 50 ? '#f59e0b' : '#f87171' }} />
                              </div>
                              <span className="text-xs font-semibold" style={{ color: pctRow >= 80 ? '#34d399' : pctRow >= 50 ? '#f59e0b' : '#f87171' }}>
                                {pctRow}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'gerenciar' && isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{items.length} itens cadastrados</p>
            <button onClick={() => setItemModal({})} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> Novo item
            </button>
          </div>

          {/* Group by type */}
          {['daily', 'weekday'].map(type => {
            const grouped = type === 'daily'
              ? [{ label: 'Todo dia', items: items.filter(i => i.type === 'daily') }]
              : [1,2,3,4,5].map(d => ({ label: `${WEEKDAY_NAMES[d]} — ${WEEKDAY_FOCUS[d]}`, wd: d, items: items.filter(i => i.type === 'weekday' && i.weekday === d) })).filter(g => g.items.length > 0);

            return grouped.map(group => (
              <div key={`${type}-${(group as any).wd ?? 'daily'}`} className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  {type === 'weekday' && (group as any).wd && (
                    <div className="w-2 h-2 rounded-full" style={{ background: WEEKDAY_COLORS[(group as any).wd]?.color }} />
                  )}
                  <h3 className="text-sm font-semibold text-slate-300">{group.label}</h3>
                  <span className="text-xs text-slate-600">({group.items.length})</span>
                </div>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg group"
                      style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(59,130,246,0.08)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{item.label}</div>
                        {item.description && <div className="text-xs text-slate-600 truncate">{item.description}</div>}
                      </div>
                      {item.category && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                          style={{ background: `${CATEGORY_COLORS[item.category] ?? '#64748b'}18`, color: CATEGORY_COLORS[item.category] ?? '#64748b' }}>
                          {item.category}
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => setItemModal(item)} className="p-1.5 rounded-lg text-slate-600 hover:text-blue-400 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })}
        </div>
      )}

      {itemModal !== false && (
        <ItemModal
          item={itemModal || null}
          onSave={saveItem}
          onClose={() => setItemModal(false)}
        />
      )}
    </div>
  );
}
