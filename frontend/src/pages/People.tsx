import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, X, Star, Upload, Download, Trash2, Plus,
  Briefcase, DollarSign, Calendar, MessageSquare, FileText,
  FileUp, CheckCircle, AlertCircle, Loader,
} from 'lucide-react';

const BASE = '/api/employees';

function authFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem('auth-token');
  return fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => (d ? d.split('-').reverse().join('/') : '—');

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Employee {
  id: number;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  department: string | null;
  salary: number;
  admission_date: string;
  status: 'ativo' | 'ferias' | 'licenca' | 'inativo';
  notes: string | null;
  avatar_color: string;
  provision_ferias_monthly?: number;
  provision_decimo_monthly?: number;
  provision_total_monthly?: number;
}

interface SalaryChange {
  id: number;
  change_date: string;
  previous_role: string | null;
  new_role: string | null;
  previous_salary: number;
  new_salary: number;
  reason: string | null;
}

interface Overtime {
  id: number;
  date: string;
  hours: number;
  rate_multiplier: number;
  value: number;
  notes: string | null;
}

interface Payslip {
  id: number;
  month: number;
  year: number;
  filename: string;
  gross_salary: number;
  net_salary: number;
  deductions: number;
}

interface Feedback {
  id: number;
  feedback_date: string;
  author: string;
  type: 'positivo' | 'construtivo' | 'avaliacao';
  content: string;
  rating: number | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  ativo: 'badge badge-green',
  ferias: 'badge badge-blue',
  licenca: 'badge badge-amber',
  inativo: 'badge badge-slate',
};

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  ferias: 'Férias',
  licenca: 'Licença',
  inativo: 'Inativo',
};

const FEEDBACK_BADGE: Record<string, string> = {
  positivo: 'badge badge-green',
  construtivo: 'badge badge-amber',
  avaliacao: 'badge badge-blue',
};

