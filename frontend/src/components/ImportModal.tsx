import { useState, useRef, useCallback } from 'react';
import { Upload, X, Check } from 'lucide-react';
import { previewImport } from '../api';
import CategorySelect from './CategorySelect';
import type { Category } from '../types';

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
}

interface ImportRow extends ParsedRow {
  selected: boolean;
  category_id?: number;
}

interface Props {
  type: 'revenue' | 'expense';
  categories: Category[];
  onImport: (items: { description: string; date: string; amount: number; category_id?: number }[]) => Promise<void>;
  onClose: () => void;
}

export default function ImportModal({ type, categories, onImport, onClose }: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [globalCategory, setGlobalCategory] = useState<number | undefined>();
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const [localCategories, setLocalCategories] = useState(categories.filter(c => c.type === (type === 'revenue' ? 'revenue' : 'expense')));

  const processFile = async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const { rows: parsed } = await previewImport(file);
      setRows(parsed.map(r => ({ ...r, selected: true })));
      setStep('preview');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(ofx|csv)$/i)) {
      setError('Arquivo deve ser .ofx ou .csv');
      return;
    }
    processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAll = (checked: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, selected: checked })));
  };

  const applyGlobalCategory = (catId: number) => {
    setGlobalCategory(catId);
    setRows(prev => prev.map(r => ({ ...r, category_id: catId })));
  };

  const handleConfirm = async () => {
    const selected = rows.filter(r => r.selected);
    if (selected.length === 0) return;
    setStep('importing');
    try {
      await onImport(selected.map(r => ({ description: r.description, date: r.date, amount: r.amount, category_id: r.category_id })));
      setImportedCount(selected.length);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao importar');
      setStep('preview');
    }
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const selectedCount = rows.filter(r => r.selected).length;

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
  };
  const modal: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '16px',
    width: '100%', maxWidth: step === 'preview' ? '720px' : '480px',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Importar {type === 'revenue' ? 'Receitas' : 'Despesas'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>

          {/* Step: upload */}
          {step === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--primary, #6366f1)' : 'var(--border-input)'}`,
                  borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                  background: dragging ? 'rgba(99,102,241,0.06)' : 'transparent',
                }}
              >
                <Upload size={32} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {loading ? 'Processando...' : 'Arraste o arquivo aqui ou clique para selecionar'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Aceita .OFX e .CSV (Itaú, Inter PJ, Asaas)
                </div>
                <input ref={fileRef} type="file" accept=".ofx,.csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
              {error && <div style={{ marginTop: '1rem', fontSize: '0.8125rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '10px 14px' }}>{error}</div>}
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <div>
              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rows.every(r => r.selected)} onChange={e => toggleAll(e.target.checked)} />
                  Selecionar todos ({selectedCount}/{rows.length})
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Categoria para todos:</span>
                  <div style={{ minWidth: '200px' }}>
                    <CategorySelect
                      value={globalCategory}
                      onChange={id => { if (id) applyGlobalCategory(id); else setGlobalCategory(undefined); }}
                      categories={localCategories}
                      onCategoryCreated={cat => setLocalCategories(prev => [...prev, cat])}
                      type={type === 'revenue' ? 'revenue' : 'expense'}
                      style={{ fontSize: '0.8125rem', padding: '4px 28px 4px 8px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ border: '1px solid var(--border-card)', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-table-header, rgba(255,255,255,0.04))' }}>
                      <th style={{ width: 32, padding: '8px 12px' }}></th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-label)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Data</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-label)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Descri&ccedil;&atilde;o</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-label)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Valor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-label)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-card)', opacity: row.selected ? 1 : 0.4 }}>
                        <td style={{ padding: '7px 12px' }}>
                          <input type="checkbox" checked={row.selected} onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, selected: e.target.checked } : r))} />
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {row.date.split('-').reverse().join('/')}
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.description}
                        </td>
                        <td style={{ padding: '7px 12px', color: type === 'revenue' ? '#10b981' : '#ef4444', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmt(row.amount)}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <select
                            value={row.category_id || ''}
                            onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, category_id: Number(e.target.value) || undefined } : r))}
                            className="input-dark"
                            style={{ fontSize: '0.75rem', padding: '3px 6px', minWidth: '120px' }}
                          >
                            <option value="">&mdash;</option>
                            {localCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {error && <div style={{ marginTop: '1rem', fontSize: '0.8125rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '10px 14px' }}>{error}</div>}
            </div>
          )}

          {/* Step: importing */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>Importando lan&ccedil;amentos...</div>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Check size={28} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                {importedCount} lan&ccedil;amentos importados!
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Os lan&ccedil;amentos foram adicionados com status &ldquo;pendente&rdquo;.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'preview' || step === 'done') && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-card)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            {step === 'preview' && (
              <>
                <button onClick={() => setStep('upload')} className="btn-ghost" style={{ fontSize: '0.875rem' }}>
                  Voltar
                </button>
                <button
                  onClick={handleConfirm}
                  className="btn-primary"
                  disabled={selectedCount === 0}
                  style={{ fontSize: '0.875rem' }}
                >
                  Importar {selectedCount} lan&ccedil;amento{selectedCount !== 1 ? 's' : ''}
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={onClose} className="btn-primary" style={{ fontSize: '0.875rem' }}>
                Concluir
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
