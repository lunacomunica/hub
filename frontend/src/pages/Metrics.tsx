import { useState, useEffect } from 'react';
import { req } from '../api';
import { TrendingUp, TrendingDown, Target, DollarSign, Users, Award, BarChart2, Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

// ─── tipos ────────────────────────────────────────────────────────────────────
interface KPIs {
  total_leads: number; leads_a: number; leads_b: number; leads_c: number;
  mql: number; pct_mql: number; pct_lead_a: number;
  investimento: number; cpl: number|null; cpl_a: number|null;
  fechados: number; fechados_a: number; faturamento: number;
  ticket_medio: number|null; roas: number|null; cac: number|null;
  win_rate: number; win_rate_a: number;
}
interface Dashboard { mes: string; kpis: KPIs; goals: Record<string,number>; }
interface CreativeRow {
  criativo: string; campanha: string; leads: number; leads_a: number;
  leads_b: number; leads_c: number; pct_lead_a: number;
  investimento: number; cpl: number|null; cpl_a: number|null;
  fechados: number; faturamento: number; roas: number|null; win_rate_a: number;
}
interface TrendRow { mes: string; leads: number; mql: number; leads_a: number; investimento: number; }
interface Investment { id: number; campanha: string; criativo: string; periodo: string; investimento: number; }

// ─── helpers ─────────────────────────────────────────────────────────────────
const R$ = (v: number|null|undefined) => v == null ? '—' : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0});
const PCT = (v: number|null|undefined) => v == null ? '—' : `${(v*100).toFixed(1)}%`;
const N = (v: number|null|undefined) => v == null ? '—' : v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:1});

