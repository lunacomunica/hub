import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Trash2, FileText, Clock, User } from 'lucide-react';
import { req } from '../api';
import { useAuth } from '../context/AuthContext';

const API = '/notes';

interface NoteItem { id: number; title: string; author_name: string | null; created_at: string; updated_at: string; }
interface Note extends NoteItem { content: string | null; }

const fmtDate = (d: string) => {
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return `${diff}d atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export default function Notes() {
  const { user } = useAuth();
  const [list, setList] = useState<NoteItem[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const loadList = async () => {
    try {
      const rows = await req<NoteItem[]>(`${API}`);
      setList(rows);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadList(); }, []);

  const autoResize = () => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => { autoResize(); }, [content]);

  const openNote = async (item: NoteItem) => {
    try {
      const note = await req<Note>(`${API}/${item.id}`);
      setSelected(note);
      setTitle(note.title === 'Sem título' ? '' : note.title);
      setContent(note.content || '');
      setSaved(false);
    } catch { /* ignore */ }
  };

  const scheduleSave = useCallback((newTitle: string, newContent: string) => {
    if (!selected) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved(false);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const updated = await req<Note>(`${API}/${selected.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title: newTitle || 'Sem título', content: newContent }),
        });
        setSelected(updated);
        setList(prev => prev.map(n => n.id === updated.id
          ? { ...n, title: updated.title, updated_at: updated.updated_at }
          : n
        ));
        setSaved(true);
      } catch { /* ignore */ }
      finally { setSaving(false); }
    }, 900);
  }, [selected]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleSave(val, content);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    scheduleSave(title, val);
  };

  const createNote = async () => {
    setCreating(true);
    try {
      const note = await req<Note>(`${API}`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Sem título', content: '' }),
      });
      setList(prev => [note, ...prev]);
      setSelected(note);
      setTitle('');
      setContent('');
      setSaved(false);
      setTimeout(() => document.getElementById('note-title')?.focus(), 50);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const deleteNote = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Excluir esta página?')) return;
    try {
      await req(`${API}/${id}`, { method: 'DELETE' });
      setList(prev => prev.filter(n => n.id !== id));
      if (selected?.id === id) { setSelected(null); setTitle(''); setContent(''); }
    } catch { /* ignore */ }
  };

  const filtered = list.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-5 overflow-hidden" style={{ background: 'var(--bg-base, #07071a)' }}>

      {/* ── Sidebar ── */}
      <div className="flex flex-col shrink-0 border-r overflow-hidden"
        style={{ width: 260, background: '#0a0a1f', borderColor: 'rgba(59,130,246,0.1)' }}>

        <div className="p-3 border-b" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
          <button onClick={createNote} disabled={creating}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>
            <Plus size={14} /> Nova página
          </button>
        </div>

        <div className="px-3 pt-2 pb-1">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar páginas..." className="w-full text-xs rounded-lg px-3 py-1.5 outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(59,130,246,0.1)' }} />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="text-xs text-slate-700 text-center py-8 px-4">
              {search ? 'Nenhuma página encontrada' : 'Nenhuma página ainda'}
            </div>
          )}
          {filtered.map(note => (
            <button key={note.id} onClick={() => openNote(note)}
              className="w-full text-left px-3 py-2.5 group flex items-start gap-2 transition-colors relative"
              style={{
                background: selected?.id === note.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                borderLeft: selected?.id === note.id ? '2px solid rgba(59,130,246,0.5)' : '2px solid transparent',
              }}>
              <FileText size={13} className="shrink-0 mt-0.5" style={{ color: selected?.id === note.id ? '#60a5fa' : '#334155' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: selected?.id === note.id ? '#e2e8f0' : '#94a3b8' }}>
                  {note.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#334155' }}>{fmtDate(note.updated_at)}</div>
              </div>
              <button onClick={e => deleteNote(note.id, e)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-400"
                style={{ color: '#475569' }}>
                <Trash2 size={11} />
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="max-w-3xl mx-auto px-10 py-12">

            {/* Author + save status */}
            <div className="flex items-center gap-3 mb-8 text-xs" style={{ color: '#475569' }}>
              <span className="flex items-center gap-1.5">
                <User size={11} />
                {selected.author_name || user?.name || '—'}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <Clock size={11} />
                {fmtDate(selected.updated_at)}
              </span>
              {saving && <span className="ml-auto" style={{ color: '#475569' }}>Salvando…</span>}
              {!saving && saved && <span className="ml-auto" style={{ color: '#10b981' }}>Salvo</span>}
            </div>

            {/* Title */}
            <input
              id="note-title"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Sem título"
              className="w-full bg-transparent outline-none font-bold leading-tight mb-6"
              style={{ fontSize: 36, color: '#f1f5f9', caretColor: '#60a5fa' }}
            />

            {/* Content */}
            <textarea
              ref={contentRef}
              value={content}
              onChange={e => { handleContentChange(e.target.value); autoResize(); }}
              placeholder="Comece a escrever…"
              rows={1}
              className="w-full bg-transparent outline-none resize-none leading-relaxed"
              style={{ fontSize: 16, color: '#94a3b8', caretColor: '#60a5fa', minHeight: 400 }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: '#334155' }}>
            <FileText size={48} strokeWidth={1} />
            <p className="text-sm">Selecione uma página ou crie uma nova</p>
            <button onClick={createNote} disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Plus size={14} /> Nova página
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
