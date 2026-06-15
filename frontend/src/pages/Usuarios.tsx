import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUsers, createUser, updateUser, deleteUser } from '../api';
import type { User } from '../types';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-blue',
  financeiro: 'badge-purple',
  comercial: 'badge-green',
};

interface FormState {
  name: string;
  email: string;
  password: string;
  role: string;
  active: number;
}

const emptyForm = (): FormState => ({
  name: '',
  email: '',
  password: '',
  role: 'financeiro',
  active: 1,
});

export default function Usuarios() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm());
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditingUser(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, active: u.active });
    setFormError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
    setFormError('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Nome e email são obrigatórios.');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      setFormError('Senha é obrigatória para novos usuários.');
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        const payload: Partial<{ name: string; password: string; role: string; active: number }> = {
          name: form.name,
          role: form.role,
          active: form.active,
        };
        if (form.password.trim()) payload.password = form.password;
        await updateUser(editingUser.id, payload);
      } else {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        });
      }
      closeModal();
      await loadUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Usuários</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Gerencie os usuários do sistema
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          Novo Usuário
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--red, #ef4444)', marginBottom: '16px', fontSize: '0.875rem' }}>{error}</div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Carregando...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                {['Nome', 'Email', 'Perfil', 'Status', 'Ações'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--text-label)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: '1px solid var(--border-card)',
                    opacity: u.active ? 1 : 0.55,
                  }}
                >
                  <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {u.name}
                    {u.id === me?.id && (
                      <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-label)' }}>(você)</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {u.email}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${ROLE_BADGE[u.role] || 'badge-blue'}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${u.active ? 'badge-green' : ''}`}
                      style={!u.active ? { background: 'var(--bg-btn-ghost)', color: 'var(--text-secondary)', border: '1px solid var(--border-input)' } : undefined}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => openEdit(u)}
                        disabled={u.id === me?.id}
                        title={u.id === me?.id ? 'Não é possível editar a si mesmo' : undefined}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', color: 'var(--red, #ef4444)' }}
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.id === me?.id}
                        title={u.id === me?.id ? 'Não é possível excluir a si mesmo' : undefined}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-card" style={{ width: '100%', maxWidth: '440px' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-dark" htmlFor="u-name">Nome</label>
                <input
                  id="u-name"
                  type="text"
                  className="input-dark"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label-dark" htmlFor="u-email">Email</label>
                <input
                  id="u-email"
                  type="email"
                  className="input-dark"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  disabled={!!editingUser}
                />
              </div>
              <div>
                <label className="label-dark" htmlFor="u-password">
                  Senha {editingUser && <span style={{ color: 'var(--text-label)', fontWeight: 400 }}>(deixe vazio para não alterar)</span>}
                </label>
                <input
                  id="u-password"
                  type="password"
                  className="input-dark"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? '••••••••' : ''}
                />
              </div>
              <div>
                <label className="label-dark" htmlFor="u-role">Perfil</label>
                <select
                  id="u-role"
                  className="input-dark"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="admin">Admin</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="comercial">Comercial</option>
                </select>
              </div>
              {editingUser && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    id="u-active"
                    type="checkbox"
                    checked={form.active === 1}
                    onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })}
                  />
                  <label htmlFor="u-active" className="label-dark" style={{ margin: 0, cursor: 'pointer' }}>
                    Usuário ativo
                  </label>
                </div>
              )}

              {formError && (
                <div style={{
                  fontSize: '0.8125rem',
                  color: 'var(--red, #ef4444)',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}>
                  {formError}
                </div>
              )}

              <div className="flex items-center gap-3" style={{ marginTop: '4px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-ghost" onClick={closeModal} disabled={saving}>
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

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="modal-card" style={{ width: '100%', maxWidth: '380px' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              Excluir usuário
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              Tem certeza que deseja excluir <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center gap-3" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--red, #ef4444)', borderColor: 'var(--red, #ef4444)' }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
