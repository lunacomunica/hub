import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { req } from '../api';
import { useTheme } from '../context/ThemeContext';
import { TrendingUp, TrendingDown, DollarSign, Users, Briefcase, Target } from 'lucide-react';

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${Number(v).toFixed(1)}%`;

interface CompanyData {
  id: number;
  name: string;
  color: string;
  revenue: number;
  expenses: number;
  profit: number;
  profit_margin: number;
  active_clients: number;
  open_opportunities: number;
  won_value: number;
}

interface ConsolidatedData {
  companies: CompanyData[];
  totals: {
    revenue: number;
    expenses: number;
    profit: number;
    profit_margin: number;
    active_clients: number;
    open_opportunities: number;
    won_value: number;
  };
  trend: Record<string, unknown>[];
}

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: any;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-card)',
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {Icon && <Icon size={14} style={{ color: color || 'var(--text-secondary)' }} />}
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Consolidado() {
  const now = new Date();
  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<ConsolidatedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendMetric, setTrendMetric] = useState<'profit' | 'revenue' | 'expenses'>('profit');
  const { theme } = useTheme();

  const tooltipStyle = theme === 'dark'
    ? { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' }
    : { backgroundColor: '#ffffff', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, color: '#1e293b' };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (viewMode === 'monthly') params.set('month', String(month));
      const result = await req<ConsolidatedData>(`/companies/consolidated?${params}`);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year, viewMode]);

  const periodLabel = viewMode === 'annual'
    ? String(year)
    : `${MONTHS[month - 1]} ${year}`;

  const companies = data?.companies ?? [];
  const totals = data?.totals;
  const trend = data?.trend ?? [];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Consolidado
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Comparativo financeiro entre empresas
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-input)' }}>
            {(['monthly', 'annual'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                background: viewMode === m ? 'var(--blue)' : 'transparent',
                color: viewMode === m ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
                {m === 'monthly' ? 'Mensal' : 'Anual'}
              </button>
            ))}
          </div>

          {viewMode === 'monthly' && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-input)',
              background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer',
            }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}

          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{
            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-input)',
            background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer',
          }}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando...</div>
      ) : !data || companies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Nenhuma empresa encontrada.</div>
      ) : (
        <>
          {/* Consolidated totals */}
          {totals && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-label)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                Consolidado — {periodLabel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                <StatCard label="Receita total" value={brl(totals.revenue)} icon={TrendingUp} color="var(--green)" />
                <StatCard label="Despesas total" value={brl(totals.expenses)} icon={TrendingDown} color="var(--red)" />
                <StatCard
                  label="Lucro total"
                  value={brl(totals.profit)}
                  sub={pct(totals.profit_margin) + ' margem'}
                  icon={DollarSign}
                  color={totals.profit >= 0 ? 'var(--green)' : 'var(--red)'}
                />
                <StatCard label="Clientes ativos" value={String(totals.active_clients)} icon={Users} />
                <StatCard label="Oportunidades" value={String(totals.open_opportunities)} icon={Briefcase} />
                <StatCard label="Vendas fechadas" value={brl(totals.won_value)} icon={Target} color="var(--blue)" />
              </div>
            </div>
          )}

          {/* Per-company cards */}
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-label)', letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              Por empresa
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {companies.map(c => (
                <div key={c.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                  borderRadius: 14, overflow: 'hidden',
                }}>
                  {/* Color bar */}
                  <div style={{ height: 4, background: c.color }} />
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.name}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Receita</div>
                        <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.95rem' }}>{brl(c.revenue)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Despesas</div>
                        <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.95rem' }}>{brl(c.expenses)}</div>
                      </div>
                    </div>

                    {/* Profit row */}
                    <div style={{
                      background: c.profit >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
                      border: `1px solid ${c.profit >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                      borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Lucro</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: c.profit >= 0 ? 'var(--green)' : 'var(--red)', fontSize: '0.95rem' }}>
                          {brl(c.profit)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{pct(c.profit_margin)} margem</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', marginBottom: 1 }}>Clientes</div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.active_clients}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', marginBottom: 1 }}>Oportunidades</div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.open_opportunities}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', marginBottom: 1 }}>Vendas fechadas</div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--blue)' }}>{brl(c.won_value)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison bar chart */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-card)',
            borderRadius: 14, padding: '20px 24px', marginBottom: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                Receita vs Despesas — {periodLabel}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={companies.map(c => ({ name: c.name, Receita: c.revenue, Despesas: c.expenses, Lucro: c.profit, _color: c.color }))}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => brl(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Bar dataKey="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Lucro" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 6-month trend */}
          {trend.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-card)',
              borderRadius: 14, padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  Tendência — últimos 6 meses
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['profit', 'revenue', 'expenses'] as const).map(m => (
                    <button key={m} onClick={() => setTrendMetric(m)} style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-input)',
                      background: trendMetric === m ? 'var(--blue)' : 'transparent',
                      color: trendMetric === m ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    }}>
                      {m === 'profit' ? 'Lucro' : m === 'revenue' ? 'Receita' : 'Despesas'}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                  {companies.map(c => (
                    <Line
                      key={c.id}
                      type="monotone"
                      dataKey={`${trendMetric}_${c.id}`}
                      name={c.name}
                      stroke={c.color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: c.color }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey={`${trendMetric}_total`}
                    name="Total"
                    stroke="var(--text-secondary)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
