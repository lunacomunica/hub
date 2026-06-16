import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateProfile, getCategories, createCategory, updateCategory, deleteCategory } from '../api';
import type { Category } from '../types';
import { User, Lock, Save, Tag, Pencil, Trash2, Plus, Check, X } from 'lucide-react';

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

  // Categories
  const [catTab, setCatTab] = useState<'revenue' | 'expense'>('revenue');
  const [categories, setCategories] = useState<Category[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editType, setEditType] = useState<'revenue' | 'expense'>('revenue');
  const [catSaving, setCatSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [adding, setAdding] = useState(false);
  const [catError, setCatError] = useState('');

  const loadCategories = async () => {
    setCatLoading(true);
    try {
      const all = await getCategories();
      setCategories(all);
    } finally {
      setCatLoading(false);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const filtered = categories.filter(c => c.type === catTab);

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

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color || '#6366f1');
    setEditType(c.type as 'revenue' | 'expense');
    setCatError('');
  };

  const cancelEdit = () => { setEditingId(null); setCatError(''); };

  const saveEdit = async (id: number) => {
    if (!editName.trim()) return;
    setCatSaving(true);
    setCatError('');
    try {
      await updateCategory(id, { name: editName.trim(), color: editColor, type: editType });
      setEditingId(null);
      loadCategories();
    } catch (e: unknown) {
      setCatError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setCatSaving(false);
    }
  };

  const handleDelete = async (id: number, catName: string) => {
    if (!confirm(`Excluir categoria "${catName}"? Lançamentos vinculados ficarão sem categoria.`)) return;
    try {
      await deleteCategory(id);
      loadCategories();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setCatSaving(true);
    setCatError('');
    try {
      await createCategory({ name: newName.trim(), type: catTab, color: newColor });
      setNewName('');
      setNewColor('#6366f1');
      setAdding(false);
      loadCategories();
    } catch (e: unknown) {
      setCatError(e instanceof Error ? e.message : 'Erro ao criar');
    } finally {
      setCatSaving(false);
    }
  };

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

  const PRESET_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b'];

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '2rem 1rem' }}>
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
            <input className="input-dark" style={{ width: '100%' }} value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" required />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input className="input-dark" style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed' }} value={user?.email || ''} disabled />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>O email não pode ser alterado</span>
          </div>
          {nameError && <div style={{ fontSize: '0.8125rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>{nameError}</div>}
          {nameSuccess && <div style={{ fontSize: '0.8125rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '8px 12px' }}>{nameSuccess}</div>}
          <button type="submit" className="btn-primary" disabled={nameLoading} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={14} />{nameLoading ? 'Salvando...' : 'Salvar nome'}
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
            <input type="password" className="input-dark" style={{ width: '100%' }} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div>
            <label style={labelStyle}>Nova senha</label>
            <input type="password" className="input-dark" style={{ width: '100%' }} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div>
            <label style={labelStyle}>Confirmar nova senha</label>
            <input type="password" className="input-dark" style={{ width: '100%' }} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {passError && <div style={{ fontSize: '0.8125rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px' }}>{passError}</div>}
          {passSuccess && <div style={{ fontSize: '0.8125rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '8px 12px' }}>{passSuccess}</div>}
          <button type="submit" className="btn-primary" disabled={passLoading} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={14} />{passLoading ? 'Salvando...' : 'Trocar senha'}
          </button>
        </form>
      </div>

      {/* Categorias */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag size={16} color="var(--text-label)" />
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>Categorias</span>
          </div>
          <button
            onClick={() => { setAdding(true); setNewName(''); setNewColor('#6366f1'); setCatError(''); }}
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8125rem' }}
          >
            <Plus size={13} /> Nova
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px' }}>
          {(['revenue', 'expense'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setCatTab(t); setEditingId(null); setAdding(false); setCatError(''); }}
              style={{
                flex: 1, padding: '5px 0', fontSize: '0.8125rem', fontWeight: 600, borderRadius: '6px', transition: 'all 0.15s',
                background: catTab === t ? 'var(--bg-card)' : 'transparent',
                color: catTab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: catTab === t ? '1px solid var(--border-card)' : '1px solid transparent',
              }}
            >
              {t === 'revenue' ? 'Receitas' : 'Despesas'}
            </button>
          ))}
        </div>

        {catError && (
          <div style={{ fontSize: '0.8125rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
            {catError}
          </div>
        )}

        {/* Add new */}
        {adding && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', padding: '10px', background: 'rgba(99,102,241,0.08)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                placeholder="Nome da categoria..."
                className="input-dark"
                style={{ width: '100%', fontSize: '0.875rem' }}
              />
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cor:</span>
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', background: c, border: newColor === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={handleAdd} disabled={catSaving || !newName.trim()} className="btn-primary" style={{ padding: '6px 10px' }}><Check size={14} /></button>
              <button onClick={() => setAdding(false)} className="btn-ghost" style={{ padding: '6px 10px' }}><X size={14} /></button>
            </div>
          </div>
        )}

        {/* List */}
        {catLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Nenhuma categoria de {catTab === 'revenue' ? 'receita' : 'despesa'} cadastrada.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filtered.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {editingId === c.id ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') cancelEdit(); }}
                        className="input-dark"
                        style={{ fontSize: '0.875rem', width: '100%' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cor:</span>
                        {PRESET_COLORS.map(pc => (
                          <button
                            key={pc}
                            onClick={() => setEditColor(pc)}
                            style={{ width: '18px', height: '18px', borderRadius: '50%', background: pc, border: editColor === pc ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }}
                          />
                        ))}
                      </div>
                    </div>
                    <button onClick={() => saveEdit(c.id)} disabled={catSaving} className="btn-primary" style={{ padding: '5px 8px' }}><Check size={13} /></button>
                    <button onClick={cancelEdit} className="btn-ghost" style={{ padding: '5px 8px' }}><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.color || '#6366f1', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{c.name}</span>
                    <button onClick={() => startEdit(c)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded" style={{ padding: '4px' }}><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 text-slate-500 hover:text-red-400 rounded" style={{ padding: '4px' }}><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
