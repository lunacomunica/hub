import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Save, X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { req } from '../api';

const fmt = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BILLING_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  mrr:   { label: 'MRR', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  tcv:   { label: 'TCV', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  ambos: { label: 'MRR + TCV', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
};

const STAGE_COLORS: Record<string, { color: string; label: string }> = {
  lead:       { color: '#64748b', label: 'Lead' },
  contato:    { color: '#60a5fa', label: 'Contato' },
  proposta:   { color: '#f59e0b', label: 'Proposta' },
  negociacao: { color: '#a78bfa', label: 'Negociação' },
  fechado:    { color: '#34d399', label: 'Fechado' },
  perdido:    { color: '#f87171', label: 'Perdido' },
};

interface Pair { id: string; q: string; a: string; }
interface Opp  { id: number; title: string; stage: string; value: number; client_name: string | null; created_at: string; }

interface ProductFull {
  id: number;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  billing_type: string;
  active: number;
  promise: string | null;
  target_audience: string | null;
  deliverables: string | null;
  differentials: string | null;
  objections: string | null;
  pitch: string | null;
  faqs: string | null;
  social_proof: string | null;
  opportunities: Opp[];
}

function parseJSON<T>(v: string | null, fallback: T): T {
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

// ── Editable list (deliverables — simple strings) ─────────────────────────────
function EditableList({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  const add = () => { if (input.trim()) { onChange([...value, input.trim()]); setInput(''); } };
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-emerald-400 shrink-0">✓</span>
          <span className="flex-1 text-slate-200">{item}</span>
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 transition-colors shrink-0"><X size={12} /></button>
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        <input className="input-dark flex-1 text-sm" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} placeholder={placeholder} />
        <button onClick={add} className="btn-primary text-xs px-3">+</button>
      </div>
    </div>
  );
}

// ── Editable pair list (objections / faqs) ────────────────────────────────────
function EditablePairs({ value, onChange, labelQ, labelA, placeholderQ, placeholderA }: {
  value: Pair[];
  onChange: (v: Pair[]) => void;
  labelQ: string; labelA: string;
  placeholderQ: string; placeholderA: string;
}) {
  const add = () => onChange([...value, { id: crypto.randomUUID(), q: '', a: '' }]);
  const update = (id: string, field: 'q' | 'a', v: string) =>
    onChange(value.map(p => p.id === id ? { ...p, [field]: v } : p));
  const remove = (id: string) => onChange(value.filter(p => p.id !== id));

  return (
    <div className="space-y-3">
      {value.map((pair, i) => (
        <div key={pair.id} className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">#{i+1}</span>
            <button onClick={() => remove(pair.id)} className="text-slate-600 hover:text-red-400 transition-colors"><X size={12} /></button>
          </div>
          <div>
            <label className="label-dark block mb-1">{labelQ}</label>
            <input className="input-dark w-full text-sm" value={pair.q} onChange={e => update(pair.id, 'q', e.target.value)} placeholder={placeholderQ} />
          </div>
          <div>
            <label className="label-dark block mb-1">{labelA}</label>
            <textarea className="input-dark w-full text-sm" rows={2} value={pair.a} onChange={e => update(pair.id, 'a', e.target.value)} placeholder={placeholderA} />
          </div>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
        <Plus size={14} /> Adicionar
      </button>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, children, accent }: { title: string; icon: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h3>
        {accent && <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent}40, transparent)` }} />}
      </div>
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [product, setProduct] = useState<ProductFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [promise, setPromise] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [differentials, setDifferentials] = useState('');
  const [objections, setObjections] = useState<Pair[]>([]);
  const [pitch, setPitch] = useState('');
  const [faqs, setFaqs] = useState<Pair[]>([]);
  const [socialProof, setSocialProof] = useState('');
  const [oppFilter, setOppFilter] = useState<'all' | 'open' | 'fechado' | 'perdido'>('all');
  const [oppExpanded, setOppExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await req<any>(`/products/${id}`);
    setProduct(res);
    // seed form
    setPromise(res.promise || '');
    setTargetAudience(res.target_audience || '');
    setDeliverables(parseJSON<string[]>(res.deliverables, []));
    setDifferentials(res.differentials || '');
    setObjections(parseJSON<Pair[]>(res.objections, []));
    setPitch(res.pitch || '');
    setFaqs(parseJSON<Pair[]>(res.faqs, []));
    setSocialProof(res.social_proof || '');
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!product) return;
    setSaving(true);
    await req(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: product.name, price: product.price, category: product.category,
        description: product.description, active: product.active, billing_type: product.billing_type,
        promise, target_audience: targetAudience, deliverables,
        differentials, objections, pitch, faqs, social_proof: socialProof,
      }),
    }).catch(() => null);
    setSaving(false);
    setEditing(false);
    load();
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500" />
    </div>
  );

  if (!product) return <div className="text-slate-500 py-16 text-center">Produto não encontrado.</div>;

  const bt = BILLING_CONFIG[product.billing_type || 'mrr'];
  const parsedDeliverables = editing ? deliverables : parseJSON<string[]>(product.deliverables, []);
  const parsedObjections  = editing ? objections  : parseJSON<Pair[]>(product.objections, []);
  const parsedFaqs        = editing ? faqs        : parseJSON<Pair[]>(product.faqs, []);

  const opps = product.opportunities || [];
  const openOpps   = opps.filter(o => !['fechado','perdido'].includes(o.stage));
  const closedOpps = opps.filter(o => o.stage === 'fechado');
  const lostOpps   = opps.filter(o => o.stage === 'perdido');
  const filteredOpps = oppFilter === 'all' ? opps : oppFilter === 'open' ? openOpps : oppFilter === 'fechado' ? closedOpps : lostOpps;
  const visibleOpps = oppExpanded ? filteredOpps : filteredOpps.slice(0, 5);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/produtos')}
            className="mt-1 p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors"
            style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: bt.bg, color: bt.color }}>{bt.label}</span>
              {product.category && <span className="text-xs text-slate-400">{product.category}</span>}
              {!product.active && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>Inativo</span>}
            </div>
            <h1 className="text-2xl font-bold text-white">{product.name}</h1>
            {product.description && <p className="text-sm text-slate-400 mt-1">{product.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-500 mb-0.5">Preço</div>
            <div className="text-xl font-bold" style={{ color: '#34d399' }}>{fmt(product.price)}</div>
          </div>
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Pencil size={14} /> Editar
            </button>
          )}
          {isAdmin && editing && (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); load(); }} className="btn-ghost text-sm px-3 py-2">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
                <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sections grid */}
      <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))' }}>

        {/* Promessa */}
        <Section title="Promessa do produto" icon="🎯" accent="#3b82f6">
          {editing ? (
            <textarea className="input-dark w-full text-sm" rows={4} value={promise}
              onChange={e => setPromise(e.target.value)}
              placeholder="Qual transformação ou resultado o cliente obtém com esse produto?" />
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {product.promise || <span className="text-slate-600 italic">Não preenchido</span>}
            </p>
          )}
        </Section>

        {/* Público ideal */}
        <Section title="Público ideal" icon="👥" accent="#818cf8">
          {editing ? (
            <textarea className="input-dark w-full text-sm" rows={4} value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              placeholder="Quem é o cliente ideal? Em que momento da vida/negócio ele compra?" />
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {product.target_audience || <span className="text-slate-600 italic">Não preenchido</span>}
            </p>
          )}
        </Section>

        {/* Entregáveis */}
        <Section title="Entregáveis" icon="📦" accent="#34d399">
          {editing ? (
            <EditableList value={deliverables} onChange={setDeliverables} placeholder="Ex: Relatório mensal de performance" />
          ) : parsedDeliverables.length > 0 ? (
            <div className="space-y-2">
              {parsedDeliverables.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                  <span className="text-slate-300">{d}</span>
                </div>
              ))}
            </div>
          ) : <span className="text-sm text-slate-600 italic">Não preenchido</span>}
        </Section>

        {/* Diferenciais */}
        <Section title="Diferenciais" icon="⭐" accent="#f59e0b">
          {editing ? (
            <textarea className="input-dark w-full text-sm" rows={4} value={differentials}
              onChange={e => setDifferentials(e.target.value)}
              placeholder="O que separa esse produto da concorrência? Por que comprar da Luna?" />
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {product.differentials || <span className="text-slate-600 italic">Não preenchido</span>}
            </p>
          )}
        </Section>

        {/* Objeções */}
        <Section title="Objeções comuns + como contornar" icon="🛡️" accent="#a78bfa">
          {editing ? (
            <EditablePairs
              value={objections} onChange={setObjections}
              labelQ="Objeção do cliente" labelA="Como contornar"
              placeholderQ='Ex: "Está caro demais"'
              placeholderA="Argumento pronto para o comercial..." />
          ) : parsedObjections.length > 0 ? (
            <div className="space-y-3">
              {parsedObjections.map((pair, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
                  <div className="text-sm font-medium text-slate-200 mb-1.5">"{pair.q}"</div>
                  <div className="text-sm text-slate-400 leading-relaxed">{pair.a}</div>
                </div>
              ))}
            </div>
          ) : <span className="text-sm text-slate-600 italic">Não preenchido</span>}
        </Section>

        {/* Pitch */}
        <Section title="Pitch sugerido" icon="💬" accent="#60a5fa">
          {editing ? (
            <textarea className="input-dark w-full text-sm" rows={5} value={pitch}
              onChange={e => setPitch(e.target.value)}
              placeholder={'Como apresentar esse produto:\n1. Abrir com o problema do cliente\n2. ...'} />
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {product.pitch || <span className="text-slate-600 italic">Não preenchido</span>}
            </p>
          )}
        </Section>

        {/* FAQs */}
        <Section title="Perguntas frequentes" icon="❓" accent="#f472b6">
          {editing ? (
            <EditablePairs
              value={faqs} onChange={setFaqs}
              labelQ="Pergunta do cliente" labelA="Resposta"
              placeholderQ='Ex: "Quanto tempo leva para ver resultados?"'
              placeholderA="Resposta clara e objetiva..." />
          ) : parsedFaqs.length > 0 ? (
            <div className="space-y-3">
              {parsedFaqs.map((pair, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-sm font-medium text-slate-200">{pair.q}</div>
                  <div className="text-sm text-slate-400 leading-relaxed">{pair.a}</div>
                </div>
              ))}
            </div>
          ) : <span className="text-sm text-slate-600 italic">Não preenchido</span>}
        </Section>

        {/* Prova social */}
        <Section title="Prova social" icon="🏆" accent="#34d399">
          {editing ? (
            <textarea className="input-dark w-full text-sm" rows={4} value={socialProof}
              onChange={e => setSocialProof(e.target.value)}
              placeholder="Cases, depoimentos, resultados reais de clientes que já compraram..." />
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {product.social_proof || <span className="text-slate-600 italic">Não preenchido</span>}
            </p>
          )}
        </Section>
      </div>

      {/* Oportunidades vinculadas */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Oportunidades no CRM</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span><span className="text-emerald-400 font-semibold">{closedOpps.length}</span> fechadas</span>
              <span><span className="text-blue-400 font-semibold">{openOpps.length}</span> em aberto</span>
              <span><span className="text-red-400 font-semibold">{lostOpps.length}</span> perdidas</span>
            </div>
            <div className="flex gap-1">
              {(['all','open','fechado','perdido'] as const).map(f => (
                <button key={f} onClick={() => setOppFilter(f)}
                  className="text-xs px-2 py-1 rounded-md transition-all"
                  style={{ background: oppFilter === f ? 'rgba(59,130,246,0.2)' : 'rgba(15,23,42,0.5)', border: `1px solid ${oppFilter === f ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.08)'}`, color: oppFilter === f ? '#93c5fd' : '#64748b' }}>
                  {f === 'all' ? 'Todas' : f === 'open' ? 'Abertas' : f === 'fechado' ? 'Fechadas' : 'Perdidas'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredOpps.length === 0 ? (
          <p className="text-sm text-slate-600 py-4 text-center">Nenhuma oportunidade encontrada.</p>
        ) : (
          <>
            <div className="space-y-2">
              {visibleOpps.map(opp => {
                const sc = STAGE_COLORS[opp.stage] ?? { color: '#64748b', label: opp.stage };
                return (
                  <div key={opp.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(59,130,246,0.08)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{opp.title}</div>
                      {opp.client_name && <div className="text-xs text-slate-500 truncate">{opp.client_name}</div>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: `${sc.color}18`, color: sc.color, border: `1px solid ${sc.color}30` }}>
                      {sc.label}
                    </span>
                    <span className="text-sm font-semibold shrink-0" style={{ color: '#34d399' }}>{fmt(opp.value ?? 0)}</span>
                  </div>
                );
              })}
            </div>
            {filteredOpps.length > 5 && (
              <button onClick={() => setOppExpanded(p => !p)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors mx-auto">
                {oppExpanded ? <><ChevronUp size={14} /> Ver menos</> : <><ChevronDown size={14} /> Ver todas ({filteredOpps.length})</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
