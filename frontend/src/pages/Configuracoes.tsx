import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../api';
import { User, Lock, Save } from 'lucide-react';

export default function Configuracoes() {
  const { user, login, token } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  const [passSuccess, setPassSuccess] = useState('');
  const [passError, setPassError] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setNameLoading(true);
    setNameError('');
    setNameSuccess('');
    try {
      const updated = await updateProfile({ name });
      login(token!, { ...user!, name: updated.name });
      setNameSuccess('Nome atualizado com sucesso!');
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setNameLoading(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPassError('As senhas não coincidem');
      return;
    }
    setPassLoading(true);
    setPassError('');
    setPassSuccess('');
    try {
      await updateProfile({ current_password: currentPassword, new_password: newPassword });
      setPassSuccess('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPassError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setPassLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-card)',
    borderRadius: '14px',
    padding: '1.5rem',
    marginBottom: '1.25rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--text-label)',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
        Configurações
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        {user?.email}
      </p>

      {/* Dados pessoais */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
          <User size={16} color="var(--text-label)" />
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>Dados pessoais</span>
        </div>
        <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Nome</label>
            <input
              className="input-dark"
              style={{ width: '100%' }}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              className="input-dark"
              style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed' }}
              value={user?.email || ''}
              disabled
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              O email não pode ser alterado
            </span>
          </div>
          {nameError && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--red, #ef4444)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
              {nameError}
            </div>
          )}
          {nameSuccess && (
            <div style={{ fontSize: '0.8125rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
              {nameSuccess}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={nameLoading} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={14} />
            {nameLoading ? 'Salvando...' : 'Salvar nome'}
          </button>
        </form>
      </div>

      {/* Trocar senha */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
          <Lock size={16} color="var(--text-label)" />
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>Trocar senha</span>
        </div>
        <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Senha atual</label>
            <input
              type="password"
              className="input-dark"
              style={{ width: '100%' }}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Nova senha</label>
            <input
              type="password"
              className="input-dark"
              style={{ width: '100%' }}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Confirmar nova senha</label>
            <input
              type="password"
              className="input-dark"
              style={{ width: '100%' }}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {passError && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--red, #ef4444)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
              {passError}
            </div>
          )}
          {passSuccess && (
            <div style={{ fontSize: '0.8125rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
              {passSuccess}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={passLoading} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={14} />
            {passLoading ? 'Salvando...' : 'Trocar senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
