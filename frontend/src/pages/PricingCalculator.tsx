import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getClients, getCompanySettings } from '../api';
import type { CompanySettings } from '../api';
import type { AgencyClient } from '../types';
import { Info } from 'lucide-react';

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const tooltipStyle = { backgroundColor: '#0c0c26', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, color: '#e2e8f0' };

export default function PricingCalculator() {
  const [hours, setHours] = useState(80);
  const [directCosts, setDirectCosts] = useState(0);
  const [toolCosts, setToolCosts] = useState(0);
  const [margin, setMargin] = useState(30);
  const [taxes, setTaxes] = useState(15);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [churnCount, setChurnCount] = useState(1);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [overrideHourCost, setOverrideHourCost] = useState<number | null>(null);

  useEffect(() => {
    getClients().then(setClients).catch(() => {});
    getCompanySettings().then(s => { setSettings(s); }).catch(() => {});
  }, []);

  const companyHourCost = settings?.hour_cost ?? 0;
  const effectiveHourCost = overrideHourCost !== null ? overrideHourCost : companyHourCost;

  // Cost calculation using real company hour cost
  const laborCost = hours * effectiveHourCost;
  const baseCost = laborCost + directCosts + toolCosts;
  const withMargin = baseCost > 0 ? baseCost / (1 - margin / 100) : 0;
  const withTaxes = withMargin > 0 ? withMargin / (1 - taxes / 100) : 0;
  const effectiveMarginEarned = withTaxes > 0 ? ((withTaxes - baseCost) / withTaxes) * 100 : 0;

  const totalMRR = clients.filter(c => c.active).reduce((s, c) => s + Number(c.monthly_fee), 0);
  const churnImpact = clients
    .filter(c => c.active)
    .sort((a, b) => Number(b.monthly_fee) - Number(a.monthly_fee))
    .slice(0, churnCount)
    .reduce((s, c) => s + Number(c.monthly_fee), 0);

  const buckets = [
    { label: 'Até R$2k', min: 0, max: 2000 },
    { label: 'R$2k–5k', min: 2000, max: 5000 },
    { label: 'R$5k–10k', min: 5000, max: 10000 },
    { label: 'R$10k+', min: 10000, max: Infinity },
  ];
  const pieData = buckets
    .map(b => ({
      name: b.label,
      value: clients.filter(c => c.active && Number(c.monthly_fee) >= b.min && Number(c.monthly_fee) < b.max).length,
    }))
    .filter(d => d.value > 0);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Calculadora de Precificação</h1>

      {/* Company hour cost reference banner */}
      {settings && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm flex-wrap" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
          <Info size={15} className="text-indigo-400 shrink-0" />
          <span className="text-slate-300">
            Custo real da hora da agência:
            <strong className="text-indigo-300 ml-1">{brl(companyHourCost)}/h</strong>
            <span className="text-slate-500 ml-1">
              (fixos {brl(settings.avg_fixed_costs)} ÷ {settings.monthly_billable_hours}h/mês)
            </span>
          </span>
          {overrideHourCost !== null && (
            <button
              onClick={() => setOverrideHourCost(null)}
              className="text-xs text-indigo-400 underline ml-auto"
            >
              Usar custo real
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Input form */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-300">Parâmetros do Projeto</h2>

          <Row label="Horas estimadas no projeto">
            <input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} className="input-dark w-full" />
          </Row>

          <div>
            <label className="label-dark mb-1.5 block">
              Custo/hora utilizado (R$)
              {overrideHourCost !== null && <span className="text-xs text-amber-400 ml-2">— personalizado</span>}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={overrideHourCost !== null ? overrideHourCost : companyHourCost}
                onChange={e => setOverrideHourCost(Number(e.target.value))}
                className="input-dark flex-1"
              />
              {overrideHourCost !== null && (
                <button onClick={() => setOverrideHourCost(null)} className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">
                  ↩ resetar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">Pré-preenchido com o custo real da agência. Altere para simular cenários.</p>
          </div>

          <Row label="Custos diretos do projeto (R$)">
            <input type="number" step="0.01" value={directCosts} onChange={e => setDirectCosts(Number(e.target.value))} className="input-dark w-full" />
          </Row>
          <Row label="Custo de ferramentas/software (R$)">
            <input type="number" step="0.01" value={toolCosts} onChange={e => setToolCosts(Number(e.target.value))} className="input-dark w-full" />
          </Row>
          <Row label="Margem de lucro desejada (%)">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={80} value={margin} onChange={e => setMargin(Number(e.target.value))} className="flex-1 accent-blue-500" />
              <span className="w-10 text-sm font-medium text-slate-300">{margin}%</span>
            </div>
          </Row>
          <Row label="Impostos estimados (%)">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={40} value={taxes} onChange={e => setTaxes(Number(e.target.value))} className="flex-1 accent-blue-500" />
              <span className="w-10 text-sm font-medium text-slate-300">{taxes}%</span>
            </div>
          </Row>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-300 mb-4">Resultado</h2>
            <div className="space-y-2">
              <ResultRow label={`Mão de obra (${hours}h × ${brl(effectiveHourCost)})`} value={brl(laborCost)} />
              <ResultRow label="Custos diretos" value={brl(directCosts)} />
              <ResultRow label="Ferramentas" value={brl(toolCosts)} />
              <div className="pt-2" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                <ResultRow label="Custo real do projeto" value={brl(baseCost)} bold />
              </div>
              <ResultRow label={`Margem (${margin}%)`} value={brl(withMargin - baseCost)} color="emerald" />
              <div className="pt-2" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
                <ResultRow label="Valor com margem" value={brl(withMargin)} bold />
              </div>
              <ResultRow label={`Impostos (${taxes}%)`} value={brl(withTaxes - withMargin)} color="red" />
              <div className="pt-3 mt-1" style={{ borderTop: '1px solid rgba(59,130,246,0.2)' }}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">Valor final sugerido</span>
                  <span className="text-2xl font-bold text-blue-400">{brl(withTaxes)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-slate-500">Margem real (após impostos)</span>
                  <span className={`text-xs font-semibold ${effectiveMarginEarned >= margin ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {effectiveMarginEarned.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Period comparison */}
          <div className="card p-4">
            <h2 className="font-semibold text-slate-300 mb-3 text-sm">Comparativo por período</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <div className="label-dark mb-1">Mensal</div>
                <div className="font-bold text-blue-400">{brl(withTaxes)}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <div className="label-dark mb-1">Trimestral</div>
                <div className="font-bold text-purple-400">{brl(withTaxes * 3)}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="label-dark mb-1">Anual</div>
                <div className="font-bold text-emerald-400">{brl(withTaxes * 12)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recurrence analysis */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-300 mb-4">Análise de Recorrência</h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-3">
            <div>
              <div className="label-dark mb-1">MRR Total (clientes ativos)</div>
              <div className="metric-md text-emerald-400">{brl(totalMRR)}</div>
            </div>
            <div>
              <div className="label-dark mb-1">Receita Anual Projetada</div>
              <div className="text-xl font-bold text-slate-300">{brl(totalMRR * 12)}</div>
            </div>
            <div>
              <div className="label-dark mb-1">Clientes ativos</div>
              <div className="text-xl font-bold text-slate-300">{clients.filter(c => c.active).length}</div>
            </div>
          </div>

          <div>
            <div className="label-dark mb-2">Distribuição por faixa de mensalidade</div>
            {pieData.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-500 text-sm">Sem dados</div>
            ) : (
              <div className="flex items-center gap-3">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={25}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v} cliente${v > 1 ? 's' : ''}`} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-400">{d.name}</span>
                      <span className="font-medium ml-1 text-slate-300">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="label-dark">Calculadora de Churn</div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Se perder quantos clientes?</label>
              <input
                type="number"
                min={0}
                max={clients.filter(c => c.active).length}
                value={churnCount}
                onChange={e => setChurnCount(Number(e.target.value))}
                className="input-dark w-full"
              />
            </div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="label-dark mb-1">Impacto no MRR</div>
              <div className="text-xl font-bold text-red-400">-{brl(churnImpact)}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <div className="label-dark mb-1">MRR resultante</div>
              <div className="text-xl font-bold text-slate-300">{brl(Math.max(0, totalMRR - churnImpact))}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-dark mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function ResultRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  const textColor = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-slate-400';
  return (
    <div className="flex justify-between items-center text-sm">
      <span className={`${bold ? 'font-semibold text-slate-300' : 'text-slate-500'}`}>{label}</span>
      <span className={`${bold ? 'font-bold text-slate-200' : textColor}`}>{value}</span>
    </div>
  );
}