const FEEDBACK_LABEL: Record<string, string> = {
  positivo: 'Positivo',
  construtivo: 'Construtivo',
  avaliacao: 'Avaliação',
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-dark mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color || '#3b82f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Star rating ──────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(i)}
          className={readOnly ? 'cursor-default' : 'cursor-pointer'}
          style={{ background: 'none', border: 'none', padding: 1 }}
        >
          <Star
            size={16}
            fill={i <= value ? '#eab308' : 'none'}
            stroke={i <= value ? '#eab308' : '#475569'}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Batch import interfaces ──────────────────────────────────────────────────

interface ParseResult {
  name_in_pdf: string;
  gross: number;
  deductions: number;
  net: number;
  matched_employee_id: number | null;
  matched_employee_name: string | null;
  confidence: 'alta' | 'media' | 'baixa' | 'nao_encontrado';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function People() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);

  // ── stats aggregates ──────────────────────────────────────────────────────
  const activeEmployees = employees.filter(e => e.status === 'ativo');
  const totalSalary = activeEmployees.reduce((s, e) => s + e.salary, 0);
  const totalFerias = activeEmployees.reduce((s, e) => s + (e.salary * (4 / 3)) / 12, 0);
  const totalDecimo = activeEmployees.reduce((s, e) => s + e.salary / 12, 0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await authFetch(BASE).then(r => r.json());
      setEmployees(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Pessoas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Equipe, contratos, provisões e holerites</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBatchImport(true)}
            className="btn-ghost flex items-center gap-2 text-sm"
            style={{ border: '1px solid rgba(59,130,246,0.3)' }}
          >
            <FileUp size={15} /> Importar Folha
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus size={15} /> Novo Funcionário
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Users size={13} /> Funcionários ativos
          </div>
          <div className="metric">{activeEmployees.length}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <DollarSign size={13} /> Folha mensal total
          </div>
          <div className="metric text-emerald-400">{fmt(totalSalary)}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Calendar size={13} /> Provisão férias/mês
          </div>
          <div className="metric text-amber-400">{fmt(totalFerias)}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Briefcase size={13} /> Provisão 13º/mês
          </div>
          <div className="metric text-blue-400">{fmt(totalDecimo)}</div>
        </div>
      </div>

      {/* Employee grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-500">Carregando...</div>
      ) : employees.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-500 mb-4">Nenhum funcionário cadastrado ainda</p>
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">
            Cadastrar primeiro funcionário
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map(emp => (
            <button
              key={emp.id}
              onClick={() => navigate(`/pessoas/${emp.id}`)}
              className="card p-5 text-left hover:border-blue-500/30 transition-colors w-full"
              style={{ cursor: 'pointer' }}
            >
              <div className="flex items-start gap-3">
                <Avatar name={emp.name} color={emp.avatar_color} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-100 truncate">{emp.name}</p>
                    <span className={STATUS_BADGE[emp.status] || 'badge badge-slate'}>
                      {STATUS_LABEL[emp.status] || emp.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 truncate mt-0.5">{emp.role}</p>
                  {emp.department && (
                    <p className="text-xs text-slate-500 truncate">{emp.department}</p>
                  )}
                  <p className="text-sm font-semibold text-emerald-400 mt-2">{fmt(emp.salary)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New employee modal */}
      {showNew && (
        <NewEmployeeModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      )}

      {/* Batch import modal */}
      {showBatchImport && (
        <BatchImportModal
          employees={employees}
          onClose={() => setShowBatchImport(false)}
          onSaved={() => {
            setShowBatchImport(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── Tab: Dados ───────────────────────────────────────────────────────────────

function TabDados({
  employee,
  onSaved,
}: {
  employee: Employee;
  onSaved: (updated: Employee) => void;
}) {
  const [form, setForm] = useState({
    name: employee.name,
    role: employee.role,
    department: employee.department || '',
    email: employee.email || '',
    phone: employee.phone || '',
    cpf: employee.cpf || '',
    salary: employee.salary,
    admission_date: employee.admission_date,
    status: employee.status,
    notes: employee.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return alert('Nome é obrigatório');
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const updated = await res.json();
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirm('Desativar este funcionário? O registro será mantido no sistema.')) return;
    setDeactivating(true);
    try {
      const res = await authFetch(`${BASE}/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status: 'inativo' }),
      });
      const updated = await res.json();
      onSaved(updated);
    } finally {
      setDeactivating(false);
    }
  };

  const f = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="space-y-4">
      <Field label="Nome completo *">
        <input
          value={form.name}
          onChange={e => f('name', e.target.value)}
          className="input-dark w-full"
          placeholder="Nome do funcionário"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cargo">
          <input
            value={form.role}
            onChange={e => f('role', e.target.value)}
            className="input-dark w-full"
            placeholder="Ex: Designer"
          />
        </Field>
        <Field label="Departamento">
          <input
            value={form.department}
            onChange={e => f('department', e.target.value)}
            className="input-dark w-full"
            placeholder="Ex: Criação"
          />
        </Field>
      </div>

      <Field label="E-mail">
        <input
          type="email"
          value={form.email}
          onChange={e => f('email', e.target.value)}
          className="input-dark w-full"
          placeholder="email@empresa.com"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone">
          <input
            value={form.phone}
            onChange={e => f('phone', e.target.value)}
            className="input-dark w-full"
            placeholder="(11) 99999-9999"
          />
        </Field>
        <Field label="CPF">
          <input
            value={form.cpf}
            onChange={e => f('cpf', e.target.value)}
            className="input-dark w-full"
            placeholder="000.000.000-00"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Salário (R$)">
          <input
            type="number"
            step="0.01"
            value={form.salary}
            onChange={e => f('salary', parseFloat(e.target.value) || 0)}
            className="input-dark w-full"
          />
        </Field>
        <Field label="Admissão">
          <input
            type="date"
            value={form.admission_date}
            onChange={e => f('admission_date', e.target.value)}
            className="input-dark w-full"
          />
        </Field>
      </div>

      <Field label="Status">
        <select
          value={form.status}
          onChange={e => f('status', e.target.value as Employee['status'])}
          className="input-dark w-full"
        >
          <option value="ativo">Ativo</option>
          <option value="ferias">Férias</option>
          <option value="licenca">Licença</option>
          <option value="inativo">Inativo</option>
        </select>
      </Field>

      <Field label="Observações">
        <textarea
          value={form.notes}
          onChange={e => f('notes', e.target.value)}
          rows={3}
          className="input-dark w-full resize-none"
          placeholder="Notas internas sobre o funcionário..."
        />
      </Field>

      <button onClick={save} disabled={saving} className="btn-primary w-full text-sm">
        {saving ? 'Salvando...' : 'Salvar alterações'}
      </button>

      {/* Danger zone */}
      <div
        className="rounded-lg p-4 mt-2"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
      >
        <p className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wide">Zona de perigo</p>
        <button
          onClick={deactivate}
          disabled={deactivating || form.status === 'inativo'}
          className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40"
        >
          {deactivating ? 'Desativando...' : 'Desativar funcionário'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Financeiro ──────────────────────────────────────────────────────────

function TabFinanceiro({ employee }: { employee: Employee }) {
  const [salaryHistory, setSalaryHistory] = useState<SalaryChange[]>([]);
  const [overtime, setOvertime] = useState<Overtime[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingOT, setLoadingOT] = useState(true);

  const [scForm, setScForm] = useState({
    new_salary: employee.salary,
    new_role: employee.role,
    change_date: new Date().toISOString().split('T')[0],
    reason: '',
  });
  const [savingSC, setSavingSC] = useState(false);

  const [otForm, setOtForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours: 1,
    rate_multiplier: 1.5,
    notes: '',
  });
  const [savingOT, setSavingOT] = useState(false);

  const hourlyRate = employee.salary / 220;

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await authFetch(`${BASE}/${employee.id}/salary-changes`).then(r => r.json());
      setSalaryHistory(Array.isArray(data) ? data : []);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadOT = async () => {
    setLoadingOT(true);
    try {
      const data = await authFetch(`${BASE}/${employee.id}/overtime`).then(r => r.json());
      setOvertime(Array.isArray(data) ? data : []);
    } finally {
      setLoadingOT(false);
    }
  };

  useEffect(() => {
    loadHistory();
    loadOT();
  }, [employee.id]);

  const addSalaryChange = async () => {
    if (!scForm.new_salary) return alert('Informe o novo salário');
    setSavingSC(true);
    try {
      await authFetch(`${BASE}/${employee.id}/salary-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scForm),
      });
      setScForm({ new_salary: scForm.new_salary, new_role: scForm.new_role, change_date: new Date().toISOString().split('T')[0], reason: '' });
      loadHistory();
    } finally {
      setSavingSC(false);
    }
  };

  const addOvertime = async () => {
    setSavingOT(true);
    try {
      const value = hourlyRate * otForm.hours * otForm.rate_multiplier;
      await authFetch(`${BASE}/${employee.id}/overtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...otForm, value }),
      });
      setOtForm({ date: new Date().toISOString().split('T')[0], hours: 1, rate_multiplier: 1.5, notes: '' });
      loadOT();
    } finally {
      setSavingOT(false);
    }
  };

  const deleteOT = async (id: number) => {
    if (!confirm('Remover horas extras?')) return;
    await authFetch(`${BASE}/${employee.id}/overtime/${id}`, { method: 'DELETE' });
    loadOT();
  };

  // Provisions
  const ferias = (employee.salary * (4 / 3)) / 12;
  const decimo = employee.salary / 12;
  const total = ferias + decimo;

  return (
    <div className="space-y-6">
      {/* Provisions */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Provisões mensais</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="card p-3 text-center">
            <div className="label-dark text-xs mb-1">Férias</div>
            <div className="text-sm font-bold text-amber-400">{fmt(ferias)}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="label-dark text-xs mb-1">13º</div>
            <div className="text-sm font-bold text-blue-400">{fmt(decimo)}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="label-dark text-xs mb-1">Total</div>
            <div className="text-sm font-bold text-white">{fmt(total)}</div>
          </div>
        </div>
      </div>

      {/* Salary history */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Histórico salarial</p>
        {loadingHistory ? (
          <p className="text-slate-500 text-sm">Carregando...</p>
        ) : salaryHistory.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma alteração registrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(59,130,246,0.12)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left px-3 py-2">Data</th>
                  <th className="th text-left px-3 py-2">Cargo ant.</th>
                  <th className="th text-left px-3 py-2">Cargo novo</th>
                  <th className="th text-right px-3 py-2">Sal. ant.</th>
                  <th className="th text-right px-3 py-2">Sal. novo</th>
                  <th className="th text-left px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {salaryHistory.map(sc => (
                  <tr key={sc.id} className="tr">
                    <td className="td px-3 py-2 whitespace-nowrap">{fmtDate(sc.change_date)}</td>
                    <td className="td px-3 py-2">{sc.previous_role || '—'}</td>
                    <td className="td px-3 py-2">{sc.new_role || '—'}</td>
                    <td className="td px-3 py-2 text-right text-slate-400">{fmt(sc.previous_salary)}</td>
                    <td className="td px-3 py-2 text-right text-emerald-400 font-semibold">{fmt(sc.new_salary)}</td>
                    <td className="td px-3 py-2 max-w-[120px] truncate">{sc.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add salary change */}
        <div
          className="rounded-lg p-4 mt-3 space-y-3"
          style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}
        >
          <p className="text-xs font-semibold text-slate-400">Registrar alteração salarial</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Novo salário (R$)">
              <input
                type="number"
                step="0.01"
                value={scForm.new_salary}
                onChange={e => setScForm(f => ({ ...f, new_salary: parseFloat(e.target.value) || 0 }))}
                className="input-dark w-full text-sm"
              />
            </Field>
            <Field label="Novo cargo">
              <input
                value={scForm.new_role}
                onChange={e => setScForm(f => ({ ...f, new_role: e.target.value }))}
                className="input-dark w-full text-sm"
                placeholder="Cargo"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data">
              <input
                type="date"
                value={scForm.change_date}
                onChange={e => setScForm(f => ({ ...f, change_date: e.target.value }))}
                className="input-dark w-full text-sm"
              />
            </Field>
            <Field label="Motivo">
              <input
                value={scForm.reason}
                onChange={e => setScForm(f => ({ ...f, reason: e.target.value }))}
                className="input-dark w-full text-sm"
                placeholder="Ex: Promoção"
              />
            </Field>
          </div>
          <button
            onClick={addSalaryChange}
            disabled={savingSC}
            className="btn-primary text-xs flex items-center gap-1"
          >
            <Plus size={13} /> {savingSC ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>

      {/* Overtime */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Horas extras</p>
        <p className="text-xs text-slate-500 mb-2">
          Valor/hora base: {fmt(hourlyRate)} (salário ÷ 220)
        </p>
        {loadingOT ? (
          <p className="text-slate-500 text-sm">Carregando...</p>
        ) : overtime.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma hora extra registrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(59,130,246,0.12)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
                  <th className="th text-left px-3 py-2">Data</th>
                  <th className="th text-right px-3 py-2">Horas</th>
                  <th className="th text-right px-3 py-2">Mult.</th>
                  <th className="th text-right px-3 py-2">Valor</th>
                  <th className="th text-left px-3 py-2">Notas</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {overtime.map(ot => (
                  <tr key={ot.id} className="tr">
                    <td className="td px-3 py-2 whitespace-nowrap">{fmtDate(ot.date)}</td>
                    <td className="td px-3 py-2 text-right">{ot.hours}h</td>
                    <td className="td px-3 py-2 text-right">{ot.rate_multiplier}x</td>
                    <td className="td px-3 py-2 text-right text-emerald-400 font-semibold">{fmt(ot.value)}</td>
                    <td className="td px-3 py-2 max-w-[100px] truncate">{ot.notes || '—'}</td>
                    <td className="td px-3 py-2">
                      <button
                        onClick={() => deleteOT(ot.id)}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add overtime */}
        <div
          className="rounded-lg p-4 mt-3 space-y-3"
          style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}
        >
          <p className="text-xs font-semibold text-slate-400">Registrar horas extras</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data">
              <input
                type="date"
                value={otForm.date}
                onChange={e => setOtForm(f => ({ ...f, date: e.target.value }))}
                className="input-dark w-full text-sm"
              />
            </Field>
            <Field label="Horas">
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={otForm.hours}
                onChange={e => setOtForm(f => ({ ...f, hours: parseFloat(e.target.value) || 1 }))}
                className="input-dark w-full text-sm"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Multiplicador">
              <select
                value={otForm.rate_multiplier}
                onChange={e => setOtForm(f => ({ ...f, rate_multiplier: parseFloat(e.target.value) }))}
                className="input-dark w-full text-sm"
              >
                <option value={1.5}>1.5x (50%)</option>
                <option value={2.0}>2.0x (100%)</option>
              </select>
            </Field>
            <Field label="Notas">
              <input
                value={otForm.notes}
                onChange={e => setOtForm(f => ({ ...f, notes: e.target.value }))}
                className="input-dark w-full text-sm"
                placeholder="Opcional"
              />
            </Field>
          </div>
          <div className="text-xs text-slate-500">
            Valor estimado:{' '}
            <span className="text-emerald-400 font-semibold">
              {fmt(hourlyRate * otForm.hours * otForm.rate_multiplier)}
            </span>
          </div>
          <button
            onClick={addOvertime}
            disabled={savingOT}
            className="btn-primary text-xs flex items-center gap-1"
          >
            <Plus size={13} /> {savingOT ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Holerites ───────────────────────────────────────────────────────────

function TabHolerites({ employee }: { employee: Employee }) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  const [upForm, setUpForm] = useState({
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    gross_salary: employee.salary,
    net_salary: employee.salary,
    deductions: 0,
  });

  const loadPayslips = async () => {
    setLoading(true);
    try {
      const data = await authFetch(`${BASE}/${employee.id}/payslips`).then(r => r.json());
      setPayslips(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayslips();
  }, [employee.id]);

  const uploadPayslip = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Selecione um arquivo PDF');
    if (!file.name.toLowerCase().endsWith('.pdf')) return alert('Apenas arquivos PDF são aceitos');

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('month', String(upForm.month));
      fd.append('year', String(upForm.year));
      fd.append('gross_salary', String(upForm.gross_salary));
      fd.append('net_salary', String(upForm.net_salary));
      fd.append('deductions', String(upForm.deductions));

      await authFetch(`${BASE}/${employee.id}/payslips`, { method: 'POST', body: fd });
      if (fileRef.current) fileRef.current.value = '';
      loadPayslips();
    } finally {
      setUploading(false);
    }
  };

  const downloadPayslip = async (pid: number) => {
    try {
      const res = await authFetch(`${BASE}/${employee.id}/payslips/${pid}/download`);
      if (!res.ok) return alert('Arquivo não encontrado');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holerite-${employee.name}-${pid}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao baixar holerite');
    }
  };

  const deletePayslip = async (pid: number) => {
    if (!confirm('Excluir este holerite?')) return;
    await authFetch(`${BASE}/${employee.id}/payslips/${pid}`, { method: 'DELETE' });
    loadPayslips();
  };

  const filtered = payslips.filter(p => {
    if (filterMonth && String(p.month) !== filterMonth) return false;
    if (filterYear && String(p.year) !== filterYear) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="input-dark text-sm flex-1"
        >
          <option value="">Todos os meses</option>
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={String(i + 1)}>{m}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Ano"
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="input-dark text-sm w-24"
        />
      </div>

      {/* List */}
      {loading ? (
        <p className="text-slate-500 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={28} className="mx-auto text-slate-600 mb-2" />
          <p className="text-slate-500 text-sm">Nenhum holerite encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div
              key={p.id}
              className="card p-3 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200">
                  {MONTHS[p.month - 1]} / {p.year}
                </p>
                <p className="text-xs text-slate-500 truncate">{p.filename}</p>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="text-emerald-400">Bruto: {fmt(p.gross_salary)}</span>
                  <span className="text-blue-400">Líquido: {fmt(p.net_salary)}</span>
                  <span className="text-red-400">Desc.: {fmt(p.deductions)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => downloadPayslip(p.id)}
                  className="text-slate-400 hover:text-blue-400"
                  title="Baixar"
                >
                  <Download size={15} />
                </button>
                <button
                  onClick={() => deletePayslip(p.id)}
                  className="text-slate-500 hover:text-red-400"
                  title="Excluir"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div
        className="rounded-lg p-4 space-y-3"
        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}
      >
        <p className="text-xs font-semibold text-slate-400">Enviar holerite</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Mês">
            <select
              value={upForm.month}
              onChange={e => setUpForm(f => ({ ...f, month: parseInt(e.target.value) }))}
              className="input-dark w-full text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Ano">
            <input
              type="number"
              value={upForm.year}
              onChange={e => setUpForm(f => ({ ...f, year: parseInt(e.target.value) || today.getFullYear() }))}
              className="input-dark w-full text-sm"
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Sal. bruto">
            <input
              type="number"
              step="0.01"
              value={upForm.gross_salary}
              onChange={e => setUpForm(f => ({ ...f, gross_salary: parseFloat(e.target.value) || 0 }))}
              className="input-dark w-full text-sm"
            />
          </Field>
          <Field label="Sal. líquido">
            <input
              type="number"
              step="0.01"
              value={upForm.net_salary}
              onChange={e => setUpForm(f => ({ ...f, net_salary: parseFloat(e.target.value) || 0 }))}
              className="input-dark w-full text-sm"
            />
          </Field>
          <Field label="Descontos">
            <input
              type="number"
              step="0.01"
              value={upForm.deductions}
              onChange={e => setUpForm(f => ({ ...f, deductions: parseFloat(e.target.value) || 0 }))}
              className="input-dark w-full text-sm"
            />
          </Field>
        </div>
        <Field label="Arquivo PDF">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="input-dark w-full text-sm file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500"
          />
        </Field>
        <button
          onClick={uploadPayslip}
          disabled={uploading}
          className="btn-primary text-xs flex items-center gap-1"
        >
          <Upload size={13} /> {uploading ? 'Enviando...' : 'Enviar holerite'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Feedbacks ───────────────────────────────────────────────────────────

function TabFeedbacks({ employee }: { employee: Employee }) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    author: '',
    type: 'positivo' as Feedback['type'],
    content: '',
    rating: 5,
    feedback_date: new Date().toISOString().split('T')[0],
  });

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      const data = await authFetch(`${BASE}/${employee.id}/feedbacks`).then(r => r.json());
      setFeedbacks(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, [employee.id]);

  const addFeedback = async () => {
    if (!form.author.trim()) return alert('Informe o autor do feedback');
    if (!form.content.trim()) return alert('Informe o conteúdo do feedback');
    setSaving(true);
    try {
      await authFetch(`${BASE}/${employee.id}/feedbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm({
        author: '',
        type: 'positivo',
        content: '',
        rating: 5,
        feedback_date: new Date().toISOString().split('T')[0],
      });
      loadFeedbacks();
    } finally {
      setSaving(false);
    }
  };

  const deleteFeedback = async (fid: number) => {
    if (!confirm('Excluir este feedback?')) return;
    await authFetch(`${BASE}/${employee.id}/feedbacks/${fid}`, { method: 'DELETE' });
    loadFeedbacks();
  };

  return (
    <div className="space-y-5">
      {/* List */}
      {loading ? (
        <p className="text-slate-500 text-sm">Carregando...</p>
      ) : feedbacks.length === 0 ? (
        <div className="card p-8 text-center">
          <MessageSquare size={28} className="mx-auto text-slate-600 mb-2" />
          <p className="text-slate-500 text-sm">Nenhum feedback registrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map(fb => (
            <div
              key={fb.id}
              className="card p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={FEEDBACK_BADGE[fb.type] || 'badge badge-slate'}>
                    {FEEDBACK_LABEL[fb.type] || fb.type}
                  </span>
                  <span className="text-xs text-slate-500">{fb.author}</span>
                  <span className="text-xs text-slate-600">{fmtDate(fb.feedback_date)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {fb.rating != null && (
                    <StarRating value={fb.rating} readOnly />
                  )}
                  <button
                    onClick={() => deleteFeedback(fb.id)}
                    className="text-slate-500 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{fb.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add feedback */}
      <div
        className="rounded-lg p-4 space-y-3"
        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}
      >
        <p className="text-xs font-semibold text-slate-400">Registrar feedback</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Autor">
            <input
              value={form.author}
              onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
              className="input-dark w-full text-sm"
              placeholder="Quem avaliou"
            />
          </Field>
          <Field label="Data">
            <input
              type="date"
              value={form.feedback_date}
              onChange={e => setForm(f => ({ ...f, feedback_date: e.target.value }))}
              className="input-dark w-full text-sm"
            />
          </Field>
        </div>
        <Field label="Tipo">
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as Feedback['type'] }))}
            className="input-dark w-full text-sm"
          >
            <option value="positivo">Positivo</option>
            <option value="construtivo">Construtivo</option>
            <option value="avaliacao">Avaliação</option>
          </select>
        </Field>
        <Field label="Conteúdo">
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={3}
            className="input-dark w-full text-sm resize-none"
            placeholder="Descreva o feedback..."
          />
        </Field>
        <div>
          <label className="label-dark mb-1 block text-xs">Avaliação</label>
          <StarRating value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
        </div>
        <button
          onClick={addFeedback}
          disabled={saving}
          className="btn-primary text-xs flex items-center gap-1"
        >
          <Plus size={13} /> {saving ? 'Salvando...' : 'Registrar feedback'}
        </button>
      </div>
    </div>
  );
}

// ─── Batch Import Modal ───────────────────────────────────────────────────────

const CONFIDENCE_BADGE: Record<string, { label: string; color: string }> = {
  alta:           { label: 'Alta',        color: '#22c55e' },
  media:          { label: 'Média',       color: '#eab308' },
  baixa:          { label: 'Baixa',       color: '#f97316' },
  nao_encontrado: { label: 'Não achado',  color: '#ef4444' },
};

function BatchImportModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date();

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const [tempId, setTempId] = useState('');
  const [results, setResults] = useState<ParseResult[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  // overrides: map from pdf name → employee_id (allows user to change match)
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});

  const parse = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Selecione um arquivo PDF');
    setError('');
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const res = await authFetch(`${BASE}/payslips/batch-parse`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Erro ao processar PDF');
      setTempId(data.temp_id);
      setResults(data.results);
      // init overrides from matched results
      const init: Record<string, number | null> = {};
      for (const r of data.results) init[r.name_in_pdf] = r.matched_employee_id;
      setOverrides(init);
      setStep('preview');
    } catch {
      setError('Erro de conexão ao processar PDF');
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    const entries = results
      .map(r => ({
        employee_id: overrides[r.name_in_pdf] ?? r.matched_employee_id,
        gross: r.gross,
        deductions: r.deductions,
        net: r.net,
      }))
      .filter(e => e.employee_id != null);

    if (entries.length === 0) return setError('Nenhum funcionário vinculado. Corrija os vínculos antes de salvar.');

    setError('');
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/payslips/batch-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_id: tempId, month, year, entries }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Erro ao salvar holerites');
      setSavedCount(data.saved);
      setStep('done');
    } catch {
      setError('Erro de conexão ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const linkedCount = results.filter(r => (overrides[r.name_in_pdf] ?? r.matched_employee_id) != null).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="modal-card w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <div>
            <h3 className="font-semibold text-white">Importar Folha de Holerites</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 'upload' && 'Envie o PDF com todos os holerites da folha'}
              {step === 'preview' && `${results.length} funcionários encontrados — revise e confirme`}
              {step === 'done' && `${savedCount} holerites salvos com sucesso`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto space-y-4">

          {/* ── Step: upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mês de competência">
                  <select
                    value={month}
                    onChange={e => setMonth(parseInt(e.target.value))}
                    className="input-dark w-full"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ano">
                  <input
                    type="number"
                    value={year}
                    onChange={e => setYear(parseInt(e.target.value) || today.getFullYear())}
                    className="input-dark w-full"
                  />
                </Field>
              </div>
              <Field label="Arquivo PDF da folha">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  className="input-dark w-full text-sm file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-600 file:text-white hover:file:bg-blue-500"
                />
              </Field>
              <div
                className="rounded-lg p-3 text-xs text-slate-400"
                style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}
              >
                <strong className="text-slate-300">Como funciona:</strong> O sistema lê o PDF, identifica cada funcionário pelo nome e extrai bruto, descontos e líquido. Você poderá corrigir os vínculos antes de salvar.
              </div>
            </div>
          )}

          {/* ── Step: preview ── */}
          {step === 'preview' && (
            <div className="space-y-3">
              {results.map(r => {
                const assignedId = overrides[r.name_in_pdf] ?? r.matched_employee_id;
                const conf = CONFIDENCE_BADGE[r.confidence];
                return (
                  <div
                    key={r.name_in_pdf}
                    className="rounded-lg p-4 space-y-2"
                    style={{
                      background: 'rgba(15,23,42,0.7)',
                      border: `1px solid ${assignedId ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.3)'}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 mb-0.5">Nome no PDF</p>
                        <p className="text-sm font-semibold text-slate-200 truncate">{r.name_in_pdf}</p>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
                        style={{ background: conf.color + '20', color: conf.color }}
                      >
                        {conf.label}
                      </span>
                    </div>

                    {/* Employee selector */}
                    <div>
                      <label className="label-dark text-xs mb-1 block">Vincular ao funcionário</label>
                      <select
                        value={assignedId ?? ''}
                        onChange={e => setOverrides(o => ({
                          ...o,
                          [r.name_in_pdf]: e.target.value ? parseInt(e.target.value) : null,
                        }))}
                        className="input-dark w-full text-sm"
                      >
                        <option value="">— não vincular —</option>
                        {employees.map(e => (
                          <option key={e.id} value={e.id}>{e.name} · {e.role}</option>
                        ))}
                      </select>
                    </div>

                    {/* Values */}
                    <div className="flex items-center gap-4 text-xs pt-1">
                      <span>
                        <span className="text-slate-500">Bruto: </span>
                        <span className="text-emerald-400 font-semibold">{fmt(r.gross)}</span>
                      </span>
                      <span>
                        <span className="text-slate-500">Desc: </span>
                        <span className="text-red-400 font-semibold">{fmt(r.deductions)}</span>
                      </span>
                      <span>
                        <span className="text-slate-500">Líquido: </span>
                        <span className="text-blue-400 font-semibold">{fmt(r.net)}</span>
                      </span>
                    </div>
                  </div>
                );
              })}

              <div className="text-xs text-slate-500 text-center pt-1">
                {linkedCount} de {results.length} funcionários vinculados
              </div>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <CheckCircle size={40} className="text-emerald-400" />
              <p className="text-lg font-semibold text-white">Holerites salvos!</p>
              <p className="text-sm text-slate-400">
                {savedCount} holerites de {MONTHS[month - 1]} / {year} foram distribuídos automaticamente.
              </p>
              <p className="text-xs text-slate-500">
                Acesse o perfil de cada funcionário para visualizar e baixar.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 rounded-lg p-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
          {step === 'done' ? (
            <button onClick={() => { onSaved(); }} className="btn-primary text-sm">
              Fechar
            </button>
          ) : (
            <>
              <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
              {step === 'upload' && (
                <button onClick={parse} disabled={parsing} className="btn-primary text-sm flex items-center gap-2">
                  {parsing ? <><Loader size={14} className="animate-spin" /> Processando...</> : <><FileUp size={14} /> Processar PDF</>}
                </button>
              )}
              {step === 'preview' && (
                <>
                  <button onClick={() => setStep('upload')} className="btn-ghost text-sm">
                    ← Voltar
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || linkedCount === 0}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {saving ? <><Loader size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle size={14} /> Salvar {linkedCount} holerites</>}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New employee modal ───────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#6366f1',
];

function NewEmployeeModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    role: '',
    department: '',
    email: '',
    phone: '',
    cpf: '',
    salary: 0,
    admission_date: new Date().toISOString().split('T')[0],
    status: 'ativo' as Employee['status'],
    notes: '',
    avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return alert('Nome é obrigatório');
    if (!form.role.trim()) return alert('Cargo é obrigatório');
    setSaving(true);
    try {
      await authFetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const f = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="modal-card w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)' }}>
          <h3 className="font-semibold text-white">Novo Funcionário</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <Field label="Nome completo *">
            <input
              value={form.name}
              onChange={e => f('name', e.target.value)}
              className="input-dark w-full"
              placeholder="Nome do funcionário"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cargo *">
              <input
                value={form.role}
                onChange={e => f('role', e.target.value)}
                className="input-dark w-full"
                placeholder="Ex: Designer"
              />
            </Field>
            <Field label="Departamento">
              <input
                value={form.department}
                onChange={e => f('department', e.target.value)}
                className="input-dark w-full"
                placeholder="Ex: Criação"
              />
            </Field>
          </div>

          <Field label="E-mail">
            <input
              type="email"
              value={form.email}
              onChange={e => f('email', e.target.value)}
              className="input-dark w-full"
              placeholder="email@empresa.com"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone">
              <input
                value={form.phone}
                onChange={e => f('phone', e.target.value)}
                className="input-dark w-full"
                placeholder="(11) 99999-9999"
              />
            </Field>
            <Field label="CPF">
              <input
                value={form.cpf}
                onChange={e => f('cpf', e.target.value)}
                className="input-dark w-full"
                placeholder="000.000.000-00"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Salário (R$)">
              <input
                type="number"
                step="0.01"
                value={form.salary}
                onChange={e => f('salary', parseFloat(e.target.value) || 0)}
                className="input-dark w-full"
              />
            </Field>
            <Field label="Data de admissão">
              <input
                type="date"
                value={form.admission_date}
                onChange={e => f('admission_date', e.target.value)}
                className="input-dark w-full"
              />
            </Field>
          </div>

          <Field label="Status">
            <select
              value={form.status}
              onChange={e => f('status', e.target.value as Employee['status'])}
              className="input-dark w-full"
            >
              <option value="ativo">Ativo</option>
              <option value="ferias">Férias</option>
              <option value="licenca">Licença</option>
              <option value="inativo">Inativo</option>
            </select>
          </Field>

          <div>
            <label className="label-dark mb-2 block">Cor do avatar</label>
            <div className="flex items-center gap-2 flex-wrap">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => f('avatar_color', c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: c,
                    border: form.avatar_color === c ? '2px solid #fff' : '2px solid transparent',
                    outline: form.avatar_color === c ? `2px solid ${c}` : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <div className="ml-2">
                <Avatar name={form.name || 'AB'} color={form.avatar_color} size={28} />
              </div>
            </div>
          </div>

          <Field label="Observações">
            <textarea
              value={form.notes}
              onChange={e => f('notes', e.target.value)}
              rows={2}
              className="input-dark w-full resize-none"
              placeholder="Notas opcionais"
            />
          </Field>
        </div>

        <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Salvando...' : 'Cadastrar funcionário'}
          </button>
        </div>
      </div>
    </div>
  );
}
