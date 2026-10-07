import { useState, useEffect, useCallback } from 'react';
import { req } from '../api';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit2, Check, X,
  TrendingUp, Target, DollarSign, Users, Award, BarChart2, Calendar, Zap
} from 'lucide-react';

// ─── formatters ──────────────────────────────────────────────────────────────
const R$ = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const PCT = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toFixed(1)}%`;
const N = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtMes(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function nowMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function semanaFromDate(dateStr: string): string {
  const day = new Date(dateStr + 'T12:00:00').getDate();
  const n = Math.min(Math.ceil(day / 7), 4);
  return `Sem 0${n}`;
}
function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── types ────────────────────────────────────────────────────────────────────
interface KPIs {
  total_leads: number; leads_a: number; leads_b: number; leads_c: number;
  mql: number; pct_mql: number; pct_lead_a: number;
  investimento: number; cpl: number | null; cpl_a: number | null;
  fechados: number; fechados_a: number; faturamento: number;
  ticket_medio: number | null; roas: number | null; cac: number | null;
  win_rate: number; win_rate_a: number;
}
interface Dashboard { mes: string; kpis: KPIs; goals: Record<string, number>; }
interface DailyEntry {
  id: number; data: string; semana: string;
  investimento: number; leads_pagos: number; leads_organicos: number;
  leads_qualif: number; criativos_novos: number;
  agendamentos: number; reunioes_feitas: number; noshows: number;
  propostas: number; fechamentos: number; receita_nova: number;
}
interface WeekRow {
  semana: string; investimento: number; leads_pagos: number; leads_organicos: number;
  leads_qualif: number; agendamentos: number; reunioes_feitas: number; noshows: number;
  propostas: number; fechamentos: number; receita_nova: number;
  meta_semanal: number; pct_meta: number;
}
interface WeeklyData { weeks: WeekRow[]; meta_mensal: number; meta_semanal: number; }
interface CreativeRow {
  criativo: string; campanha: string; leads: number; leads_a: number;
  leads_b: number; leads_c: number; pct_lead_a: number;
  investimento: number; cpl: number | null; cpl_a: number | null;
  fechados: number; faturamento: number; roas: number | null; win_rate_a: number;
}
interface SDRRow { sdr: string; leads: number; leads_a: number; leads_b: number; leads_c: number; fechados: number; faturamento: number; win_rate: number; }
interface CloserRow { closer: string; propostas: number; fechados: number; faturamento: number; ticket_medio: number | null; win_rate: number; }
interface Investment { id: number; campanha: string; criativo: string; periodo: string; investimento: number; }

const GOAL_LABELS: Record<string, string> = {
  total_leads: 'Leads totais', mql: 'MQL (A+B)', cpl_a: 'CPL A (R$)',
  fechados: 'Fechamentos', faturamento: 'Faturamento (R$)', roas: 'ROAS',
  win_rate: 'Win Rate', pct_lead_a: '% Lead A',
};

const DAILY_COLS: { key: keyof Omit<DailyEntry, 'id' | 'data' | 'semana'>; label: string; type?: 'currency' }[] = [
  { key: 'investimento',    label: 'Invest.', type: 'currency' },
  { key: 'leads_pagos',     label: 'Leads pgos' },
  { key: 'leads_organicos', label: 'Org.' },
  { key: 'leads_qualif',    label: 'Qualif.' },
  { key: 'criativos_novos', label: 'Criat.' },
  { key: 'agendamentos',    label: 'Agend.' },
  { key: 'reunioes_feitas', label: 'Reuniões' },
  { key: 'noshows',         label: 'No-show' },
  { key: 'propostas',       label: 'Propostas' },
  { key: 'fechamentos',     label: 'Fech.' },
  { key: 'receita_nova',    label: 'Receita', type: 'currency' },
];

// ─── empty daily form ─────────────────────────────────────────────────────────
function emptyDaily(): Omit<DailyEntry, 'id'> {
  const today = new Date().toISOString().split('T')[0];
  return {
    data: today, semana: semanaFromDate(today),
    investimento: 0, leads_pagos: 0, leads_organicos: 0, leads_qualif: 0,
    criativos_novos: 0, agendamentos: 0, reunioes_feitas: 0, noshows: 0,
    propostas: 0, fechamentos: 0, receita_nova: 0,
  };
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, goal }: {
  label: string; value: string; sub?: string; accent?: string; goal?: number;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.5)' }}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-bold" style={{ color: accent || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      {goal != null && goal > 0 && (
        <div className="mt-2">
          <div className="h-1 rounded-full" style={{ background: 'rgba(51,65,85,0.5)' }}>
            <div className="h-1 rounded-full transition-all"
              style={{ width: `${Math.min(100, (parseFloat(value.replace(/[^0-9.]/g, '')) / goal) * 100)}%`, background: accent || '#6366f1' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(51,65,85,0.5)' }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color, minWidth: 40, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
type Tab = 'diario' | 'painel' | 'criativos' | 'sdr' | 'closer';

export default function Metrics() {
  const [mes, setMes] = useState(nowMes);
  const [tab, setTab] = useState<Tab>('painel');

  // data
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [sdrRows, setSdrRows] = useState<SDRRow[]>([]);
  const [closerRows, setCloserRows] = useState<CloserRow[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);

  // ui
  const [loading, setLoading] = useState(false);
  const [editGoals, setEditGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Record<string, string>>({});

  // daily form
  const [showDailyForm, setShowDailyForm] = useState(false);
  const [dailyForm, setDailyForm] = useState<Omit<DailyEntry, 'id'>>(emptyDaily);
  const [editId, setEditId] = useState<number | null>(null);
  const [savingDaily, setSavingDaily] = useState(false);

  // investment form
  const [invForm, setInvForm] = useState({ campanha: '', criativo: '', periodo: '', investimento: '' });
  const [showInvForm, setShowInvForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, dy, w, cr, sdr, cl, inv] = await Promise.all([
        req<Dashboard>(`/api/metrics/dashboard?mes=${mes}`),
        req<DailyEntry[]>(`/api/metrics/daily?mes=${mes}`),
        req<WeeklyData>(`/api/metrics/weekly?mes=${mes}`),
        req<CreativeRow[]>(`/api/metrics/by-creative?mes=${mes}`),
        req<SDRRow[]>(`/api/metrics/by-sdr?mes=${mes}`),
        req<CloserRow[]>(`/api/metrics/by-closer?mes=${mes}`),
        req<Investment[]>(`/api/metrics/investments?mes=${mes}`),
      ]);
      setDash(d); setDaily(dy); setWeekly(w);
      setCreatives(cr); setSdrRows(sdr); setCloserRows(cl); setInvestments(inv);
      const gmap: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.goals || {})) gmap[k] = String(v);
      setGoalDraft(gmap);
    } catch {}
    setLoading(false);
  }, [mes]);

  useEffect(() => { load(); }, [load]);

  // ── daily entry handlers ────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null);
    setDailyForm(emptyDaily());
    setShowDailyForm(true);
  }
  function openEdit(e: DailyEntry) {
    setEditId(e.id);
    const { id: _, ...rest } = e;
    setDailyForm(rest);
    setShowDailyForm(true);
  }
  async function saveDaily() {
    setSavingDaily(true);
    try {
      if (editId) {
        await req(`/api/metrics/daily/${editId}`, { method: 'PUT', body: JSON.stringify(dailyForm) });
      } else {
        await req('/api/metrics/daily', { method: 'POST', body: JSON.stringify(dailyForm) });
      }
      setShowDailyForm(false);
      await load();
    } catch {}
    setSavingDaily(false);
  }
  async function deleteDaily(id: number) {
    if (!confirm('Remover esta entrada?')) return;
    await req(`/api/metrics/daily/${id}`, { method: 'DELETE' });
    await load();
  }

  // ── goals handlers ──────────────────────────────────────────────────────────
  async function saveGoals() {
    for (const [ind, val] of Object.entries(goalDraft)) {
      if (!val) continue;
      await req('/api/metrics/goals', { method: 'PUT', body: JSON.stringify({ mes: `${mes}-01`, indicador: ind, meta: Number(val) }) });
    }
    setEditGoals(false);
    await load();
  }

  // ── investment handlers ─────────────────────────────────────────────────────
  async function saveInv() {
    if (!invForm.campanha || !invForm.periodo) return;
    await req('/api/metrics/investments', {
      method: 'POST',
      body: JSON.stringify({ ...invForm, investimento: Number(invForm.investimento) || 0 }),
    });
    setInvForm({ campanha: '', criativo: '', periodo: '', investimento: '' });
    setShowInvForm(false);
    await load();
  }
  async function deleteInv(id: number) {
    await req(`/api/metrics/investments/${id}`, { method: 'DELETE' });
    await load();
  }

  const kpis = dash?.kpis;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', minHeight: '100%' }}>

      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Métricas</h1>
          <p className="text-xs text-slate-500 mt-0.5">Marketing · Comercial · Operacional</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMes(prevMonth(mes))} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-slate-300 capitalize" style={{ minWidth: 140, textAlign: 'center' }}>
            {fmtMes(mes)}
          </span>
          <button onClick={() => setMes(nextMonth(mes))} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)', width: 'fit-content' }}>
        {([
          { id: 'painel',    label: 'Painel',       icon: <Target size={13} /> },
          { id: 'diario',    label: 'Diário',        icon: <Calendar size={13} /> },
          { id: 'criativos', label: 'Criativos',     icon: <Zap size={13} /> },
          { id: 'sdr',       label: 'Por SDR',       icon: <Users size={13} /> },
          { id: 'closer',    label: 'Por Closer',    icon: <Award size={13} /> },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: tab === t.id ? '#a5b4fc' : '#64748b',
              border: tab === t.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-xs text-slate-500 mb-4">Carregando…</div>}

      {/* ── PAINEL ── */}
      {tab === 'painel' && kpis && (
        <div className="space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Leads totais"   value={N(kpis.total_leads)}  sub={`${PCT(kpis.pct_lead_a)} Lead A`} accent="#a5b4fc" />
            <KpiCard label="MQL (A+B)"      value={N(kpis.mql)}          sub={PCT(kpis.pct_mql) + ' do total'} accent="#38bdf8" />
            <KpiCard label="CPL"            value={R$(kpis.cpl)}         sub={`CPL A: ${R$(kpis.cpl_a)}`} />
            <KpiCard label="Investimento"   value={R$(kpis.investimento)} />
            <KpiCard label="Fechamentos"    value={N(kpis.fechados)}      sub={`Win Rate: ${PCT(kpis.win_rate)}`} accent="#34d399" />
            <KpiCard label="Faturamento"    value={R$(kpis.faturamento)}  sub={`ROAS ${N(kpis.roas)}x`} accent="#34d399"
              goal={dash?.goals['faturamento']} />
            <KpiCard label="Ticket médio"   value={R$(kpis.ticket_medio)} />
            <KpiCard label="CAC"            value={R$(kpis.cac)}          sub={`Win Rate A: ${PCT(kpis.win_rate_a)}`} />
          </div>

          {/* scoreboard semanal */}
          {weekly && weekly.weeks.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.5)' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-slate-200">Placar semanal</div>
                  <div className="text-xs text-slate-500">Meta mensal: {R$(weekly.meta_mensal)} · Meta semanal: {R$(weekly.meta_semanal)}</div>
                </div>
                <button onClick={() => setEditGoals(true)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                  Editar metas
                </button>
              </div>
              <div className="space-y-3">
                {weekly.weeks.map(w => {
                  const color = w.pct_meta >= 1 ? '#34d399' : w.pct_meta >= 0.7 ? '#fbbf24' : '#f87171';
                  return (
                    <div key={w.semana} className="rounded-xl p-4" style={{ background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(51,65,85,0.3)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-300">{w.semana}</span>
                        <span className="text-xs font-bold" style={{ color }}>{R$(w.receita_nova)} / {R$(w.meta_semanal)}</span>
                      </div>
                      <ProgressBar value={w.receita_nova} max={w.meta_semanal || 1} color={color} />
                      <div className="grid grid-cols-5 gap-2 mt-3">
                        {[
                          { label: 'Invest.', value: R$(w.investimento) },
                          { label: 'Leads', value: N(w.leads_pagos + w.leads_organicos) },
                          { label: 'Qualif.', value: N(w.leads_qualif) },
                          { label: 'Reuniões', value: N(w.reunioes_feitas) },
                          { label: 'Fecham.', value: N(w.fechamentos) },
                        ].map(item => (
                          <div key={item.label} className="text-center">
                            <div className="text-xs text-slate-500">{item.label}</div>
                            <div className="text-xs font-semibold text-slate-300">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {weekly && weekly.weeks.length === 0 && (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)' }}>
              <p className="text-sm text-slate-500">Nenhuma entrada diária neste mês. Adicione dados na aba <strong className="text-slate-400">Diário</strong> para ver o placar.</p>
            </div>
          )}

          {/* metas */}
          {editGoals && (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <div className="text-sm font-semibold text-slate-200 mb-4">Metas do mês</div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {Object.entries(GOAL_LABELS).map(([k, label]) => (
                  <div key={k}>
                    <label className="text-xs text-slate-500 mb-1 block">{label}</label>
                    <input type="number" value={goalDraft[k] || ''} onChange={e => setGoalDraft(g => ({ ...g, [k]: e.target.value }))}
                      className="input-dark w-full text-xs" placeholder="0" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditGoals(false)} className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-200">Cancelar</button>
                <button onClick={saveGoals} className="px-4 py-1.5 text-xs rounded-lg font-medium" style={{ background: '#6366f1', color: '#fff' }}>Salvar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DIÁRIO ── */}
      {tab === 'diario' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-xs text-slate-500">Entrada diária de dados operacionais</div>
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
              <Plus size={12} /> Nova entrada
            </button>
          </div>

          {/* add/edit form */}
          {showDailyForm && (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <div className="text-sm font-semibold text-slate-200 mb-4">{editId ? 'Editar entrada' : 'Nova entrada'}</div>
              <div className="grid grid-cols-6 gap-3 mb-4">
                <div className="col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">Data</label>
                  <input type="date" value={dailyForm.data}
                    onChange={e => setDailyForm(f => ({ ...f, data: e.target.value, semana: semanaFromDate(e.target.value) }))}
                    className="input-dark w-full text-xs" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Semana</label>
                  <input type="text" value={dailyForm.semana} readOnly className="input-dark w-full text-xs opacity-60" />
                </div>
                {DAILY_COLS.map(col => (
                  <div key={col.key}>
                    <label className="text-xs text-slate-500 mb-1 block">{col.label}</label>
                    <input type="number" min="0" step={col.type === 'currency' ? '0.01' : '1'}
                      value={(dailyForm[col.key] as number) || ''}
                      onChange={e => setDailyForm(f => ({ ...f, [col.key]: col.type === 'currency' ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0 }))}
                      className="input-dark w-full text-xs" placeholder="0" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowDailyForm(false)} className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-200">Cancelar</button>
                <button onClick={saveDaily} disabled={savingDaily} className="px-4 py-1.5 text-xs rounded-lg font-medium" style={{ background: '#6366f1', color: '#fff' }}>
                  {savingDaily ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          )}

          {/* table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(51,65,85,0.5)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Data</th>
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Sem.</th>
                    {DAILY_COLS.map(c => (
                      <th key={c.key} className="text-right px-3 py-2.5 text-slate-400 font-medium whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {daily.length === 0 && (
                    <tr><td colSpan={DAILY_COLS.length + 3} className="text-center py-8 text-slate-500">Nenhuma entrada neste mês</td></tr>
                  )}
                  {daily.map((e, i) => (
                    <tr key={e.id} style={{ background: i % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent', borderTop: '1px solid rgba(51,65,85,0.2)' }}>
                      <td className="px-3 py-2.5 text-slate-300 font-medium">{fmtDate(e.data)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{e.semana}</td>
                      {DAILY_COLS.map(c => (
                        <td key={c.key} className="px-3 py-2.5 text-right font-mono text-slate-300">
                          {c.type === 'currency' ? R$(e[c.key] as number) : N(e[c.key] as number)}
                        </td>
                      ))}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(e)} className="p-1 rounded text-slate-500 hover:text-indigo-400 transition-colors"><Edit2 size={12} /></button>
                          <button onClick={() => deleteDaily(e.id)} className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {daily.length > 0 && (() => {
                  const sum = daily.reduce((acc, e) => {
                    for (const c of DAILY_COLS) (acc as any)[c.key] = ((acc as any)[c.key] || 0) + (e[c.key] as number);
                    return acc;
                  }, {} as Partial<DailyEntry>);
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)' }}>
                        <td className="px-3 py-2.5 text-xs font-bold text-indigo-400" colSpan={2}>Total</td>
                        {DAILY_COLS.map(c => (
                          <td key={c.key} className="px-3 py-2.5 text-right font-mono font-bold text-indigo-300">
                            {c.type === 'currency' ? R$(sum[c.key] as number) : N(sum[c.key] as number)}
                          </td>
                        ))}
                        <td />
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>

          {/* investments inline */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-300">Investimentos por criativo</div>
              <button onClick={() => setShowInvForm(v => !v)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                <Plus size={12} /> Adicionar
              </button>
            </div>
            {showInvForm && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                <input placeholder="Campanha" value={invForm.campanha} onChange={e => setInvForm(f => ({ ...f, campanha: e.target.value }))} className="input-dark text-xs" />
                <input placeholder="Criativo" value={invForm.criativo} onChange={e => setInvForm(f => ({ ...f, criativo: e.target.value }))} className="input-dark text-xs" />
                <input type="date" value={invForm.periodo} onChange={e => setInvForm(f => ({ ...f, periodo: e.target.value }))} className="input-dark text-xs" />
                <input type="number" placeholder="Valor (R$)" value={invForm.investimento} onChange={e => setInvForm(f => ({ ...f, investimento: e.target.value }))} className="input-dark text-xs" />
                <button onClick={saveInv} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#6366f1', color: '#fff' }}>Salvar</button>
              </div>
            )}
            {investments.length === 0 && <div className="text-xs text-slate-500">Nenhum investimento registrado</div>}
            {investments.length > 0 && (
              <div className="space-y-1">
                {investments.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(2,6,23,0.4)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-300">{inv.campanha}</span>
                      {inv.criativo && <span className="text-xs text-slate-500">· {inv.criativo}</span>}
                      <span className="text-xs text-slate-500">{fmtDate(inv.periodo)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-emerald-400">{R$(inv.investimento)}</span>
                      <button onClick={() => deleteInv(inv.id)} className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CRIATIVOS ── */}
      {tab === 'criativos' && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(51,65,85,0.5)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                {['Criativo', 'Campanha', 'Leads', 'Lead A', '% A', 'Invest.', 'CPL', 'CPL A', 'Fech.', 'Fat.', 'ROAS'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creatives.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-slate-500">Nenhum dado de criativo neste mês</td></tr>
              )}
              {creatives.map((c, i) => {
                const accent = c.pct_lead_a >= 0.3 ? '#34d399' : c.pct_lead_a >= 0.15 ? '#fbbf24' : '#f87171';
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent', borderTop: '1px solid rgba(51,65,85,0.2)' }}>
                    <td className="px-4 py-3 text-slate-200 font-medium max-w-[160px] truncate">{c.criativo}</td>
                    <td className="px-4 py-3 text-slate-500">{c.campanha}</td>
                    <td className="px-4 py-3 font-mono">{c.leads}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: accent }}>{c.leads_a}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: accent }}>{PCT(c.pct_lead_a)}</td>
                    <td className="px-4 py-3 font-mono">{R$(c.investimento || null)}</td>
                    <td className="px-4 py-3 font-mono">{R$(c.cpl)}</td>
                    <td className="px-4 py-3 font-mono">{R$(c.cpl_a)}</td>
                    <td className="px-4 py-3 font-mono">{c.fechados}</td>
                    <td className="px-4 py-3 font-mono">{R$(c.faturamento || null)}</td>
                    <td className="px-4 py-3 font-mono">{c.roas != null ? `${N(c.roas)}x` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── POR SDR ── */}
      {tab === 'sdr' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Desempenho por SDR — leads recebidos e qualificados. Preencha o campo <strong className="text-slate-400">SDR</strong> nas Oportunidades para ver os dados aqui.</p>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(51,65,85,0.5)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                  {['SDR', 'Leads', 'Lead A', 'Lead B', 'Lead C', 'Fechamentos', 'Faturamento', 'Win Rate'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sdrRows.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-500">Nenhum dado de SDR neste mês</td></tr>
                )}
                {sdrRows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent', borderTop: '1px solid rgba(51,65,85,0.2)' }}>
                    <td className="px-4 py-3 text-slate-200 font-medium">{r.sdr}</td>
                    <td className="px-4 py-3 font-mono">{r.leads}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: '#34d399' }}>{r.leads_a}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: '#38bdf8' }}>{r.leads_b}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{r.leads_c}</td>
                    <td className="px-4 py-3 font-mono">{r.fechados}</td>
                    <td className="px-4 py-3 font-mono">{R$(r.faturamento || null)}</td>
                    <td className="px-4 py-3 font-mono">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: r.win_rate >= 0.15 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: r.win_rate >= 0.15 ? '#34d399' : '#f87171' }}>
                        {PCT(r.win_rate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── POR CLOSER ── */}
      {tab === 'closer' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Desempenho por Closer — propostas e fechamentos. Preencha o campo <strong className="text-slate-400">Closer</strong> nas Oportunidades para ver os dados aqui.</p>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(51,65,85,0.5)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                  {['Closer', 'Propostas', 'Fechamentos', 'Faturamento', 'Ticket Médio', 'Win Rate'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closerRows.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-500">Nenhum dado de Closer neste mês</td></tr>
                )}
                {closerRows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent', borderTop: '1px solid rgba(51,65,85,0.2)' }}>
                    <td className="px-4 py-3 text-slate-200 font-medium">{r.closer}</td>
                    <td className="px-4 py-3 font-mono">{r.propostas}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: '#34d399' }}>{r.fechados}</td>
                    <td className="px-4 py-3 font-mono">{R$(r.faturamento || null)}</td>
                    <td className="px-4 py-3 font-mono">{R$(r.ticket_medio)}</td>
                    <td className="px-4 py-3 font-mono">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: r.win_rate >= 0.2 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: r.win_rate >= 0.2 ? '#34d399' : '#f87171' }}>
                        {PCT(r.win_rate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
