import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Camera, Star, Upload, Download, Trash2, Plus, X,
  Briefcase, DollarSign, Calendar, Clock, MessageSquare, FileText,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function timeAtCompany(admissionDate: string): string {
  const admission = new Date(admissionDate);
  const now = new Date();
  const months =
    (now.getFullYear() - admission.getFullYear()) * 12 +
    (now.getMonth() - admission.getMonth());
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}a ${rem}m` : `${years} ${years === 1 ? 'ano' : 'anos'}`;
}

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

// ─── Photo component ──────────────────────────────────────────────────────────

function EmployeePhoto({
  employeeId,
  name,
  color,
}: {
  employeeId: number;
  name: string;
  color: string;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPhoto = async () => {
    try {
      const res = await authFetch(`${BASE}/${employeeId}/photo`);
      if (res.ok) {
        const blob = await res.blob();
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        setPhotoUrl(URL.createObjectURL(blob));
      } else {
        setPhotoUrl(null);
      }
    } catch {
      setPhotoUrl(null);
    }
  };

  useEffect(() => {
    loadPhoto();
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side size guard (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Foto muito grande. Use uma imagem menor que 2MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await authFetch(`${BASE}/${employeeId}/photo`, { method: 'POST', body: fd });
      await loadPhoto();
    } catch {
      alert('Erro ao enviar foto');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Remover foto?')) return;
    await authFetch(`${BASE}/${employeeId}/photo`, { method: 'DELETE' });
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
  };

  return (
    <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          overflow: 'hidden',
          cursor: uploading ? 'wait' : 'pointer',
          position: 'relative',
          border: photoUrl ? '3px solid rgba(59,130,246,0.5)' : '3px solid rgba(59,130,246,0.2)',
          transition: 'border-color 0.2s',
        }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Avatar name={name} color={color} size={120} />
        )}
        {(hovering || uploading) && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            borderRadius: '50%',
          }}>
            {uploading
              ? <div style={{ width: 24, height: 24, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <>
                  <Camera size={24} color="#fff" />
                  <span style={{ fontSize: 10, color: '#fff', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {photoUrl ? 'ALTERAR' : 'ADICIONAR'}
                  </span>
                </>
            }
          </div>
        )}
      </div>
      {/* Remove button — visible on hover when photo exists */}
      {hovering && photoUrl && !uploading && (
        <button
          onClick={handleRemove}
          title="Remover foto"
          style={{
            position: 'absolute', top: 2, right: 2,
            width: 22, height: 22, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10,
          }}
        >
          <X size={11} color="#fff" />
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
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

  // Sync form when employee changes (e.g., after save)
  useEffect(() => {
    setForm({
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
  }, [employee.id]);

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
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Nome completo *">
            <input
              value={form.name}
              onChange={e => f('name', e.target.value)}
              className="input-dark w-full"
              placeholder="Nome do funcionário"
            />
          </Field>
        </div>

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

        <div className="col-span-2">
          <Field label="E-mail">
            <input
              type="email"
              value={form.email}
              onChange={e => f('email', e.target.value)}
              className="input-dark w-full"
              placeholder="email@empresa.com"
            />
          </Field>
        </div>

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

        <div className="col-span-2">
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
        </div>

        <div className="col-span-2">
          <Field label="Observações">
            <textarea
              value={form.notes}
              onChange={e => f('notes', e.target.value)}
              rows={3}
              className="input-dark w-full resize-none"
              placeholder="Notas internas sobre o funcionário..."
            />
          </Field>
        </div>
      </div>

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
      setScForm({
        new_salary: scForm.new_salary,
        new_role: scForm.new_role,
        change_date: new Date().toISOString().split('T')[0],
        reason: '',
      });
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
      setOtForm({
        date: new Date().toISOString().split('T')[0],
        hours: 1,
        rate_multiplier: 1.5,
        notes: '',
      });
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

  const ferias = (employee.salary * (4 / 3)) / 12;
  const decimo = employee.salary / 12;
  const total = ferias + decimo;

  return (
    <div className="space-y-6">
      {/* Provisions */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Provisões mensais</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <div className="label-dark text-xs mb-1">Férias</div>
            <div className="text-base font-bold text-amber-400">{fmt(ferias)}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="label-dark text-xs mb-1">13º</div>
            <div className="text-base font-bold text-blue-400">{fmt(decimo)}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="label-dark text-xs mb-1">Total</div>
            <div className="text-base font-bold text-white">{fmt(total)}</div>
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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

  const downloadPayslip = (pid: number) => {
    const token = localStorage.getItem('auth-token');
    const url = `${BASE}/${employee.id}/payslips/${pid}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    window.open(url, '_blank');
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
            <div key={p.id} className="card p-3 flex items-center justify-between gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
            <div key={fb.id} className="card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={FEEDBACK_BADGE[fb.type] || 'badge badge-slate'}>
                    {FEEDBACK_LABEL[fb.type] || fb.type}
                  </span>
                  <span className="text-xs text-slate-500">{fb.author}</span>
                  <span className="text-xs text-slate-600">{fmtDate(fb.feedback_date)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {fb.rating != null && <StarRating value={fb.rating} readOnly />}
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
        <div className="grid grid-cols-2 gap-3">
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'financeiro' | 'holerites' | 'feedbacks'>('dados');

  const loadEmployee = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authFetch(`${BASE}/${id}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setEmployee(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployee();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

  if (notFound || !employee) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/pessoas')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={15} /> Voltar para Pessoas
        </button>
        <div className="card p-12 text-center">
          <p className="text-slate-500">Funcionário não encontrado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/pessoas')}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft size={15} /> Voltar para Pessoas
      </button>

      {/* Hero card */}
      <div className="card p-6">
        <div className="flex items-start gap-6">
          {/* Photo */}
          <EmployeePhoto
            employeeId={employee.id}
            name={employee.name}
            color={employee.avatar_color}
          />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-white leading-tight">{employee.name}</h1>
                <p className="text-slate-400 mt-0.5">
                  {employee.role}
                  {employee.department && (
                    <span className="text-slate-500"> • {employee.department}</span>
                  )}
                </p>
              </div>
              <span className={STATUS_BADGE[employee.status] || 'badge badge-slate'}>
                {STATUS_LABEL[employee.status] || employee.status}
              </span>
            </div>

            <div className="flex items-center gap-4 mt-3 flex-wrap text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-500" />
                Admitido em {fmtDate(employee.admission_date)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-slate-500" />
                {timeAtCompany(employee.admission_date)}
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign size={13} className="text-slate-500" />
                <span className="text-emerald-400 font-semibold">{fmt(employee.salary)}/mês</span>
              </span>
              {employee.department && (
                <span className="flex items-center gap-1.5">
                  <Briefcase size={13} className="text-slate-500" />
                  {employee.department}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div
          className="flex text-sm border-b"
          style={{ borderColor: 'rgba(59,130,246,0.15)' }}
        >
          {(['dados', 'financeiro', 'holerites', 'feedbacks'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #60a5fa' : '2px solid transparent',
                cursor: 'pointer',
                padding: '0.625rem 1.25rem',
                color: activeTab === tab ? '#60a5fa' : '#64748b',
                fontWeight: activeTab === tab ? 600 : 400,
                transition: 'color 0.15s',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="pt-6">
          {activeTab === 'dados' && (
            <TabDados
              employee={employee}
              onSaved={updated => setEmployee(updated)}
            />
          )}
          {activeTab === 'financeiro' && <TabFinanceiro employee={employee} />}
          {activeTab === 'holerites' && <TabHolerites employee={employee} />}
          {activeTab === 'feedbacks' && <TabFeedbacks employee={employee} />}
        </div>
      </div>
    </div>
  );
}
