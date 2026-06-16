import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { createCategory } from '../api';
import type { Category } from '../types';

interface Props {
  value: number | null | undefined | '';
  onChange: (id: number | undefined) => void;
  categories: Category[];
  onCategoryCreated: (cat: Category) => void;
  type: 'revenue' | 'expense';
  style?: React.CSSProperties;
}

export default function CategorySelect({ value, onChange, categories, onCategoryCreated, type, style }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const cat = await createCategory({ name: newName.trim(), type });
      onCategoryCreated(cat);
      onChange(cat.id);
      setNewName('');
      setAdding(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar categoria');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { setAdding(false); setNewName(''); setError(''); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <select
        value={value ?? ''}
        onChange={e => {
          if (e.target.value === '__new__') {
            setAdding(true);
          } else {
            onChange(e.target.value ? Number(e.target.value) : undefined);
          }
        }}
        className="input-dark w-full"
        style={style}
      >
        <option value="">Sem categoria</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value="__new__">+ Nova categoria</option>
      </select>

      {adding && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            autoFocus
            className="input-dark"
            style={{ flex: 1, fontSize: '0.8125rem', padding: '6px 10px' }}
            placeholder="Nome da categoria..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSave}
            disabled={saving || !newName.trim()}
            title="Salvar"
            style={{
              background: '#10b981', border: 'none', borderRadius: '6px',
              color: '#fff', cursor: 'pointer', padding: '6px 8px',
              display: 'flex', alignItems: 'center', opacity: saving ? 0.6 : 1,
            }}
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => { setAdding(false); setNewName(''); setError(''); }}
            title="Cancelar"
            style={{
              background: 'var(--bg-btn-ghost)', border: '1px solid var(--border-input)',
              borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer',
              padding: '6px 8px', display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>{error}</div>
      )}
    </div>
  );
}
