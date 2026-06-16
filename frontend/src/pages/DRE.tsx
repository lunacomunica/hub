import { useEffect, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { getRevenues, getExpenses } from '../api';
import type { Revenue, Expense } from '../types';

const brl = (v: number | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number, base: number) => base === 0 ? '—' : `${((v / base) * 100).toFixed(1)}%`;

const now = new Date();
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

// Category name groupings
const REV_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Mensalidades', keys: ['Mensalidade'] },
  { label: 'Projetos', keys: ['Projeto'] },
  { label: 'Consultorias', keys: ['Consultoria'] },
  { label: 'Outros', keys: [] }, // catch-all
];

const EXP_OPERATIONAL: string[] = ['Salários', 'Ferramentas/Software', 'Infraestrutura', 'Outros'];
const EXP_TAXES: string[] = ['Impostos'];
const EXP_VARIABLE: string[] = ['Mídia/Ads', 'Marketing Próprio'];

interface ColData {
  label: string;
  revenues: Revenue[];
  expenses: Expense[];
}

export default function DRE() {
  const [year, setYear] = useState(now.getFullYear());
  const [viewMode, setViewMode] = useState<'year' | 'month'>('year');
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [columns, setColumns] = useState<ColData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      if (viewMode === 'year') {
        const cols: ColData[] = [];
        for (let m = 1; m <= 12; m++) {
          const [revs, exps] = await Promise.all([
            getRevenues({ month: m, year }),
            getExpenses({ month: m, year }),
          ]);
          cols.push({ label: MONTHS_SHORT[m - 1], revenues: revs, expenses: exps });
        }
        setColumns(cols);
      } else {
        const [revs, exps] = await Promise.all([
          getRevenues({ month: selectedMonth, year }),
          getExpenses({ month: selectedMonth, year }),
        ]);
        setColumns([{ label: MONTHS_FULL[selectedMonth - 1], revenues: revs, expenses: exps }]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year, viewMode, selectedMonth]);

  const sumRevByCat = (revs: Revenue[], catNames: string[]): number => {
    if (catNames.length === 0) return 0;
    return revs.filter(r => r.status !== 'cancelado' && catNames.some(n => r.category_name === n)).reduce((s, r) => s + Number(r.amount), 0);
  };
  const sumRevOthers = (revs: Revenue[], usedCats: string[]): number =>
    revs.filter(r => r.status !== 'cancelado' && !usedCats.includes(r.category_name || '')).reduce((s, r) => s + Number(r.amount), 0);
  const sumExpByCat = (exps: Expense[], catNames: string[]): number =>
    exps.filter(e => e.status !== 'cancelado' && catNames.some(n => e.category_name === n)).reduce((s, e) => s + Number(e.amount), 0);

  // Precompute per column
  const usedRevCats = REV_GROUPS.flatMap(g => g.keys);
  const computeCol = (col: ColData) => {
    const mensalidades = sumRevByCat(col.revenues, ['Mensalidade']);
    const projetos = sumRevByCat(col.revenues, ['Projeto']);
    const consultorias = sumRevByCat(col.revenues, ['Consultoria']);
    const bonusExtra = sumRevByCat(col.revenues, ['Bônus/Extra']);
    const outrosRev = sumRevOthers(col.revenues, [...usedRevCats, 'Bônus/Extra']);
    const receitaBruta = mensalidades + projetos + consultorias + bonusExtra + outrosRev;

    const impostos = sumExpByCat(col.expenses, EXP_TAXES);
    const receitaLiquida = receitaBruta - impostos;

    const salarios = sumExpByCat(col.expenses, ['Salários']);
    const ferramentas = sumExpByCat(col.expenses, ['Ferramentas/Software']);
    const infra = sumExpByCat(col.expenses, ['Infraestrutura']);
    const outrosFix = sumExpByCat(col.expenses, ['Outros']);
    const custosOperacionais = salarios + ferramentas + infra + outrosFix;
    const lucroBruto = receitaLiquida - custosOperacionais;

    const midia = sumExpByCat(col.expenses, ['Mídia/Ads']);
    const mktProprio = sumExpByCat(col.expenses, ['Marketing Próprio']);
    const totalVariavel = midia + mktProprio;
    const ebitda = lucroBruto - totalVariavel;
    const lucroLiquido = ebitda;
    const margemLiquida = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

    return { mensalidades, projetos, consultorias, bonusExtra, outrosRev, receitaBruta, impostos, receitaLiquida, salarios, ferramentas, infra, outrosFix, custosOperacionais, lucroBruto, midia, mktProprio, totalVariavel, ebitda, lucroLiquido, margemLiquida };
  };

  const computed = columns.map(computeCol);

  const total = computed.reduce((acc, c) => ({
    mensalidades: acc.mensalidades + c.mensalidades,
    projetos: acc.projetos + c.projetos,
    consultorias: acc.consultorias + c.consultorias,
    bonusExtra: acc.bonusExtra + c.bonusExtra,
    outrosRev: acc.outrosRev + c.outrosRev,
    receitaBruta: acc.receitaBruta + c.receitaBruta,
    impostos: acc.impostos + c.impostos,
    receitaLiquida: acc.receitaLiquida + c.receitaLiquida,
    salarios: acc.salarios + c.salarios,
    ferramentas: acc.ferramentas + c.ferramentas,
    infra: acc.infra + c.infra,
    outrosFix: acc.outrosFix + c.outrosFix,
    custosOperacionais: acc.custosOperacionais + c.custosOperacionais,
    lucroBruto: acc.lucroBruto + c.lucroBruto,
    midia: acc.midia + c.midia,
    mktProprio: acc.mktProprio + c.mktProprio,
    totalVariavel: acc.totalVariavel + c.totalVariavel,
    ebitda: acc.ebitda + c.ebitda,
    lucroLiquido: acc.lucroLiquido + c.lucroLiquido,
    margemLiquida: 0,
  }), {
    mensalidades: 0, projetos: 0, consultorias: 0, bonusExtra: 0, outrosRev: 0,
    receitaBruta: 0, impostos: 0, receitaLiquida: 0, salarios: 0, ferramentas: 0,
    infra: 0, outrosFix: 0, custosOperacionais: 0, lucroBruto: 0, midia: 0,
    mktProprio: 0, totalVariavel: 0, ebitda: 0, lucroLiquido: 0, margemLiquida: 0,
  });
  total.margemLiquida = total.receitaBruta > 0 ? (total.lucroLiquido / total.receitaBruta) * 100 : 0;

  const showTotal = viewMode === 'year';
  const allCols = showTotal ? [...computed, total] : computed;
  const allLabels = showTotal ? [...columns.map(c => c.label), 'Total'] : columns.map(c => c.label);

  const rows: { label: string; key: keyof typeof total; indent?: boolean; section?: boolean; highlight?: boolean; pctOf?: keyof typeof total }[] = [
    { label: 'RECEITA BRUTA', key: 'receitaBruta', section: true },
    { label: 'Mensalidades', key: 'mensalidades', indent: true },
    { label: 'Projetos', key: 'projetos', indent: true },
    { label: 'Consultorias', key: 'consultorias', indent: true },
    { label: 'Bônus/Extra', key: 'bonusExtra', indent: true },
    { label: 'Outros', key: 'outrosRev', indent: true },
    { label: '= RECEITA TOTAL', key: 'receitaBruta', highlight: true },
    { label: 'Impostos', key: 'impostos', indent: true },
    { label: '= RECEITA LÍQUIDA', key: 'receitaLiquida', highlight: true },
    { label: 'CUSTOS OPERACIONAIS', key: 'custosOperacionais', section: true },
    { label: 'Salários', key: 'salarios', indent: true },
    { label: 'Ferramentas/Software', key: 'ferramentas', indent: true },
    { label: 'Infraestrutura', key: 'infra', indent: true },
    { label: 'Outros fixos', key: 'outrosFix', indent: true },
    { label: '= LUCRO BRUTO', key: 'lucroBruto', highlight: true },
    { label: 'DESPESAS VARIÁVEIS', key: 'totalVariavel', section: true },
    { label: 'Mídia/Ads', key: 'midia', indent: true },
    { label: 'Marketing Próprio', key: 'mktProprio', indent: true },
    { label: '= EBITDA', key: 'ebitda', highlight: true },
    { label: '= LUCRO LÍQUIDO', key: 'lucroLiquido', highlight: true },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">DRE — Demonstrativo de Resultado</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(59,130,246,0.2)' }}>
            <button onClick={() => setViewMode('year')} className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'year' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Anual</button>
            <button onClick={() => setViewMode('month')} className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Mensal</button>
          </div>
          {viewMode === 'month' && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="input-dark text-sm py-1.5">
              {MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-dark text-sm py-1.5">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="p-1.5 text-slate-400 hover:text-blue-400"><RefreshCw size={15} /></button>
          <button onClick={() => window.print()} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Printer size={14} /> Imprimir
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-500"></div></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(59,130,246,0.05)', borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
                <th className="th text-left px-4 py-3 min-w-[180px]">Conta</th>
                {allLabels.map((l, i) => (
                  <th key={i} className={`th text-right px-3 py-3 ${i === allLabels.length - 1 && showTotal ? 'text-slate-200' : ''}`}
                    style={i === allLabels.length - 1 && showTotal ? { background: 'rgba(59,130,246,0.1)' } : {}}>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={`${row.highlight ? '' : 'tr'}`}
                  style={row.highlight ? { background: 'rgba(59,130,246,0.06)', borderTop: '1px solid rgba(59,130,246,0.12)', borderBottom: '1px solid rgba(59,130,246,0.12)' } : {}}>
                  <td className={`px-4 py-2.5 ${row.section ? 'font-bold text-blue-400 uppercase text-xs tracking-wide pt-4' : row.highlight ? 'font-bold text-slate-200' : row.indent ? 'pl-8 text-slate-500' : 'text-slate-400'}`}>
                    {row.label}
                  </td>
                  {allCols.map((col, ci) => {
                    const val = col[row.key];
                    const isTotal = ci === allCols.length - 1 && showTotal;
                    const isNeg = ['impostos', 'custosOperacionais', 'salarios', 'ferramentas', 'infra', 'outrosFix', 'totalVariavel', 'midia', 'mktProprio'].includes(row.key);
                    const isHighlight = row.highlight;
                    const isLoss = val < 0;
                    return (
                      <td key={ci} className={`px-3 py-2.5 text-right tabular-nums ${isHighlight ? 'font-bold' : ''} ${isLoss ? 'text-red-400' : isNeg && val > 0 ? 'text-red-400' : isHighlight ? 'text-slate-200' : 'text-slate-400'}`}
                        style={isTotal ? { background: 'rgba(59,130,246,0.08)', fontWeight: 700, color: isLoss ? '#f87171' : '#e2e8f0' } : {}}>
                        {row.section ? (
                          <span className="text-slate-600 text-xs">—</span>
                        ) : (
                          brl(typeof val === 'number' ? (isNeg ? -Math.abs(val) : val) : 0)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Margem líquida */}
              <tr style={{ background: 'rgba(59,130,246,0.08)', borderTop: '2px solid rgba(59,130,246,0.3)' }}>
                <td className="px-4 py-3 font-bold text-blue-400">= MARGEM LÍQUIDA %</td>
                {allCols.map((col, ci) => {
                  const isTotal = ci === allCols.length - 1 && showTotal;
                  return (
                    <td key={ci} className={`px-3 py-3 text-right font-bold tabular-nums ${col.margemLiquida < 0 ? 'text-red-400' : col.margemLiquida >= 20 ? 'text-emerald-400' : 'text-amber-400'}`}
                      style={isTotal ? { background: 'rgba(59,130,246,0.12)' } : {}}>
                      {col.receitaBruta > 0 ? pct(col.lucroLiquido, col.receitaBruta) : '—'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