function prevMonth(m: string) {
  const [y,mo] = m.split('-').map(Number);
  const d = new Date(y, mo-2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMonth(m: string) {
  const [y,mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtMes(m: string) {
  const [y,mo] = m.split('-');
  return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}
function nowMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

const GOAL_LABELS: Record<string,string> = {
  total_leads: 'Leads totais', mql: 'MQL (A+B)', cpl_a: 'CPL A (R$)',
  fechados: 'Fechamentos', faturamento: 'Faturamento (R$)', roas: 'ROAS',
  win_rate: 'Win Rate (%)', cac: 'CAC (R$)',
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, meta, suffix='', highlight=false, warn=false }: {
  label: string; value: string; meta?: number; suffix?: string; highlight?: boolean; warn?: boolean;
}) {
  const pct = meta && meta > 0 ? (parseFloat(value.replace(/[^\d,]/g,'').replace(',','.')) / meta) * 100 : null;
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '16px 18px', border: `1px solid ${highlight ? 'rgba(99,102,241,0.3)' : warn ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: highlight ? '#a5b4fc' : warn ? '#f87171' : 'var(--text-primary)', lineHeight: 1 }}>{value}{suffix}</div>
      {meta != null && pct != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(pct,100)}%`, background: pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#6366f1', borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{pct.toFixed(0)}% da meta ({N(meta)}{suffix})</div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Metrics() {
  const [tab, setTab]               = useState<'painel'|'criativos'|'dados'>('painel');
  const [mes, setMes]               = useState(nowMes());
  const [dash, setDash]             = useState<Dashboard|null>(null);
  const [creatives, setCreatives]   = useState<CreativeRow[]>([]);
  const [trend, setTrend]           = useState<TrendRow[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading]       = useState(false);

  // form investimento
  const [invForm, setInvForm] = useState({ campanha:'', criativo:'', periodo: `${nowMes()}-01`, investimento:'' });
  const [invSaving, setInvSaving] = useState(false);

  // form metas
  const [goalEdits, setGoalEdits] = useState<Record<string,string>>({});
  const [goalSaving, setGoalSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [d, c, t, i] = await Promise.all([
        req(`/metrics/dashboard?mes=${mes}`) as Promise<Dashboard>,
        req(`/metrics/by-creative?mes=${mes}`) as Promise<CreativeRow[]>,
        req(`/metrics/trend?months=6`) as Promise<TrendRow[]>,
        req(`/metrics/investments?mes=${mes}`) as Promise<Investment[]>,
      ]);
      setDash(d);
      setCreatives(c);
      setTrend(t);
      setInvestments(i);
      // seed goal edits
      const edits: Record<string,string> = {};
      for (const [k,v] of Object.entries(d.goals)) edits[k] = String(v);
      setGoalEdits(edits);
    } catch { /* silent */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [mes]);

  async function saveInvestment() {
    if (!invForm.campanha || !invForm.criativo || !invForm.periodo || !invForm.investimento) return;
    setInvSaving(true);
    try {
      await req('/metrics/investments', { method:'POST', body: JSON.stringify({ ...invForm, investimento: parseFloat(invForm.investimento) }) });
      setInvForm(f => ({ ...f, campanha:'', criativo:'', investimento:'' }));
      load();
    } catch { /* silent */ }
    setInvSaving(false);
  }

  async function deleteInvestment(id: number) {
    await req(`/metrics/investments/${id}`, { method:'DELETE' });
    load();
  }

  async function saveGoals() {
    setGoalSaving(true);
    try {
      await Promise.all(
        Object.entries(goalEdits).filter(([,v]) => v !== '').map(([indicador, meta]) =>
          req('/metrics/goals', { method:'PUT', body: JSON.stringify({ mes: `${mes}-01`, indicador, meta: parseFloat(meta) }) })
        )
      );
      load();
    } catch { /* silent */ }
    setGoalSaving(false);
  }

  const k = dash?.kpis;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--text-primary)', margin:0 }}>Métricas</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>Marketing + Comercial</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setMes(prevMonth(mes))} style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'var(--text-muted)' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', minWidth:160, textAlign:'center', textTransform:'capitalize' }}>{fmtMes(mes)}</span>
          <button onClick={() => setMes(nextMonth(mes))} disabled={mes >= nowMes()} style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'var(--text-muted)', opacity: mes >= nowMes() ? 0.4 : 1 }}>
            <ChevronRight size={14} />
          </button>
          <button onClick={load} style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'var(--text-muted)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {([['painel','Painel Mensal'],['criativos','Por Criativo'],['dados','Investimentos & Metas']] as const).map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'8px 16px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:500,
              color: tab===t ? '#a5b4fc' : 'var(--text-muted)',
              borderBottom: tab===t ? '2px solid #6366f1' : '2px solid transparent', marginBottom:-1 }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── PAINEL ────────────────────────────────────────────────────────── */}
      {tab === 'painel' && (
        <div>
          {/* KPI grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:28 }}>
            <KpiCard label="Leads totais"     value={N(k?.total_leads)}   meta={dash?.goals.total_leads}   highlight />
            <KpiCard label="MQL (A+B)"        value={N(k?.mql)}           meta={dash?.goals.mql}           highlight />
            <KpiCard label="% Lead A"         value={PCT(k?.pct_lead_a)}  />
            <KpiCard label="Investimento"     value={R$(k?.investimento)} />
            <KpiCard label="CPL"              value={R$(k?.cpl)}          />
            <KpiCard label="CPL A"            value={R$(k?.cpl_a)}        meta={dash?.goals.cpl_a}         highlight />
            <KpiCard label="Fechamentos"      value={N(k?.fechados)}      meta={dash?.goals.fechados} />
            <KpiCard label="Win Rate"         value={PCT(k?.win_rate)}    meta={dash?.goals.win_rate ? dash.goals.win_rate/100 : undefined} />
            <KpiCard label="Win Rate A"       value={PCT(k?.win_rate_a)} />
            <KpiCard label="Faturamento"      value={R$(k?.faturamento)}  meta={dash?.goals.faturamento}   highlight />
            <KpiCard label="Ticket médio"     value={R$(k?.ticket_medio)} />
            <KpiCard label="ROAS"             value={k?.roas != null ? `${k.roas.toFixed(1)}x` : '—'} meta={dash?.goals.roas} />
            <KpiCard label="CAC"              value={R$(k?.cac)}          warn={!!(k?.cac && k.cac > 3000)} />
          </div>

          {/* Tendência mensal */}
          {trend.length > 0 && (
            <div style={{ background:'var(--bg-secondary)', borderRadius:12, border:'1px solid var(--border)', padding:'20px 24px', marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:16 }}>Tendência — últimos 6 meses</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ color:'var(--text-muted)' }}>
                      {['Mês','Leads','MQL','Lead A','Investimento'].map(h => (
                        <th key={h} style={{ padding:'6px 12px', textAlign: h==='Mês'?'left':'right', fontWeight:500, borderBottom:'1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map(r => (
                      <tr key={r.mes} style={{ borderBottom:'1px solid var(--border)', background: r.mes===mes ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                        <td style={{ padding:'8px 12px', color:'var(--text-primary)', fontWeight: r.mes===mes ? 700 : 400, textTransform:'capitalize' }}>{new Date(`${r.mes}-01`).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})}</td>
                        <td style={{ padding:'8px 12px', textAlign:'right', color:'var(--text-primary)' }}>{N(r.leads)}</td>
                        <td style={{ padding:'8px 12px', textAlign:'right', color:'#a5b4fc' }}>{N(r.mql)}</td>
                        <td style={{ padding:'8px 12px', textAlign:'right', color:'#10b981' }}>{N(r.leads_a)}</td>
                        <td style={{ padding:'8px 12px', textAlign:'right', color:'var(--text-muted)' }}>{R$(r.investimento as any)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Distribuição de tipos */}
          {k && (
            <div style={{ background:'var(--bg-secondary)', borderRadius:12, border:'1px solid var(--border)', padding:'20px 24px' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:16 }}>Distribuição de leads</div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                {[
                  { label:'Lead A (ICP)', count: k.leads_a, color:'#10b981', desc:'RQE + especialidade-alvo' },
                  { label:'Lead B (Qualificado)', count: k.leads_b, color:'#f59e0b', desc:'RQE + outra esp.' },
                  { label:'Lead C', count: k.leads_c, color:'#6b7280', desc:'Sem RQE / estudante' },
                ].map(item => (
                  <div key={item.label} style={{ flex:1, minWidth:140, background:'var(--bg-primary)', borderRadius:10, padding:'14px 16px', border:`1px solid ${item.color}30` }}>
                    <div style={{ fontSize:22, fontWeight:700, color:item.color }}>{item.count}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', marginTop:2 }}>{item.label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{item.desc}</div>
                    <div style={{ fontSize:11, color:item.color, marginTop:4 }}>{k.total_leads > 0 ? PCT(item.count/k.total_leads) : '0%'} do total</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── POR CRIATIVO ──────────────────────────────────────────────────── */}
      {tab === 'criativos' && (
        <div style={{ background:'var(--bg-secondary)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text-muted)' }}>
            Ranqueado por <strong style={{ color:'#a5b4fc' }}>CPL A</strong> — menor CPL A = criativo mais eficiente para o ICP
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ color:'var(--text-muted)', background:'var(--bg-primary)' }}>
                  {['Criativo','Campanha','Leads','Lead A','% A','Investimento','CPL','CPL A','Fechamentos','Faturamento','ROAS','Win Rate A'].map(h => (
                    <th key={h} style={{ padding:'10px 12px', textAlign: h==='Criativo'||h==='Campanha'?'left':'right', fontWeight:500, borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creatives.length === 0 && (
                  <tr><td colSpan={12} style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>Nenhum dado de atribuição neste mês</td></tr>
                )}
                {[...creatives].sort((a,b) => {
                  if (a.cpl_a == null && b.cpl_a == null) return 0;
                  if (a.cpl_a == null) return 1;
                  if (b.cpl_a == null) return -1;
                  return a.cpl_a - b.cpl_a;
                }).map((r, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding:'9px 12px', color:'var(--text-primary)', fontWeight:500 }}>{r.criativo}</td>
                    <td style={{ padding:'9px 12px', color:'var(--text-muted)' }}>{r.campanha}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>{r.leads}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#10b981', fontWeight:600 }}>{r.leads_a}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color: r.pct_lead_a >= 0.3 ? '#10b981' : r.pct_lead_a >= 0.15 ? '#f59e0b' : '#f87171' }}>{PCT(r.pct_lead_a)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>{R$(r.investimento||null)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>{R$(r.cpl)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#a5b4fc', fontWeight:700 }}>{R$(r.cpl_a)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>{r.fechados}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>{R$(r.faturamento||null)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color: r.roas != null ? (r.roas >= 3 ? '#10b981' : r.roas >= 1 ? '#f59e0b' : '#f87171') : undefined }}>{r.roas != null ? `${r.roas.toFixed(1)}x` : '—'}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right' }}>{PCT(r.win_rate_a||null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INVESTIMENTOS & METAS ─────────────────────────────────────────── */}
      {tab === 'dados' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>

          {/* Investimentos */}
          <div style={{ background:'var(--bg-secondary)', borderRadius:12, border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:16 }}>Investimento por criativo — {fmtMes(mes)}</div>

            {/* Form */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
              <input placeholder="Campanha (ex: C1)" value={invForm.campanha} onChange={e=>setInvForm(f=>({...f,campanha:e.target.value}))}
                style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-primary)', color:'var(--text-primary)', fontSize:12, outline:'none' }} />
              <input placeholder="Criativo (ex: AD01)" value={invForm.criativo} onChange={e=>setInvForm(f=>({...f,criativo:e.target.value}))}
                style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-primary)', color:'var(--text-primary)', fontSize:12, outline:'none' }} />
              <input type="date" value={invForm.periodo} onChange={e=>setInvForm(f=>({...f,periodo:e.target.value}))}
                style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-primary)', color:'var(--text-primary)', fontSize:12, outline:'none' }} />
              <input type="number" placeholder="Investimento (R$)" value={invForm.investimento} onChange={e=>setInvForm(f=>({...f,investimento:e.target.value}))}
                style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-primary)', color:'var(--text-primary)', fontSize:12, outline:'none' }} />
            </div>
            <button onClick={saveInvestment} disabled={invSaving}
              style={{ width:'100%', padding:'8px 0', borderRadius:8, background:'#6366f1', color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:16 }}>
              {invSaving ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar
            </button>

            {/* Lista */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {investments.length === 0 && <div style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', padding:16 }}>Nenhum investimento registrado</div>}
              {investments.map(inv => (
                <div key={inv.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--bg-primary)', borderRadius:8, border:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{inv.criativo} <span style={{ color:'var(--text-muted)', fontWeight:400 }}>· {inv.campanha}</span></div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(inv.periodo).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#a5b4fc' }}>{R$(inv.investimento)}</span>
                    <button onClick={() => deleteInvestment(inv.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:4 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metas */}
          <div style={{ background:'var(--bg-secondary)', borderRadius:12, border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:16 }}>Metas — {fmtMes(mes)}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              {Object.entries(GOAL_LABELS).map(([key, label]) => (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <label style={{ fontSize:12, color:'var(--text-muted)', flex:1, minWidth:0 }}>{label}</label>
                  <input type="number" placeholder="0" value={goalEdits[key] || ''} onChange={e => setGoalEdits(g => ({...g, [key]: e.target.value}))}
                    style={{ width:110, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-primary)', color:'var(--text-primary)', fontSize:12, outline:'none', textAlign:'right' }} />
                </div>
              ))}
            </div>
            <button onClick={saveGoals} disabled={goalSaving}
              style={{ width:'100%', padding:'8px 0', borderRadius:8, background:'var(--bg-primary)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.3)', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {goalSaving ? <RefreshCw size={12} className="animate-spin" /> : <Target size={12} />} Salvar metas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
