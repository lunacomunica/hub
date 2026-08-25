import { useState, useEffect } from 'react';
import { Plus, Pencil, Users, X, Check, Loader2, UserMinus, UserPlus } from 'lucide-react';
import { req, getUsers } from '../api';
import type { User } from '../types';
import { useCompany } from '../context/CompanyContext';

interface Company {
  id: number;
  name: string;
  slug: string;
  color: string;
  active: number;
  user_count?: number;
}

interface CompanyUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: number;
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#22c55e', '#14b8a6', '#eab308', '#ef4444',
  '#6366f1', '#06b6d4',
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', financeiro: 'Financeiro', comercial: 'Comercial',
};

export default function Empresas() {
  const { companies: ctxCompanies, switchCompany, currentCompany } = useCompany();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Create / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: '', color: COLORS[0], active: 1 });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Users panel (per company)
  const [usersPanel, setUsersPanel] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [toAdd, setToAdd] = useState<number | ''>('');
  const [addingSaving, setAddingSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [cos, users] = await Promise.all([
        req<Company[]>('/companies'),
        getUsers(),
      ]);
      setCompanies(cos);
      setAllUsers(users);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', color: COLORS[0], active: 1 });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({ name: c.name, color: c.color, active: c.active });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editing) {
        await req(`/companies/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: form.name, color: form.color, active: form.active }),
        });
      } else {
        await req('/companies', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, color: form.color }),
        });
      }
      setModalOpen(false);
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function openUsers(c: Company) {
    setUsersPanel(c);
    setToAdd('');
    setUsersLoading(true);
    try {
      const users = await req<CompanyUser[]>(`/companies/${c.id}/users`);
      setCompanyUsers(users);
    } catch { setCompanyUsers([]); }
    finally { setUsersLoading(false); }
  }

  async function handleAddUser() {
    if (!usersPanel || !toAdd) return;
    setAddingSaving(true);
    try {
      await req(`/companies/${usersPanel.id}/users`, {
        method: 'POST',
        body: JSON.stringify({ user_id: toAdd }),
      });
      const users = await req<CompanyUser[]>(`/companies/${usersPanel.id}/users`);
      setCompanyUsers(users);
      setToAdd('');
      await load();
    } catch { /* ignore */ }
    finally { setAddingSaving(false); }
  }

  async function handleRemoveUser(userId: number) {
    if (!usersPanel) return;
    setRemovingId(userId);
    try {
      await req(`/companies/${usersPanel.id}/users/${userId}`, { method: 'DELETE' });
      setCompanyUsers(prev => prev.filter(u => u.id !== userId));
      await load();
    } catch { /* ignore */ }
    finally { setRemovingId(null); }
  }

  const assignedIds = new Set(companyUsers.map(u => u.id));
  const availableToAdd = allUsers.filter(u => u.active && !assignedIds.has(u.id));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Empresas</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            Gerencie as empresas e seus usuários
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nova Empresa
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {companies.map(c => (
            <div key={c.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-card)',
              borderRadius: 14, overflow: 'hidden',
              opacity: c.active ? 1 : 0.6,
            }}>
              {/* Color stripe */}
              <div style={{ height: 3, background: c.color }} />

              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {/* Dot + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 180 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{c.name}</span>
                    {currentCompany?.id === c.id && (
                      <span style={{
                        marginLeft: 8, fontSize: '0.65rem', fontWeight: 700, color: c.color,
                        background: `${c.color}20`, padding: '2px 6px', borderRadius: 4,
                      }}>atual</span>
                    )}
                    {!c.active && (
                      <span style={{
                        marginLeft: 8, fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-label)',
                        background: 'var(--bg-btn-ghost)', padding: '2px 6px', borderRadius: 4,
                        border: '1px solid var(--border-input)',
                      }}>inativa</span>
                    )}
                  </div>
                </div>

                {/* User count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  <Users size={13} />
                  <span>{c.user_count ?? 0} usuário{c.user_count !== 1 ? 's' : ''}</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => openUsers(c)}
                    className="btn-ghost"
                    style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <Users size={13} /> Usuários
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="btn-ghost"
                    style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  {currentCompany?.id !== c.id && c.active === 1 && (
                    <button
                      onClick={() => switchCompany({ id: c.id, name: c.name, slug: c.slug, color: c.color })}
                      className="btn-ghost"
                      style={{ padding: '5px 12px', fontSize: '0.78rem', color: c.color }}
                    >
                      Ativar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {companies.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Nenhuma empresa cadastrada.
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="modal-card" style={{ width: '100%', maxWidth: 420 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>
              {editing ? 'Editar Empresa' : 'Nova Empresa'}
            </h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div>
                <label className="label-dark">Nome</label>
                <input
                  type="text"
                  className="input-dark"
                  style={{ width: '100%', marginTop: 4 }}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="label-dark" style={{ display: 'block', marginBottom: 8 }}>Cor</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map(col => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setForm({ ...form, color: col })}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: col,
                        border: form.color === col ? '3px solid var(--text-primary)' : '3px solid transparent',
                        outline: form.color === col ? `2px solid ${col}` : 'none',
                        outlineOffset: 2,
                        cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {form.color === col && <Check size={14} color="#fff" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active toggle (edit only) */}
              {editing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id="c-active"
                    type="checkbox"
                    checked={form.active === 1}
                    onChange={e => setForm({ ...form, active: e.target.checked ? 1 : 0 })}
                  />
                  <label htmlFor="c-active" className="label-dark" style={{ margin: 0, cursor: 'pointer' }}>
                    Empresa ativa
                  </label>
                </div>
              )}

              {formError && (
                <div style={{
                  fontSize: '0.8rem', color: 'var(--red)', background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px',
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Panel Modal */}
      {usersPanel && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setUsersPanel(null); }}
        >
          <div className="modal-card" style={{ width: '100%', maxWidth: 480 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: usersPanel.color }} />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {usersPanel.name}
                </h2>
              </div>
              <button
                onClick={() => setUsersPanel(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Add user */}
            <div style={{
              background: 'var(--bg-main)', border: '1px solid var(--border-input)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                Adicionar usuário
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={toAdd}
                  onChange={e => setToAdd(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input-dark"
                  style={{ flex: 1 }}
                >
                  <option value="">Selecionar usuário...</option>
                  {availableToAdd.map(u => (
                    <option key={u.id} value={u.id}>{u.name} — {ROLE_LABELS[u.role] || u.role}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddUser}
                  className="btn-primary"
                  disabled={!toAdd || addingSaving}
                  style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  {addingSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  Adicionar
                </button>
              </div>
              {availableToAdd.length === 0 && (
                <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Todos os usuários ativos já pertencem a esta empresa.
                </p>
              )}
            </div>

            {/* Current users */}
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Usuários ({companyUsers.length})
            </div>

            {usersLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Carregando...
              </div>
            ) : companyUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Nenhum usuário nesta empresa ainda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {companyUsers.map(u => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 9,
                    background: 'var(--bg-main)', border: '1px solid var(--border-input)',
                    opacity: u.active ? 1 : 0.55,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{u.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {u.email} · {ROLE_LABELS[u.role] || u.role}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveUser(u.id)}
                      disabled={removingId === u.id}
                      title="Remover desta empresa"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 6, borderRadius: 6,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {removingId === u.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <UserMinus size={14} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setUsersPanel(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
