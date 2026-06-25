import { useEffect, useRef, useState } from 'react';
import {
  Plus, X, Trash2, RefreshCw, Pencil, Check, GripVertical,
  Phone, Mail, Users, MessageSquare, FileText, StickyNote,
  Calendar, AlertCircle, Clock, UserPlus, ExternalLink,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity,
  convertOpportunityToClient,
  getProducts, getPipelineStages, createPipelineStage, updatePipelineStage, deletePipelineStage,
  getOppActivities, addOppActivity, deleteOppActivity,
  getUsers, getCompanySettings, type OppSummary,
} from '../api';
import type { Opportunity, OppActivity, PipelineStage } from '../types';
import { useAuth } from '../context/AuthContext';

interface Product { id: number; name: string; price: number; category: string | null; billing_type?: 'mrr' | 'tcv' | 'ambos' }
interface OppItem { id?: number; description: string; product_id?: number | null; value: number; }

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? d.split('-').reverse().join('/') : '—';

// Uses local date to avoid UTC offset issues (Brazil = UTC-3)
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isThisWeek(date: string): boolean {
  const t = localToday();
  const [ty, tm, td] = t.split('-').map(Number);
  const [fy, fm, fd] = date.split('-').map(Number);
  const todayMs = new Date(ty, tm - 1, td).getTime();
  const dateMs  = new Date(fy, fm - 1, fd).getTime();
  const diff = Math.round((dateMs - todayMs) / 86400000);
  return diff >= 0 && diff <= 7;
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

const DEFAULT_SOURCES = ['Indicação','Instagram','LinkedIn','Site','Evento','Google Ads','Meta Ads','Turbinar Instagram','Instagram @vanessaraeski','TikTok @vanessaraeski','WhatsApp','Outro'];

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

const PAYMENT_METHODS = [
  { value: 'pix',            label: 'Pix' },
  { value: 'boleto',         label: 'Boleto' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito',  label: 'Cartão de Débito' },
  { value: 'transferencia',  label: 'Transferência' },
  { value: 'permuta',        label: 'Permuta' },
  { value: 'outro',          label: 'Outro' },
];

const EMPTY: Partial<Opportunity & { product_id?: number | null }> = {
  title: '', client_name: '', value: 0, stage: 'prospeccao', probability: 10,
  temperature: 'morno', next_followup: '', owner_id: null, source: '',
  expected_close_date: '', notes: '', product_id: undefined, lost_reason: null,
  original_price: null, payment_method: null, installments: 1, payment_notes: null,
  referral_name: null, referral_type: null, referral_client_id: null, referral_employee_id: null,
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
        <div className="text-xs text-slate-500 mb-1 truncate">{opp.client_name}</div>
      )}

      {/* Source + referral */}
      {opp.source && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-full"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
            {opp.source}
          </span>
          {opp.source === 'Indicação' && opp.referral_name && (
            <span className="text-xs truncate flex items-center gap-0.5" style={{ color: '#a78bfa' }}>
              <Users size={9} />{opp.referral_name}
            </span>
          )}
        </div>
      )}

      {/* Value + temp */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-emerald-400">{brl(opp.value)}</span>
          {(opp as any).opp_items?.length > 1 && (
            <span className="text-xs text-slate-600">{(opp as any).opp_items.length} serviços</span>
          )}
        </div>
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

function StageHeader({ stage, count, isOver, onRename, onDelete, canDelete, onMoveLeft, onMoveRight }: {
  stage: PipelineStage; count: number; isOver: boolean;
  onRename: (id: number, l: string) => void; onDelete: (id: number) => void; canDelete: boolean;
  onMoveLeft?: () => void; onMoveRight?: () => void;
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
      <div className="flex items-center gap-1 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
        {onMoveLeft && (
          <button onClick={onMoveLeft} title="Mover para esquerda"
            className="text-slate-600 hover:text-slate-300 p-0.5 rounded">
            <ChevronLeft size={12} />
          </button>
        )}
        {onMoveRight && (
          <button onClick={onMoveRight} title="Mover para direita"
            className="text-slate-600 hover:text-slate-300 p-0.5 rounded">
            <ChevronRight size={12} />
          </button>
        )}
        <span className="text-xs font-medium mx-1" style={{ color: stage.color }}>{count}</span>
        {!stage.is_terminal && (
          <button onClick={() => onDelete(stage.id)}
            title={canDelete ? 'Excluir estágio' : 'Mova os cards antes de excluir'}
            className={`p-0.5 rounded transition-colors ${canDelete ? 'text-slate-600 hover:text-red-400' : 'text-slate-800 cursor-not-allowed'}`}>
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
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES);
  const [clients, setClients] = useState<{ id: number; name: string; active: number }[]>([]);
  const [employees, setEmployees] = useState<{ id: number; name: string; role?: string }[]>([]);
  const [referralSearch, setReferralSearch] = useState('');
  const [showReferralDropdown, setShowReferralDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalTab, setModalTab] = useState<'dados' | 'atividades'>('dados');
  const [form, setForm] = useState<Partial<Opportunity & { product_id?: number | null }>>(EMPTY);
  const [oppItems, setOppItems] = useState<OppItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [view, setView] = useState<'kanban' | 'won' | 'lost' | 'funil'>('kanban');

  // DnD
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);

  // Lost reason modal
  const [lostModal, setLostModal] = useState<{ opp: Opportunity; targetStage: string; reason: string } | null>(null);

  // Convert to client modal
  const [convertModal, setConvertModal] = useState<{ opp: Opportunity; pendingStage?: string } | null>(null);
  const [convertForm, setConvertForm] = useState<{
    client_type: 'mrr' | 'tcv' | 'ambos';
    monthly_fee: number;
    margin_target: number;
    project_title: string;
    contract_value: number;
    service_type: string;
    start_date: string;
  }>({ client_type: 'mrr', monthly_fee: 0, margin_target: 30, project_title: '', contract_value: 0, service_type: '', start_date: '' });
  const [converting, setConverting] = useState(false);

  // Smart filters
  const [filters, setFilters] = useState({
    temperatures: [] as string[],
    followup: null as 'overdue' | 'today' | 'week' | 'none' | null,
    owner_id: null as number | null,
    source: null as string | null,
    stale: false,
    value_range: null as 'low' | 'mid' | 'high' | null,
    category: null as string | null,
  });

  // Add stage
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColorIdx, setNewStageColorIdx] = useState(0);
  const newStageRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth-token');
      const [opps, allProds, stgs, usrs, settings] = await Promise.all([
        getOpportunities().catch(e => { console.error('opps', e); return { items: [], summary: null } as any; }),
        getProducts().catch(e => { console.error('prods', e); return [] as any[]; }),
        getPipelineStages().catch(e => { console.error('stages', e); return [] as any[]; }),
        getUsers().catch(e => { console.error('users', e); return [] as any[]; }),
        getCompanySettings().catch(() => ({} as any)),
      ]);
      const prods = Array.isArray(allProds) ? allProds.filter(p => p.active) : [];
      setData(opps);
      setProducts(prods);
      setStages(stgs);
      setUsers(usrs);
      if (settings?.lead_sources?.length) setSources(settings.lead_sources);
      fetch('/api/clients', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => setClients(Array.isArray(data) ? data : []))
        .catch(() => {});
      fetch('/api/employees', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => setEmployees(Array.isArray(data) ? data : []))
        .catch(() => {});
    } catch (e) { console.error('load error', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (addingStage) newStageRef.current?.focus(); }, [addingStage]);

  const openCreate = (stage?: string) => {
    const firstPipelineStage = stages.filter(s => !s.is_terminal)[0]?.key ?? 'prospeccao';
    const s = stage || firstPipelineStage;
    setForm({ ...EMPTY, stage: s, probability: PROB_DEFAULT[s] ?? 20 });
    setOppItems([{ description: '', product_id: undefined, value: 0 }]);
    setModalTab('dados');
    setModal(true);
  };
  const openEdit = (opp: Opportunity) => {
    setForm({ ...opp });
    setReferralSearch(opp.referral_name || '');
    const existingItems = (opp as any).opp_items;
    if (existingItems?.length) {
      setOppItems(existingItems.map((it: any) => ({ ...it, value: Number(it.value) || 0 })));
    } else {
      setOppItems([{ description: opp.service_type || '', product_id: opp.product_id, value: Number(opp.value) || 0 }]);
    }
    setModalTab('dados');
    setModal(true);
  };
  const closeModal = () => { setModal(false); setForm(EMPTY); setOppItems([]); setReferralSearch(''); };

  const save = async () => {
    if (!form.title) {
      showToast('error', 'Preencha o título da oportunidade');
      return;
    }
    setSaving(true);
    try {
      const itemsToSave = oppItems.filter(i => i.description.trim() || Number(i.value) > 0);
      const totalValue = itemsToSave.reduce((s, i) => s + (Number(i.value) || 0), 0);
      // If original_price is set, the user explicitly negotiated a discount — respect form.value.
      // Otherwise derive value from the sum of items (or fall back to whatever was in the form).
      const hasDiscount = form.original_price != null && Number(form.original_price) > 0;
      const finalValue = hasDiscount ? (form.value || 0) : (totalValue || form.value || 0);
      const payload = { ...form, value: finalValue, opp_items: itemsToSave };
      if (form.id) await updateOpportunity(form.id, payload);
      else await createOpportunity(payload);
      closeModal();
      showToast('success', `"${form.title}" salva no pipeline!`);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar';
      showToast('error', msg);
    }
    finally { setSaving(false); }
  };

  const openConvertModal = (opp: Opportunity, pendingStage?: string) => {
    const oppItems: OppItem[] = ((opp as any).opp_items || []).filter((i: OppItem) => i.description?.trim() || Number(i.value) > 0);
    // Infer billing_type from products in opp_items
    const itemProducts = oppItems
      .filter(i => i.product_id)
      .map(i => products.find(p => p.id === i.product_id))
      .filter(Boolean);
    const hasMrr = itemProducts.some(p => p?.billing_type === 'mrr' || p?.billing_type === 'ambos');
    const hasTcv = itemProducts.some(p => p?.billing_type === 'tcv' || p?.billing_type === 'ambos');
    const inferredBilling: 'mrr' | 'tcv' | 'ambos' = hasMrr && hasTcv ? 'ambos' : hasTcv ? 'tcv' : 'mrr';
    // Fallback to old single-product logic if no opp_items
    const linkedProduct = opp.product_id ? products.find(p => p.id === opp.product_id) : null;
    const billingType: 'mrr' | 'tcv' | 'ambos' = oppItems.length > 0 ? inferredBilling : (linkedProduct?.billing_type || 'mrr');
    // service_type from item descriptions
    const serviceType = oppItems.length > 0
      ? oppItems.filter(i => i.description?.trim()).map(i => i.description).join(', ')
      : (opp.service_type || linkedProduct?.category || '');
    // total value from items
    const totalValue = oppItems.length > 0
      ? oppItems.reduce((s, i) => s + (Number(i.value) || 0), 0)
      : Number(opp.value || 0);
    setConvertForm({
      client_type: billingType,
      monthly_fee: totalValue,
      margin_target: 30,
      project_title: opp.title,
      contract_value: totalValue,
      service_type: serviceType,
      start_date: new Date().toISOString().split('T')[0],
    });
    setConvertModal({ opp, pendingStage });
  };

  const confirmConvert = async () => {
    if (!convertModal) return;
    setConverting(true);
    try {
      // First move to won stage if this came from a drag-drop
      if (convertModal.pendingStage) {
        await updateOpportunity(convertModal.opp.id, {
          ...convertModal.opp,
          stage: convertModal.pendingStage,
          probability: 100,
        });
      }
      await convertOpportunityToClient(convertModal.opp.id, {
        client_type: convertForm.client_type,
        monthly_fee: convertForm.monthly_fee,
        margin_target: convertForm.margin_target,
        project_title: convertForm.project_title,
        contract_value: convertForm.contract_value,
        service_type: convertForm.service_type || undefined,
        start_date: convertForm.start_date,
      });
      setConvertModal(null);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao converter'); }
    finally { setConverting(false); }
  };

  const skipConvert = async () => {
    if (!convertModal?.pendingStage) { setConvertModal(null); return; }
    try {
      await updateOpportunity(convertModal.opp.id, {
        ...convertModal.opp,
        stage: convertModal.pendingStage,
        probability: 100,
      });
      setConvertModal(null);
      load();
    } catch { alert('Erro ao mover oportunidade'); }
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

    // If dropping onto won stage and not yet a client, offer conversion
    const isWonStage = targetStage === (wonStage?.key ?? 'fechado');
    if (isWonStage && !opp.client_id) {
      openConvertModal(opp, targetStage);
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

  const handleMoveStage = async (id: number, direction: 'left' | 'right') => {
    const pipeline = stages.filter(s => !s.is_terminal).sort((a, b) => a.position - b.position);
    const idx = pipeline.findIndex(s => s.id === id);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= pipeline.length) return;
    const a = pipeline[idx];
    const b = pipeline[swapIdx];
    // Optimistic update
    setStages(prev => prev.map(s => {
      if (s.id === a.id) return { ...s, position: b.position };
      if (s.id === b.id) return { ...s, position: a.position };
      return s;
    }));
    try {
      await Promise.all([
        updatePipelineStage(a.id, { position: b.position }),
        updatePipelineStage(b.id, { position: a.position }),
      ]);
    } catch (e: any) {
      alert(e.message);
      load(); // revert
    }
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

  // Derived filter helpers
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];

  const activeFilterCount = [
    filters.temperatures.length > 0,
    filters.followup !== null,
    filters.owner_id !== null,
    filters.source !== null,
    filters.stale,
    filters.value_range !== null,
    filters.category !== null,
  ].filter(Boolean).length;

  function applyFilters(list: Opportunity[]): Opportunity[] {
    return list.filter(opp => {
      // Temperature (multi-select)
      if (filters.temperatures.length > 0 && !filters.temperatures.includes(opp.temperature ?? '')) return false;

      // Follow-up
      if (filters.followup !== null) {
        const fuSt = followupStatus(opp.next_followup ?? null);
        if (filters.followup === 'overdue' && fuSt !== 'overdue') return false;
        if (filters.followup === 'today'   && fuSt !== 'today')   return false;
        if (filters.followup === 'week'    && (!opp.next_followup || !isThisWeek(opp.next_followup))) return false;
        if (filters.followup === 'none'    && opp.next_followup)  return false;
      }

      // Owner
      if (filters.owner_id !== null && opp.owner_id !== filters.owner_id) return false;

      // Source
      if (filters.source !== null && opp.source !== filters.source) return false;

      // Stale (+7 days in stage)
      if (filters.stale && (opp.days_in_stage ?? 0) < 7) return false;

      // Value range
      if (filters.value_range !== null) {
        const v = Number(opp.value);
        if (filters.value_range === 'low'  && v >= 2000) return false;
        if (filters.value_range === 'mid'  && (v < 2000 || v > 5000)) return false;
        if (filters.value_range === 'high' && v <= 5000) return false;
      }

      // Category — match against opp_items product categories
      if (filters.category !== null) {
        const oppItemsArr = (opp as any).opp_items as Array<{ product_id?: number | null }> | undefined;
        let matched = false;
        if (oppItemsArr?.length) {
          matched = oppItemsArr.some(it => {
            if (!it.product_id) return false;
            const prod = products.find(p => p.id === it.product_id);
            return prod?.category === filters.category;
          });
        }
        // Also check via direct product_id
        if (!matched && opp.product_id) {
          const prod = products.find(p => p.id === opp.product_id);
          if (prod?.category === filters.category) matched = true;
        }
        if (!matched) return false;
      }

      return true;
    });
  }

  // Orphaned = in kanban view but not showing in any pipeline column
  // (stage deleted, stage became terminal, or key mismatch)
  const orphanedItems = view === 'kanban'
    ? items.filter(i => {
        const inPipeline = pipelineStages.some(s => s.key === i.stage);
        const isTerminal = stages.find(s => s.key === i.stage)?.is_terminal;
        return !inPipeline && !isTerminal;
      })
    : [];

  const baseItems =
    view === 'won'  ? items.filter(i => i.stage === (wonStage?.key  ?? 'fechado')) :
    view === 'lost' ? items.filter(i => i.stage === (lostStage?.key ?? 'perdido')) :
    items.filter(i => pipelineStages.some(s => s.key === i.stage));

  const displayItems = applyFilters(baseItems);

  const overdueCount = summary?.overdue_followups ?? 0;
  const todayCount   = summary?.today_followups   ?? 0;
  const soonCount    = summary?.soon_followups     ?? 0;

  return (
    <div className="space-y-5">
      {/* ── Toast notification ── */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all"
          style={{
            background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}>
          {toast.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

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
        <button onClick={() => setView('funil')}
          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${view==='funil' ? 'btn-primary' : 'btn-ghost'}`}>
          📊 Funil
        </button>
      </div>

      {/* ── Smart filter bar (kanban view only) ── */}
      {view === 'kanban' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}>

          {/* Temperatura */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-slate-600 shrink-0">Temp</span>
            {(['frio','morno','quente'] as const).map(t => {
              const cfg = TEMP_CONFIG[t];
              const active = filters.temperatures.includes(t);
              return (
                <button key={t} onClick={() => setFilters(f => ({
                  ...f,
                  temperatures: active ? f.temperatures.filter(x => x !== t) : [...f.temperatures, t],
                }))}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                  style={{
                    background: active ? cfg.bg : 'rgba(15,23,42,0.5)',
                    border: `1px solid ${active ? cfg.color + '80' : 'rgba(59,130,246,0.1)'}`,
                    color: active ? cfg.color : '#64748b',
                  }}>
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-slate-800 shrink-0" />

          {/* Follow-up */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-slate-600 shrink-0">Follow-up</span>
            {([
              ['overdue', 'Atrasado'],
              ['today',   'Hoje'],
              ['week',    'Esta semana'],
              ['none',    'Sem data'],
            ] as const).map(([key, label]) => {
              const active = filters.followup === key;
              return (
                <button key={key} onClick={() => setFilters(f => ({ ...f, followup: active ? null : key }))}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                  style={{
                    background: active ? 'rgba(59,130,246,0.18)' : 'rgba(15,23,42,0.5)',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`,
                    color: active ? '#93c5fd' : '#64748b',
                  }}>
                  {label}
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-slate-800 shrink-0" />

          {/* Responsável */}
          {users.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wider text-slate-600 shrink-0">Resp.</span>
              <select
                value={filters.owner_id ?? ''}
                onChange={e => setFilters(f => ({ ...f, owner_id: e.target.value ? Number(e.target.value) : null }))}
                className="text-xs rounded-lg px-2 py-1 font-medium transition-all"
                style={{
                  background: filters.owner_id !== null ? 'rgba(59,130,246,0.18)' : 'rgba(15,23,42,0.5)',
                  border: `1px solid ${filters.owner_id !== null ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`,
                  color: filters.owner_id !== null ? '#93c5fd' : '#64748b',
                  outline: 'none',
                }}>
                <option value="">Todos</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {/* Origem */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-slate-600 shrink-0">Origem</span>
            <select
              value={filters.source ?? ''}
              onChange={e => setFilters(f => ({ ...f, source: e.target.value || null }))}
              className="text-xs rounded-lg px-2 py-1 font-medium transition-all"
              style={{
                background: filters.source !== null ? 'rgba(59,130,246,0.18)' : 'rgba(15,23,42,0.5)',
                border: `1px solid ${filters.source !== null ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`,
                color: filters.source !== null ? '#93c5fd' : '#64748b',
                outline: 'none',
              }}>
              <option value="">Todas</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="w-px h-5 bg-slate-800 shrink-0" />

          {/* Parado +7 dias */}
          <button onClick={() => setFilters(f => ({ ...f, stale: !f.stale }))}
            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
            style={{
              background: filters.stale ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.5)',
              border: `1px solid ${filters.stale ? 'rgba(245,158,11,0.5)' : 'rgba(59,130,246,0.1)'}`,
              color: filters.stale ? '#fcd34d' : '#64748b',
            }}>
            ⏳ Parado +7d
          </button>

          <div className="w-px h-5 bg-slate-800 shrink-0" />

          {/* Valor */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-slate-600 shrink-0">Valor</span>
            {([
              ['low',  '< R$2k'],
              ['mid',  'R$2k–5k'],
              ['high', '> R$5k'],
            ] as const).map(([key, label]) => {
              const active = filters.value_range === key;
              return (
                <button key={key} onClick={() => setFilters(f => ({ ...f, value_range: active ? null : key }))}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all"
                  style={{
                    background: active ? 'rgba(52,211,153,0.15)' : 'rgba(15,23,42,0.5)',
                    border: `1px solid ${active ? 'rgba(52,211,153,0.45)' : 'rgba(59,130,246,0.1)'}`,
                    color: active ? '#34d399' : '#64748b',
                  }}>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Serviço (category) */}
          {categories.length > 0 && (
            <>
              <div className="w-px h-5 bg-slate-800 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-wider text-slate-600 shrink-0">Serviço</span>
                <select
                  value={filters.category ?? ''}
                  onChange={e => setFilters(f => ({ ...f, category: e.target.value || null }))}
                  className="text-xs rounded-lg px-2 py-1 font-medium transition-all"
                  style={{
                    background: filters.category !== null ? 'rgba(59,130,246,0.18)' : 'rgba(15,23,42,0.5)',
                    border: `1px solid ${filters.category !== null ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`,
                    color: filters.category !== null ? '#93c5fd' : '#64748b',
                    outline: 'none',
                  }}>
                  <option value="">Todos</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Active count + clear */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }}>
                {activeFilterCount} ativo{activeFilterCount > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setFilters({ temperatures: [], followup: null, owner_id: null, source: null, stale: false, value_range: null, category: null })}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium">
                Limpar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500" />
        </div>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh', alignItems: 'flex-start' }}>
          {pipelineStages.length === 0 && orphanedItems.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
              <p className="text-slate-400 text-sm mb-2">Nenhum estágio de pipeline encontrado.</p>
              <p className="text-slate-600 text-xs">Clique em <strong className="text-slate-400">+ Adicionar estágio</strong> para configurar o pipeline.</p>
            </div>
          )}
          {pipelineStages.map((stage, idx) => {
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
                  canDelete={stageItems.length === 0}
                  onMoveLeft={idx > 0 ? () => handleMoveStage(stage.id, 'left') : undefined}
                  onMoveRight={idx < pipelineStages.length - 1 ? () => handleMoveStage(stage.id, 'right') : undefined} />

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

          {/* Orphaned opportunities — stage key was deleted */}
          {orphanedItems.length > 0 && (
            <div style={{ minWidth: 240, width: 240, flexShrink: 0 }}>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-2"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertCircle size={11} /> Sem estágio
                </span>
                <span className="text-xs text-amber-400">{orphanedItems.length}</span>
              </div>
              <div className="space-y-2 rounded-xl p-1 min-h-[80px]"
                style={{ background: 'rgba(245,158,11,0.04)', border: '2px dashed rgba(245,158,11,0.2)' }}>
                {orphanedItems.map(o => (
                  <OppCard key={o.id} opp={o} onEdit={openEdit} onDelete={handleDelete}
                    onDragStart={setDragId} onDragEnd={() => { setDragId(null); setDropStage(null); }}
                    isDragging={dragId === o.id} />
                ))}
              </div>
              <p className="text-xs text-amber-600 mt-1.5 px-1">
                Edite cada card e selecione um estágio.
              </p>
            </div>
          )}

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
      ) : view === 'funil' ? (
        <div className="space-y-5">
          {/* ── Funil por Etapa ── */}
          {summary && (() => {
            const activeStages = stages.filter(s => !s.is_terminal).sort((a, b) => a.position - b.position);
            const counts = activeStages.map(s => {
              const found = summary.by_stage.find((b: any) => b.stage === s.key);
              return { stage: s, count: found ? Number(found.count) : 0, total_value: found ? Number(found.total_value) : 0 };
            });
            const totalActive = counts.reduce((s, c) => s + c.count, 0);
            const wonEntry = summary.by_stage.find((b: any) => b.stage === (wonStage?.key ?? 'fechado'));
            const wonCount = wonEntry ? Number(wonEntry.count) : 0;
            const lostCount = items.filter(i => stages.find(s => s.key === i.stage)?.is_terminal && i.stage !== (wonStage?.key ?? 'fechado')).length;

            return (
              <div className="grid grid-cols-3 gap-5">
                {/* Left: stage steps */}
                <div className="col-span-2 card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-semibold text-slate-300">Funil por Etapa</h3>
                    <span className="text-xs text-slate-500">{totalActive} leads ativos</span>
                  </div>
                  <div className="space-y-2">
                    {counts.map((c, idx) => {
                      const pct = totalActive > 0 ? (c.count / totalActive) * 100 : 0;
                      const nextCount = counts[idx + 1]?.count ?? null;
                      const convPct = nextCount !== null && c.count > 0 ? (nextCount / c.count) * 100 : null;
                      return (
                        <div key={c.stage.key}>
                          <div className="rounded-xl px-4 py-3 flex items-center gap-4 transition-all"
                            style={{ background: c.stage.bg_color, border: `1px solid ${c.stage.color}55` }}>
                            {/* color dot */}
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.stage.color }} />
                            {/* label */}
                            <span className="text-sm font-medium text-slate-200 w-28 shrink-0">{c.stage.label}</span>
                            {/* progress track */}
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 0)}%`, background: c.stage.color, opacity: 0.7 }} />
                            </div>
                            {/* count */}
                            <span className="text-xl font-bold text-white w-8 text-right shrink-0">{c.count}</span>
                            {/* value */}
                            <span className="text-xs font-medium w-28 text-right shrink-0" style={{ color: c.stage.color }}>{brl(c.total_value)}</span>
                          </div>
                          {/* conversion connector */}
                          {idx < counts.length - 1 && (
                            <div className="flex items-center gap-2 my-1 pl-6">
                              <div className="w-px h-4 ml-0.5" style={{ background: `${c.stage.color}40` }} />
                              {convPct !== null ? (
                                <span className="text-xs ml-1" style={{
                                  color: convPct >= 50 ? '#34d399' : convPct >= 25 ? '#fbbf24' : '#f87171'
                                }}>
                                  {convPct.toFixed(0)}% avançam
                                </span>
                              ) : (
                                <span className="text-xs text-slate-700 ml-1">—</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: outcome + win rate */}
                <div className="flex flex-col gap-4">
                  {/* Win rate */}
                  <div className="card p-5 flex flex-col items-center justify-center text-center flex-1">
                    <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Taxa de conversão</div>
                    <div className="text-4xl font-bold text-emerald-400 my-2">{summary.win_rate.toFixed(0)}%</div>
                    <div className="text-xs text-slate-500">{wonCount} fechados de {wonCount + lostCount} finalizados</div>
                  </div>
                  {/* Fechado */}
                  <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <div className="w-2 h-10 rounded-full" style={{ background: '#10b981' }} />
                    <div>
                      <div className="text-xs text-slate-500">{wonStage?.label ?? 'Fechado'}</div>
                      <div className="text-2xl font-bold text-emerald-400">{wonCount}</div>
                      <div className="text-xs text-emerald-700">{brl(summary.won_value)}</div>
                    </div>
                  </div>
                  {/* Perdido */}
                  <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <div className="w-2 h-10 rounded-full" style={{ background: '#ef4444' }} />
                    <div>
                      <div className="text-xs text-slate-500">{lostStage?.label ?? 'Perdido'}</div>
                      <div className="text-2xl font-bold text-red-400">{lostCount}</div>
                      <div className="text-xs text-red-800">{brl(summary.lost_value)}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Performance por Origem ── */}
          {summary && summary.source_performance && summary.source_performance.length > 0 && (() => {
            const srcData = summary.source_performance;
            const bestSource = srcData.reduce((best, s) => s.won > best.won ? s : best, srcData[0]);
            return (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-300">Performance por Origem</h3>
                  {bestSource && bestSource.won > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                      Melhor origem: {bestSource.source}
                    </span>
                  )}
                </div>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                        <th className="th text-left px-4 py-2.5">Origem</th>
                        <th className="th text-right px-4 py-2.5">Total</th>
                        <th className="th text-right px-4 py-2.5">Ativos</th>
                        <th className="th text-right px-4 py-2.5">Fechados</th>
                        <th className="th text-right px-4 py-2.5">Perdidos</th>
                        <th className="th text-right px-4 py-2.5">Conversão</th>
                        <th className="th text-right px-4 py-2.5">Valor fechado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {srcData.map(s => {
                        const convRate = s.total > 0 ? (s.won / s.total) * 100 : 0;
                        const convColor = convRate >= 40 ? '#34d399' : convRate >= 20 ? '#fbbf24' : '#f87171';
                        const convBg = convRate >= 40 ? 'rgba(16,185,129,0.1)' : convRate >= 20 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
                        return (
                          <tr key={s.source} className="tr">
                            <td className="td px-4 py-2.5 font-medium text-slate-200">{s.source}</td>
                            <td className="td px-4 py-2.5 text-right text-slate-400">{s.total}</td>
                            <td className="td px-4 py-2.5 text-right text-amber-400">{s.active}</td>
                            <td className="td px-4 py-2.5 text-right text-emerald-400">{s.won}</td>
                            <td className="td px-4 py-2.5 text-right text-red-400">{s.lost}</td>
                            <td className="td px-4 py-2.5 text-right">
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: convBg, color: convColor, border: `1px solid ${convColor}33` }}>
                                {convRate.toFixed(0)}%
                              </span>
                            </td>
                            <td className="td px-4 py-2.5 text-right font-semibold text-emerald-400">{brl(s.won_value)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
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
                      <div className="flex gap-1 justify-end items-center">
                        {view === 'won' && (
                          o.client_id ? (
                            <a href="/clientes" title="Ver cliente criado"
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mr-1"
                              style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
                              <ExternalLink size={10} /> Cliente
                            </a>
                          ) : (
                            <button
                              onClick={() => openConvertModal(o)}
                              title="Converter em cliente"
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mr-1 transition-colors"
                              style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                              <UserPlus size={10} /> Criar cliente
                            </button>
                          )
                        )}
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

      {/* ── Convert to client modal ── */}
      {convertModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
          <div className="modal-card w-full max-w-lg">
            <div className="flex items-start justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <UserPlus size={16} className="text-indigo-400" /> Criar cliente a partir da oportunidade
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="text-slate-400">{convertModal.opp.title}</span>
                  {convertModal.opp.client_name && ` · ${convertModal.opp.client_name}`}
                </p>
              </div>
              <button onClick={() => setConvertModal(null)} className="text-slate-500 hover:text-slate-300 shrink-0 ml-4"><X size={16} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Services summary from opp_items */}
              {(() => {
                const items: OppItem[] = ((convertModal.opp as any).opp_items || []).filter((i: OppItem) => i.description?.trim() || Number(i.value) > 0);
                if (items.length === 0) return null;
                const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
                return (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <p className="text-xs font-semibold text-indigo-300 mb-2">Serviços do negócio fechado</p>
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-xs text-slate-300">{item.description || '—'}</span>
                        <span className="text-xs font-semibold text-emerald-400">{brl(Number(item.value) || 0)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(99,102,241,0.2)' }}>
                      <span className="text-xs font-semibold text-slate-400">Total</span>
                      <span className="text-sm font-bold text-emerald-400">{brl(total)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Client type */}
              <div>
                <label className="label-dark mb-2 block">Tipo de cliente</label>
                <div className="flex gap-2">
                  {([['mrr', 'MRR (Recorrente)'], ['tcv', 'TCV (Projeto)'], ['ambos', 'MRR + TCV']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setConvertForm(f => ({ ...f, client_type: v }))}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        convertForm.client_type === v
                          ? v === 'mrr' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                            : v === 'tcv' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                            : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                          : 'border-white/10 text-slate-500 hover:border-white/20'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>

              {/* MRR fields */}
              {(convertForm.client_type === 'mrr' || convertForm.client_type === 'ambos') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-dark mb-1 block">Mensalidade (R$)</label>
                    <input type="number" step="0.01" value={convertForm.monthly_fee || ''}
                      onChange={e => setConvertForm(f => ({ ...f, monthly_fee: parseFloat(e.target.value) || 0 }))}
                      className="input-dark w-full" />
                  </div>
                  <div>
                    <label className="label-dark mb-1 block">Meta de margem (%)</label>
                    <input type="number" value={convertForm.margin_target || 30}
                      onChange={e => setConvertForm(f => ({ ...f, margin_target: parseFloat(e.target.value) || 30 }))}
                      className="input-dark w-full" />
                  </div>
                </div>
              )}

              {/* TCV fields */}
              {(convertForm.client_type === 'tcv' || convertForm.client_type === 'ambos') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label-dark mb-1 block">Título do projeto</label>
                    <input value={convertForm.project_title}
                      onChange={e => setConvertForm(f => ({ ...f, project_title: e.target.value }))}
                      className="input-dark w-full" />
                  </div>
                  <div>
                    <label className="label-dark mb-1 block">Valor do contrato (R$)</label>
                    <input type="number" step="0.01" value={convertForm.contract_value || ''}
                      onChange={e => setConvertForm(f => ({ ...f, contract_value: parseFloat(e.target.value) || 0 }))}
                      className="input-dark w-full" />
                  </div>
                  <div>
                    <label className="label-dark mb-1 block">Início</label>
                    <input type="date" value={convertForm.start_date}
                      onChange={e => setConvertForm(f => ({ ...f, start_date: e.target.value }))}
                      className="input-dark w-full" />
                  </div>
                </div>
              )}

              {/* Service type */}
              <div>
                <label className="label-dark mb-1 block">Tipo de serviço</label>
                <input value={convertForm.service_type}
                  onChange={e => setConvertForm(f => ({ ...f, service_type: e.target.value }))}
                  className="input-dark w-full" placeholder="Ex: Gestão de redes, Branding..." />
              </div>
            </div>

            <div className="flex justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
              <button onClick={skipConvert} className="btn-ghost text-sm text-slate-500">
                {convertModal.pendingStage ? 'Só fechar, sem criar cliente' : 'Cancelar'}
              </button>
              <button onClick={confirmConvert} disabled={converting} className="btn-primary text-sm disabled:opacity-50">
                {converting ? 'Criando...' : '✓ Criar cliente'}
              </button>
            </div>
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

      {/* ── Modal: Dados + Negociação + Atividades ── */}
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
                <div className="flex gap-1">
                  <button onClick={() => setModalTab('dados')}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${modalTab==='dados' ? 'btn-primary' : 'btn-ghost'}`}>
                    Dados
                  </button>
                  <button onClick={() => setModalTab('negociacao' as any)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${modalTab===('negociacao' as any) ? 'btn-primary' : 'btn-ghost'}`}>
                    Negociação
                  </button>
                  {form.id && (
                    <button onClick={() => setModalTab('atividades')}
                      className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${modalTab==='atividades' ? 'btn-primary' : 'btn-ghost'}`}>
                      {`Atividades${(items.find(i=>i.id===form.id)?.activity_count ?? 0) > 0 ? ` (${items.find(i=>i.id===form.id)?.activity_count})` : ''}`}
                    </button>
                  )}
                </div>
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

                    {/* Serviços / Itens */}
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Serviços</label>
                        <button type="button" onClick={() => setOppItems(p => [...p, { description: '', product_id: undefined, value: 0 }])}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                          <Plus size={12} /> Adicionar serviço
                        </button>
                      </div>
                      <div className="space-y-2">
                        {oppItems.map((item, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            {/* Description / product select combo */}
                            <div className="flex-1 min-w-0">
                              <input
                                value={item.description}
                                onChange={e => setOppItems(p => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                                className="input-dark w-full text-sm"
                                placeholder="Descrição do serviço"
                              />
                              {/* Optional product link */}
                              <select
                                value={item.product_id ?? ''}
                                onChange={e => {
                                  const pid = e.target.value ? Number(e.target.value) : undefined;
                                  const prod = products.find(p => p.id === pid);
                                  setOppItems(p => p.map((x, i) => i === idx ? {
                                    ...x,
                                    product_id: pid,
                                    description: prod ? (x.description || prod.name) : x.description,
                                    value: prod ? prod.price : x.value,
                                  } : x));
                                }}
                                className="input-dark w-full text-xs mt-1 text-slate-400"
                              >
                                <option value="">Produto do catálogo (opcional)</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>
                            {/* Value */}
                            <input
                              type="number" step="0.01" min="0"
                              value={item.value || ''}
                              onChange={e => setOppItems(p => p.map((x, i) => i === idx ? { ...x, value: parseFloat(e.target.value) || 0 } : x))}
                              className="input-dark w-28 text-sm"
                              placeholder="R$ 0,00"
                            />
                            {/* Remove */}
                            {oppItems.length > 1 && (
                              <button type="button" onClick={() => setOppItems(p => p.filter((_, i) => i !== idx))}
                                className="text-slate-600 hover:text-red-400 mt-2">
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Total */}
                      {oppItems.length > 1 && (
                        <div className="mt-2 text-right text-sm font-bold text-emerald-400">
                          Total: {brl(oppItems.reduce((s, i) => s + (Number(i.value) || 0), 0))}
                        </div>
                      )}
                    </div>

                    <Field label="Probabilidade (%)">
                      <input type="number" min={0} max={100} value={form.probability || 0}
                        onChange={e => setForm(f => ({...f, probability: parseInt(e.target.value)||0}))}
                        className="input-dark w-full" />
                    </Field>

                    <Field label="Estágio">
                      <select value={form.stage || pipelineStages[0]?.key || ''} onChange={e => {
                        const s = e.target.value;
                        setForm(f => ({...f, stage: s, probability: PROB_DEFAULT[s] ?? f.probability}));
                      }} className="input-dark w-full">
                        {stages.map(s => (
                          <option key={s.key} value={s.key}>
                            {s.is_terminal ? (s.key === (wonStage?.key ?? 'fechado') ? '✅ ' : '❌ ') : ''}{s.label}
                          </option>
                        ))}
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
                      <select value={form.source || ''} onChange={e => setForm(f => ({...f, source: e.target.value || null, referral_name: e.target.value !== 'Indicação' ? null : f.referral_name}))}
                        className="input-dark w-full">
                        <option value="">Não informado</option>
                        {sources.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>

                    {form.source === 'Indicação' && (
                      <Field label="Indicado por">
                        <div className="relative">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Buscar cliente, funcionário ou digitar nome..."
                              value={referralSearch}
                              onChange={e => {
                                setReferralSearch(e.target.value);
                                setShowReferralDropdown(true);
                                setForm(f => ({ ...f, referral_name: e.target.value || null, referral_type: 'external', referral_client_id: null, referral_employee_id: null }));
                              }}
                              onFocus={() => setShowReferralDropdown(true)}
                              onBlur={() => setTimeout(() => setShowReferralDropdown(false), 150)}
                              className="input-dark w-full pr-20"
                            />
                            {form.referral_type && form.referral_name && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{
                                  background: form.referral_type === 'client' ? 'rgba(59,130,246,0.15)' : form.referral_type === 'employee' ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)',
                                  color: form.referral_type === 'client' ? '#93c5fd' : form.referral_type === 'employee' ? '#34d399' : '#94a3b8',
                                  border: `1px solid ${form.referral_type === 'client' ? 'rgba(59,130,246,0.3)' : form.referral_type === 'employee' ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.2)'}`,
                                }}>
                                {form.referral_type === 'client' ? '🏢 Cliente' : form.referral_type === 'employee' ? '👷 Func.' : '👤 Externo'}
                              </span>
                            )}
                          </div>
                          {showReferralDropdown && referralSearch.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-xl" style={{ background: '#0f172a', border: '1px solid rgba(59,130,246,0.2)' }}>
                              {clients.filter(c => c.active && c.name.toLowerCase().includes(referralSearch.toLowerCase())).slice(0, 4).map(c => (
                                <button key={`c-${c.id}`} type="button"
                                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-blue-500/10 transition-colors"
                                  onMouseDown={() => {
                                    setForm(f => ({ ...f, referral_name: c.name, referral_type: 'client', referral_client_id: c.id, referral_employee_id: null }));
                                    setReferralSearch(c.name);
                                    setShowReferralDropdown(false);
                                  }}>
                                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>Cliente</span>
                                  <span className="text-slate-200">{c.name}</span>
                                </button>
                              ))}
                              {employees.filter(e => e.name.toLowerCase().includes(referralSearch.toLowerCase())).slice(0, 4).map(e => (
                                <button key={`e-${e.id}`} type="button"
                                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-emerald-500/10 transition-colors"
                                  onMouseDown={() => {
                                    setForm(f => ({ ...f, referral_name: e.name, referral_type: 'employee', referral_employee_id: e.id, referral_client_id: null }));
                                    setReferralSearch(e.name);
                                    setShowReferralDropdown(false);
                                  }}>
                                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>Func.</span>
                                  <span className="text-slate-200">{e.name}</span>
                                </button>
                              ))}
                              {referralSearch.trim() && (
                                <button type="button"
                                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-500/10 transition-colors"
                                  style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }}
                                  onMouseDown={() => {
                                    setForm(f => ({ ...f, referral_name: referralSearch, referral_type: 'external', referral_client_id: null, referral_employee_id: null }));
                                    setShowReferralDropdown(false);
                                  }}>
                                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8' }}>Externo</span>
                                  <span className="text-slate-400">"{referralSearch}"</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </Field>
                    )}

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
              ) : modalTab === ('negociacao' as any) ? (
                <div className="h-full overflow-y-auto">
                  <div className="p-6 space-y-5">
                    {/* Pricing summary */}
                    <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.12)' }}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Preço & Desconto</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="label-dark mb-1 block">Preço original (R$)</label>
                          <input type="number" step="0.01" value={form.original_price ?? ''}
                            onChange={e => setForm(f => ({ ...f, original_price: parseFloat(e.target.value) || null }))}
                            placeholder="0,00"
                            className="input-dark w-full" />
                        </div>
                        <div>
                          <label className="label-dark mb-1 block">Valor negociado (R$)</label>
                          <input type="number" step="0.01" value={form.value || ''}
                            onChange={e => setForm(f => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                            className="input-dark w-full" />
                        </div>
                        <div>
                          <label className="label-dark mb-1 block">Desconto</label>
                          {form.original_price && form.original_price > 0 ? (() => {
                            const disc = form.original_price - (form.value || 0);
                            const pct = (disc / form.original_price) * 100;
                            return (
                              <div className="input-dark flex items-center gap-2">
                                <span className={`font-semibold ${disc > 0 ? 'text-amber-400' : disc < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                  {disc > 0 ? '-' : disc < 0 ? '+' : ''}{brl(Math.abs(disc))}
                                </span>
                                <span className="text-xs text-slate-500">({Math.abs(pct).toFixed(1)}%)</span>
                              </div>
                            );
                          })() : (
                            <div className="input-dark text-slate-600 text-sm">Informe o preço original</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Payment method */}
                    <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.12)' }}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Forma de Pagamento</p>
                      <div className="grid grid-cols-4 gap-2">
                        {PAYMENT_METHODS.map(m => (
                          <button key={m.value} type="button"
                            onClick={() => setForm(f => ({ ...f, payment_method: f.payment_method === m.value ? null : m.value }))}
                            className="py-2.5 px-3 rounded-xl text-xs font-medium transition-all text-center"
                            style={{
                              background: form.payment_method === m.value ? 'rgba(59,130,246,0.18)' : 'rgba(15,23,42,0.5)',
                              border: `1px solid ${form.payment_method === m.value ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`,
                              color: form.payment_method === m.value ? '#93c5fd' : '#64748b',
                            }}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                      {form.payment_method === 'cartao_credito' && (
                        <div className="flex items-center gap-3">
                          <label className="label-dark shrink-0">Parcelas</label>
                          <div className="flex gap-2 flex-wrap">
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                              <button key={n} type="button"
                                onClick={() => setForm(f => ({ ...f, installments: n }))}
                                className="w-9 h-9 rounded-lg text-xs font-semibold transition-all"
                                style={{
                                  background: (form.installments ?? 1) === n ? 'rgba(59,130,246,0.25)' : 'rgba(15,23,42,0.5)',
                                  border: `1px solid ${(form.installments ?? 1) === n ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.1)'}`,
                                  color: (form.installments ?? 1) === n ? '#93c5fd' : '#64748b',
                                }}>
                                {n === 1 ? 'à\nvista' : `${n}x`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.12)' }}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Observações da negociação</p>
                      <textarea value={form.payment_notes || ''}
                        onChange={e => setForm(f => ({ ...f, payment_notes: e.target.value || null }))}
                        placeholder="Ex: Cliente pediu desconto por volume, parcelamento em 3x no cartão, entrega em 45 dias..."
                        rows={4}
                        className="input-dark w-full resize-none text-sm" />
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
            {modalTab !== 'atividades' && (
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
