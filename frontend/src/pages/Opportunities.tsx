import { useEffect, useRef, useState } from 'react';
import {
  Plus, X, Trash2, RefreshCw, Pencil, Check, GripVertical,
  Phone, Mail, Users, MessageSquare, FileText, StickyNote,
  Calendar, AlertCircle, Clock,
} from 'lucide-react';
import {
  getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity,
  getProducts, getPipelineStages, createPipelineStage, updatePipelineStage, deletePipelineStage,
  getOppActivities, addOppActivity, deleteOppActivity,
  getUsers, type OppSummary,
} from '../api';
import type { Opportunity, OppActivity, PipelineStage } from '../types';
import { useAuth } from '../context/AuthContext';

interface Product { id: number; name: string; price: number; category: string | null }

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? d.split('-').reverse().join('/') : '—';

// Uses local date to avoid UTC offset issues (Brazil = UTC-3)
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PROB_DEFAULT: Record<string, number> = {
  prospeccao: 10, contato: 25, proposta: 50, negociacao: 75, fechado: 100, perdido: 0,
};

const TEMP_CONFIG = {
  frio:   { label: 'Frio',   icon: '❄️',  color: '#93c5fd', bg: 'rgba(147,197,253,0.1)'  },
  morno:  { label: 'Morno',  icon: '🌡️', color: '#fcd34d', bg: 'rgba(252,211,77,0.1)'   },
  quente: { label: 'Quente', icon: '🔥',  color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
} as const;

const ACTIVITY_CONFIG = {
  nota:     { label: 'Nota',     icon: StickyNote,     color: '#94a3b8' },
  ligacao:  { label: 'Ligação',  icon: Phone,          color: '#34d399' },
  email:    { label: 'E-mail',   icon: Mail,           color: '#60a5fa' },
  reuniao:  { label: 'Reunião',  icon: Users,          color: '#a78bfa' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare,  color: '#4ade80' },
  proposta: { label: 'Proposta', icon: FileText,       color: '#fbbf24' },
} as const;

const SOURCES = ['Indicação','Instagram','LinkedIn','Site','Evento','Google Ads','WhatsApp','Outro'];

const LOST_REASONS = [
  'Preço muito alto',
  'Escolheu concorrente',
  'Sem orçamento',
  'Timing ruim',
  'Ghosting / sumiu',
  'Serviço não atende',
  'Projeto cancelado',
  'Outro',
];

const EMPTY: Partial<Opportunity & { product_id?: number }> = {
  title: '', client_name: '', value: 0, stage: 'prospeccao', probability: 10,
  temperature: 'morno', next_followup: '', owner_id: null, source: '',
  expected_close_date: '', notes: '', product_id: undefined, lost_reason: null,
};

const STAGE_COLORS = [
  { color: '#94a3b8', bg: 'rgba(100,116,139,0.15)' },
  { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  { color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  { color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  { color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
];

function slugify(label: string) {
  return label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

function followupStatus(date: string | null): 'overdue' | 'today' | 'soon' | 'future' | null {
  if (!date) return null;
  const t = localToday();
  if (date < t) return 'overdue';
  if (date === t) return 'today';
  // Compare using local date objects — avoid UTC offset completely
  const [fy, fm, fd] = date.split('-').map(Number);
  const [ty, tm, td] = t.split('-').map(Number);
  const diff = Math.round(
    (new Date(fy, fm - 1, fd).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000
  );
  return diff <= 3 ? 'soon' : 'future';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-dark mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function OppCard({ opp, onEdit, onDelete, onDragStart, onDragEnd, isDragging }: {
  opp: Opportunity; onEdit: (o: Opportunity) => void; onDelete: (id: number) => void;
  onDragStart: (id: number) => void; onDragEnd: () => void; isDragging: boolean;
}) {
  const fuStatus = followupStatus(opp.next_followup);
  const fuColors = {
    overdue: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
    today:   { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
    soon:    { bg: 'rgba(59,130,246,0.1)', text: '#93c5fd', border: 'rgba(59,130,246,0.2)' },
    future:  { bg: 'transparent', text: '#64748b', border: 'transparent' },
  };

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(opp.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(opp)}
      style={{
        background: '#0c0c26', borderRadius: 10, padding: '10px 12px',
        border: '1px solid rgba(59,130,246,0.15)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s, border-color 0.15s',
        boxShadow: isDragging ? 'none' : '0 1px 4px rgba(0,0,0,0.25)',
        userSelect: 'none',
      }}
      className="group hover:border-blue-500/40"
    >
      {/* Row 1: title + delete */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-slate-200 leading-snug">{opp.title}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(opp.id); }}
          className="p-1 rounded text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Client */}
      {opp.client_name && (
        <div className="text-xs text-slate-500 mb-2 truncate">{opp.client_name}</div>
      )}

      {/* Value + temp */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-emerald-400">{brl(opp.value)}</span>
        {opp.temperature && TEMP_CONFIG[opp.temperature] && (
          <span className="text-xs" title={TEMP_CONFIG[opp.temperature].label}>
            {TEMP_CONFIG[opp.temperature].icon}
          </span>
        )}
      </div>

      {/* Bottom row: follow-up + activity count + days */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {opp.next_followup && fuStatus && fuStatus !== 'future' ? (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 font-medium"
              style={{ background: fuColors[fuStatus].bg, color: fuColors[fuStatus].text, border: `1px solid ${fuColors[fuStatus].border}` }}
            >
              {fuStatus === 'overdue' && <AlertCircle size={9} />}
              {fuStatus === 'today' && <Calendar size={9} />}
              {fuStatus === 'soon' && <Calendar size={9} />}
              {fmtDate(opp.next_followup)}
            </span>
          ) : opp.next_followup ? (
            <span className="text-xs text-slate-700 flex items-center gap-1">
              <Calendar size={9} />{fmtDate(opp.next_followup)}
            </span>
          ) : null}

          {opp.activity_count > 0 && (
            <span className="text-xs text-slate-600 flex items-center gap-0.5">
              <StickyNote size={9} />{opp.activity_count}
            </span>
          )}
        </div>

        {(opp.days_in_stage ?? 0) > 0 && (
          <span className="text-xs text-slate-700 flex items-center gap-0.5 shrink-0">
            <Clock size={9} />{opp.days_in_stage}d
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Stage column header ──────────────────────────────────────────────────────

function StageHeader({ stage, count, isOver, onRename, onDelete, canDelete }: {
  stage: PipelineStage; count: number; isOver: boolean;
  onRename: (id: number, l: string) => void; onDelete: (id: number) => void; canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(stage.label);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    const t = val.trim();
    if (t && t !== stage.label) onRename(stage.id, t);
    setEditing(false);
  };

  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-lg mb-2 group/hdr"
      style={{
        background: isOver
          ? stage.bg_color.replace('0.12','0.22').replace('0.15','0.25')
          : stage.bg_color,
        border: isOver ? `1px solid ${stage.color}55` : '1px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      {editing ? (
        <input ref={ref} value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
          className="text-xs font-semibold bg-transparent border-b outline-none flex-1 mr-2"
          style={{ color: stage.color, borderColor: stage.color+'66' }}
        />
      ) : (
        <button onClick={() => { setVal(stage.label); setEditing(true); }}
          className="text-xs font-semibold text-left flex-1 flex items-center gap-1 group/lbl"
          style={{ color: stage.color, background: 'none', border: 'none', cursor: 'text' }}
          title="Clique para renomear"
        >
          {stage.label}
          <Pencil size={9} className="opacity-0 group-hover/lbl:opacity-50 transition-opacity" />
        </button>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium" style={{ color: stage.color }}>{count}</span>
        {canDelete && !stage.is_terminal && (
          <button onClick={() => onDelete(stage.id)}
            className="text-slate-700 hover:text-red-400 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Activity log panel ───────────────────────────────────────────────────────

function ActivityPanel({ oppId, authorDefault }: { oppId: number; authorDefault: string }) {
  const [activities, setActivities] = useState<OppActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: 'nota' as OppActivity['type'], content: '', author: authorDefault });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setActivities(await getOppActivities(oppId)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [oppId]);

  const add = async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      await addOppActivity(oppId, form);
      setForm(f => ({ ...f, content: '' }));
      load();
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm('Remover atividade?')) return;
    await deleteOppActivity(oppId, id);
    load();
  };

  const fmtDt = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Add activity */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(59,130,246,0.1)' }}>
        {/* Type selector */}
        <div className="flex gap-1.5 flex-wrap">
          {(Object.entries(ACTIVITY_CONFIG) as [OppActivity['type'], typeof ACTIVITY_CONFIG[keyof typeof ACTIVITY_CONFIG]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const active = form.type === key;
            return (
              <button key={key} onClick={() => setForm(f => ({ ...f, type: key }))}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active ? cfg.color+'20' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${active ? cfg.color+'55' : 'rgba(59,130,246,0.08)'}`,
                  color: active ? cfg.color : '#64748b',
                }}
              >
                <Icon size={11} /> {cfg.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }}
          placeholder="Descreva a interação... (Ctrl+Enter para salvar)"
          rows={2}
          className="input-dark w-full text-sm resize-none"
        />
        <div className="flex items-center gap-2">
          <input
            value={form.author}
            onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
            placeholder="Autor"
            className="input-dark text-xs flex-1"
          />
          <button onClick={add} disabled={saving || !form.content.trim()}
            className="btn-primary text-xs flex items-center gap-1 shrink-0 disabled:opacity-40">
            <Plus size={12} /> {saving ? '...' : 'Registrar'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {loading ? (
          <p className="text-slate-600 text-xs text-center py-4">Carregando...</p>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <StickyNote size={24} className="mx-auto text-slate-700 mb-2" />
            <p className="text-slate-600 text-xs">Nenhuma atividade registrada</p>
          </div>
        ) : activities.map(act => {
          const cfg = ACTIVITY_CONFIG[act.type];
          const Icon = cfg.icon;
          return (
            <div key={act.id} className="group/act flex gap-2.5 rounded-xl p-3"
              style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(59,130,246,0.08)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: cfg.color+'18' }}>
                <Icon size={13} style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">{fmtDt(act.created_at)}</span>
                    <button onClick={() => del(act.id)}
                      className="text-slate-700 hover:text-red-400 opacity-0 group-hover/act:opacity-100 transition-opacity">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{act.content}</p>
                {act.author && <p className="text-xs text-slate-600 mt-1">por {act.author}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Opportunities() {
  const { user } = useAuth();
  const [data, setData] = useState<{ items: Opportunity[]; summary: OppSummary } | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalTab, setModalTab] = useState<'dados' | 'atividades'>('dados');
  const [form, setForm] = useState<Partial<Opportunity & { product_id?: number }>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'kanban' | 'won' | 'lost'>('kanban');

  // DnD
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);

  // Lost reason modal
  const [lostModal, setLostModal] = useState<{ opp: Opportunity; targetStage: string; reason: string } | null>(null);

  // Add stage
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColorIdx, setNewStageColorIdx] = useState(0);
  const newStageRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [opps, prods, stgs, usrs] = await Promise.all([
        getOpportunities(), getProducts(true), getPipelineStages(), getUsers(),
      ]);
      setData(opps); setProducts(prods); setStages(stgs); setUsers(usrs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (addingStage) newStageRef.current?.focus(); }, [addingStage]);

  const openCreate = (stage?: string) => {
    const s = stage || 'prospeccao';
    setForm({ ...EMPTY, stage: s, probability: PROB_DEFAULT[s] ?? 20 });
    setModalTab('dados');
    setModal(true);
  };
  const openEdit = (o: Opportunity) => {
    setForm({ ...o });
    setModalTab('dados');
    setModal(true);
  };
  const closeModal = () => { setModal(false); setForm(EMPTY); };

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      if (form.id) await updateOpportunity(form.id, form);
      else await createOpportunity(form);
      closeModal(); load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro'); }
    finally { setSaving(false); }
  };

  const handleDrop = async (targetStage: string) => {
    setDropStage(null);
    if (dragId === null) return;
    const opp = items.find(i => i.id === dragId);
    setDragId(null);
    if (!opp || opp.stage === targetStage) return;

    // If dropping onto a lost terminal stage, ask for reason first
    const targetStageObj = stages.find(s => s.key === targetStage);
    const isLostStage = targetStageObj?.is_terminal === 1 && targetStage !== (wonStage?.key ?? 'fechado');
    if (isLostStage) {
      setLostModal({ opp, targetStage, reason: '' });
      return;
    }

    try {
      await updateOpportunity(opp.id, { ...opp, stage: targetStage, probability: PROB_DEFAULT[targetStage] ?? opp.probability });
      load();
    } catch { alert('Erro ao mover oportunidade'); }
  };

  const confirmLost = async () => {
    if (!lostModal || !lostModal.reason) return;
    try {
      await updateOpportunity(lostModal.opp.id, {
        ...lostModal.opp, stage: lostModal.targetStage, probability: 0, lost_reason: lostModal.reason,
      });
      setLostModal(null);
      load();
    } catch { alert('Erro ao mover oportunidade'); }
  };

  const handleRenameStage = async (id: number, label: string) => {
    try { await updatePipelineStage(id, { label }); setStages(p => p.map(s => s.id===id ? {...s, label} : s)); }
    catch (e: any) { alert(e.message); }
  };

  const handleDeleteStage = async (id: number) => {
    const stage = stages.find(s => s.id === id);
    if (!stage) return;
    if (items.filter(i => i.stage === stage.key).length > 0) {
      alert('Mova os cards deste estágio antes de excluí-lo.'); return;
    }
    if (!confirm(`Excluir estágio "${stage.label}"?`)) return;
    try { await deletePipelineStage(id); setStages(p => p.filter(s => s.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  const handleAddStage = async () => {
    const label = newStageName.trim();
    if (!label) return;
    const { color, bg } = STAGE_COLORS[newStageColorIdx];
    try {
      const created = await createPipelineStage({ key: slugify(label), label, color, bg_color: bg });
      setStages(p => [...p, created]);
      setNewStageName(''); setAddingStage(false);
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deletar esta oportunidade?')) return;
    try { await deleteOpportunity(id); load(); }
    catch { alert('Erro ao deletar'); }
  };

  const items = data?.items || [];
  const summary = data?.summary;
  const pipelineStages = stages.filter(s => !s.is_terminal);
  const wonStage  = stages.find(s => s.key === 'fechado');
  const lostStage = stages.find(s => s.key === 'perdido');

  const displayItems =
    view === 'won'  ? items.filter(i => i.stage === (wonStage?.key  ?? 'fechado')) :
    view === 'lost' ? items.filter(i => i.stage === (lostStage?.key ?? 'perdido')) :
    items.filter(i => pipelineStages.some(s => s.key === i.stage));

  const overdueCount = summary?.overdue_followups ?? 0;
  const todayCount   = summary?.today_followups   ?? 0;
  const soonCount    = summary?.soon_followups     ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-white mr-1">Oportunidades</h1>

          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertCircle size={10} />
              {overdueCount} atrasado{overdueCount > 1 ? 's' : ''}
            </span>
          )}

          {todayCount > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Calendar size={10} /> {todayCount} para hoje
            </span>
          )}

          {soonCount > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
              style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Calendar size={10} />
              {soonCount} em breve
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => openCreate()} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nova Oportunidade
          </button>
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="label-dark mb-1">Total</div>
            <div className="metric-md">{brl(summary.total_value)}</div>
          </div>
          <div className="card p-4">
            <div className="label-dark mb-1">Em negociação</div>
            <div className="metric-md text-amber-400">{brl(summary.negotiation_value ?? 0)}</div>
          </div>
          <div className="card p-4">
            <div className="label-dark mb-1">Convertidos</div>
            <div className="metric-md text-emerald-400">{brl(summary.won_value)}</div>
          </div>
          <div className="card p-4">
            <div className="label-dark mb-1">Taxa de conversão</div>
            <div className="metric-md text-emerald-400">{summary.win_rate.toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(['kanban','won','lost'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${view===v ? 'btn-primary' : 'btn-ghost'}`}>
            {v === 'kanban' ? 'Pipeline' :
             v === 'won'    ? `${wonStage?.label  ?? 'Fechados'}  (${items.filter(i=>i.stage===(wonStage?.key  ?? 'fechado')).length})` :
                              `${lostStage?.label ?? 'Perdidos'} (${items.filter(i=>i.stage===(lostStage?.key ?? 'perdido')).length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500" />
        </div>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh', alignItems: 'flex-start' }}>
          {pipelineStages.map(stage => {
            const stageItems = displayItems.filter(i => i.stage === stage.key);
            const isOver = dropStage === stage.key && dragId !== null;
            return (
              <div key={stage.key} style={{ minWidth: 240, width: 240, flexShrink: 0 }}
                onDragOver={e => { e.preventDefault(); setDropStage(stage.key); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropStage(null); }}
                onDrop={e => { e.preventDefault(); handleDrop(stage.key); }}
              >
                <StageHeader stage={stage} count={stageItems.length} isOver={isOver}
                  onRename={handleRenameStage} onDelete={handleDeleteStage}
                  canDelete={stageItems.length === 0} />

                <div className="space-y-2 rounded-xl p-1 transition-all min-h-[80px]"
                  style={{
                    background: isOver ? stage.bg_color.replace('0.12','0.06').replace('0.15','0.06') : 'transparent',
                    border: isOver ? `2px dashed ${stage.color}44` : '2px dashed transparent',
                  }}
                >
                  {stageItems.length === 0 && !isOver && (
                    <div className="py-8 text-center text-slate-700 text-xs rounded-lg"
                      style={{ border: '2px dashed rgba(59,130,246,0.1)' }}>Vazio</div>
                  )}
                  {stageItems.map(o => (
                    <OppCard key={o.id} opp={o} onEdit={openEdit} onDelete={handleDelete}
                      onDragStart={setDragId} onDragEnd={() => { setDragId(null); setDropStage(null); }}
                      isDragging={dragId === o.id} />
                  ))}
                  <button onClick={() => openCreate(stage.key)}
                    className="w-full text-xs text-slate-700 hover:text-slate-500 py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                    style={{ border: '1px dashed rgba(59,130,246,0.08)' }}>
                    <Plus size={11} /> Adicionar
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add stage */}
          <div style={{ minWidth: 200, flexShrink: 0 }}>
            {addingStage ? (
              <div className="rounded-xl p-3 space-y-3"
                style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <p className="text-xs font-semibold text-slate-400">Novo estágio</p>
                <input ref={newStageRef} value={newStageName} onChange={e => setNewStageName(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') handleAddStage(); if (e.key==='Escape') { setAddingStage(false); setNewStageName(''); } }}
                  placeholder="Nome do estágio" className="input-dark w-full text-sm" />
                <div className="flex gap-1.5 flex-wrap">
                  {STAGE_COLORS.map((c, i) => (
                    <button key={i} onClick={() => setNewStageColorIdx(i)}
                      style={{ width:18, height:18, borderRadius:'50%', background:c.color, cursor:'pointer',
                        border: newStageColorIdx===i ? '2px solid #fff' : '2px solid transparent',
                        outline: newStageColorIdx===i ? `2px solid ${c.color}` : 'none' }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddStage} disabled={!newStageName.trim()}
                    className="btn-primary text-xs flex items-center gap-1 flex-1">
                    <Check size={12} /> Criar
                  </button>
                  <button onClick={() => { setAddingStage(false); setNewStageName(''); }} className="btn-ghost text-xs">
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingStage(true)}
                className="w-full rounded-xl py-3 text-xs text-slate-600 hover:text-slate-400 flex items-center justify-center gap-1.5 transition-colors"
                style={{ border: '2px dashed rgba(59,130,246,0.12)' }}>
                <Plus size={13} /> Adicionar estágio
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Lost reasons metrics — only in Perdidos tab */}
          {view === 'lost' && summary && summary.lost_reasons?.length > 0 && (() => {
            const totalLost = summary.lost_reasons.reduce((a, r) => a + r.count, 0);
            return (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-300">Motivos de perda</h3>
                  <span className="text-xs text-slate-500">{totalLost} lead{totalLost > 1 ? 's' : ''} perdido{totalLost > 1 ? 's' : ''} · {brl(summary.lost_value ?? 0)} em valor</span>
                </div>
                <div className="space-y-3">
                  {summary.lost_reasons.map(r => {
                    const pct = totalLost > 0 ? (r.count / totalLost) * 100 : 0;
                    return (
                      <div key={r.reason}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-300">{r.reason}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">{brl(r.total_value)}</span>
                            <span className="text-xs font-semibold text-red-400 w-10 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(239,68,68,0.1)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'rgba(239,68,68,0.6)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        <div className="card overflow-hidden">
          {displayItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">Nenhum registro encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left px-4 py-3">Título</th>
                  <th className="th text-left px-4 py-3">Cliente</th>
                  <th className="th text-right px-4 py-3">Valor</th>
                  {view === 'lost' && <th className="th text-left px-4 py-3">Motivo</th>}
                  <th className="th text-center px-4 py-3">Responsável</th>
                  <th className="th text-center px-4 py-3">Data</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map(o => (
                  <tr key={o.id} className="tr">
                    <td className="td px-4 py-3 font-medium text-slate-200">
                      <div className="flex items-center gap-2">
                        {o.temperature && TEMP_CONFIG[o.temperature] && (
                          <span title={TEMP_CONFIG[o.temperature].label}>{TEMP_CONFIG[o.temperature].icon}</span>
                        )}
                        {o.title}
                      </div>
                    </td>
                    <td className="td px-4 py-3 text-slate-400">{o.client_name || '—'}</td>
                    <td className="td px-4 py-3 text-right font-semibold text-emerald-400">{brl(o.value)}</td>
                    {view === 'lost' && (
                      <td className="td px-4 py-3">
                        {o.lost_reason ? (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                            {o.lost_reason}
                          </span>
                        ) : <span className="text-slate-700 text-xs">—</span>}
                      </td>
                    )}
                    <td className="td px-4 py-3 text-center text-slate-400">{o.owner_name || '—'}</td>
                    <td className="td px-4 py-3 text-center text-slate-400">{fmtDate(o.expected_close_date || '')}</td>
                    <td className="td px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(o)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(o.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )}

      {/* ── Lost reason modal ── */}
      {lostModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
          <div className="modal-card w-full max-w-md p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white mb-1">Por que o lead foi perdido?</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <span className="text-slate-400 font-medium">{lostModal.opp.title}</span>
                  {lostModal.opp.client_name && ` · ${lostModal.opp.client_name}`}
                </p>
              </div>
              <button onClick={() => setLostModal(null)} className="text-slate-500 hover:text-slate-300 shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {LOST_REASONS.map(r => (
                <button key={r} type="button" onClick={() => setLostModal(m => m ? { ...m, reason: r } : m)}
                  className="px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left"
                  style={{
                    background: lostModal.reason === r ? 'rgba(239,68,68,0.15)' : 'rgba(15,23,42,0.6)',
                    border: `1px solid ${lostModal.reason === r ? 'rgba(239,68,68,0.45)' : 'rgba(59,130,246,0.1)'}`,
                    color: lostModal.reason === r ? '#f87171' : '#64748b',
                  }}>
                  {r}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setLostModal(null)} className="btn-ghost text-sm flex-1">Cancelar</button>
              <button onClick={confirmLost} disabled={!lostModal.reason}
                className="btn-primary text-sm flex-1 disabled:opacity-40">
                Confirmar perda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Dados + Atividades ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="modal-card w-full flex flex-col" style={{ maxWidth: 860, height: '88vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <div className="flex items-center gap-4">
                <h2 className="font-semibold text-white">
                  {form.id ? 'Editar Oportunidade' : 'Nova Oportunidade'}
                </h2>
                {form.id && (
                  <div className="flex gap-1">
                    {(['dados','atividades'] as const).map(t => (
                      <button key={t} onClick={() => setModalTab(t)}
                        className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${modalTab===t ? 'btn-primary' : 'btn-ghost'}`}>
                        {t === 'dados' ? 'Dados' : `Atividades${form.id && (items.find(i=>i.id===form.id)?.activity_count ?? 0) > 0 ? ` (${items.find(i=>i.id===form.id)?.activity_count})` : ''}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-hidden">
              {modalTab === 'dados' ? (
                <div className="h-full overflow-y-auto">
                  <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-4">
                    {/* Col 1 */}
                    <div className="col-span-2">
                      <Field label="Título *">
                        <input value={form.title || ''} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                          className="input-dark w-full" placeholder="Ex: Gestão de redes sociais" autoFocus />
                      </Field>
                    </div>

                    <Field label="Cliente">
                      <input value={form.client_name || ''} onChange={e => setForm(f => ({...f, client_name: e.target.value}))}
                        className="input-dark w-full" />
                    </Field>

                    <Field label="Produto / Serviço">
                      <select value={form.product_id ?? ''} onChange={e => {
                        const pid = e.target.value ? Number(e.target.value) : undefined;
                        const prod = products.find(p => p.id === pid);
                        setForm(f => ({...f, product_id: pid, value: prod ? prod.price : f.value}));
                      }} className="input-dark w-full">
                        <option value="">Nenhum</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.category ? ` — ${p.category}` : ''}</option>)}
                      </select>
                    </Field>

                    <Field label="Valor (R$)">
                      <input type="number" step="0.01" value={form.value || ''}
                        onChange={e => setForm(f => ({...f, value: parseFloat(e.target.value)||0}))}
                        className="input-dark w-full" />
                    </Field>

                    <Field label="Probabilidade (%)">
                      <input type="number" min={0} max={100} value={form.probability || 0}
                        onChange={e => setForm(f => ({...f, probability: parseInt(e.target.value)||0}))}
                        className="input-dark w-full" />
                    </Field>

                    <Field label="Estágio">
                      <select value={form.stage || 'prospeccao'} onChange={e => {
                        const s = e.target.value;
                        setForm(f => ({...f, stage: s, probability: PROB_DEFAULT[s] ?? f.probability}));
                      }} className="input-dark w-full">
                        {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </Field>

                    <Field label="Responsável">
                      <select value={form.owner_id ?? ''} onChange={e => setForm(f => ({...f, owner_id: e.target.value ? Number(e.target.value) : null}))}
                        className="input-dark w-full">
                        <option value="">Sem responsável</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </Field>

                    <Field label="Origem do lead">
                      <select value={form.source || ''} onChange={e => setForm(f => ({...f, source: e.target.value || null}))}
                        className="input-dark w-full">
                        <option value="">Não informado</option>
                        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>

                    <Field label="Próximo follow-up">
                      <input type="date" value={form.next_followup || ''} onChange={e => setForm(f => ({...f, next_followup: e.target.value || null}))}
                        className="input-dark w-full" />
                    </Field>

                    <Field label="Previsão de fechamento">
                      <input type="date" value={form.expected_close_date || ''} onChange={e => setForm(f => ({...f, expected_close_date: e.target.value}))}
                        className="input-dark w-full" />
                    </Field>

                    {/* Lost reason — shown only when stage is a lost terminal stage */}
                    {stages.find(s => s.key === form.stage)?.is_terminal === 1 && form.stage !== (wonStage?.key ?? 'fechado') && (
                      <div className="col-span-2">
                        <label className="label-dark mb-2 block">Motivo da perda</label>
                        <div className="grid grid-cols-4 gap-2">
                          {LOST_REASONS.map(r => (
                            <button key={r} type="button" onClick={() => setForm(f => ({ ...f, lost_reason: r }))}
                              className="px-2 py-2 rounded-lg text-xs font-medium transition-all text-center"
                              style={{
                                background: form.lost_reason === r ? 'rgba(239,68,68,0.15)' : 'rgba(15,23,42,0.5)',
                                border: `1px solid ${form.lost_reason === r ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.1)'}`,
                                color: form.lost_reason === r ? '#f87171' : '#64748b',
                              }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Temperature */}
                    <div className="col-span-2">
                      <label className="label-dark mb-2 block">Temperatura do lead</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['frio','morno','quente'] as const).map(t => {
                          const cfg = TEMP_CONFIG[t];
                          const active = (form.temperature ?? 'morno') === t;
                          return (
                            <button key={t} type="button" onClick={() => setForm(f => ({...f, temperature: t}))}
                              className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
                              style={{ background: active ? cfg.bg : 'rgba(15,23,42,0.5)',
                                border: `1px solid ${active ? cfg.color+'55' : 'rgba(59,130,246,0.1)'}`,
                                color: active ? cfg.color : '#64748b' }}>
                              <span>{cfg.icon}</span>{cfg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <Field label="Observações">
                        <textarea value={form.notes || ''} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                          className="input-dark w-full resize-none" rows={2} />
                      </Field>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full overflow-hidden p-6">
                  <ActivityPanel oppId={form.id!} authorDefault={user?.name || ''} />
                </div>
              )}
            </div>

            {/* Modal footer */}
            {modalTab === 'dados' && (
              <div className="flex justify-end gap-3 px-6 py-4 shrink-0"
                style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                <button onClick={closeModal} className="btn-ghost text-sm">Cancelar</button>
                <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
