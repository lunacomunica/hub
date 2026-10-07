import { useState, useEffect, useRef } from 'react';
import { req } from '../api';
import { Send, Instagram, MessageCircle, RefreshCw, CheckCheck, Circle, Link2 } from 'lucide-react';

interface Conversation {
  id: number;
  platform: 'instagram' | 'messenger' | 'whatsapp';
  contact_name: string;
  contact_external_id: string;
  last_message_preview: string;
  last_message_at: string | null;
  unread_count: number;
  status: 'open' | 'closed';
  opportunity_id: number | null;
}

interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  content: string;
  media_url: string | null;
  media_type: string | null;
  sent_by: string | null;
  sent_at: string;
}

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  if (platform === 'instagram') return <Instagram size={size} style={{ color: '#e1306c' }} />;
  if (platform === 'whatsapp')  return <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.549 4.107 1.508 5.845L.057 23.886a.75.75 0 00.921.921l6.041-1.451A11.942 11.942 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 22c-1.885 0-3.656-.51-5.18-1.4l-.37-.22-3.839.922.938-3.751-.241-.382A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>;
  return <MessageCircle size={size} style={{ color: '#0084ff' }} />;
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function HubConversations() {
  const [convs, setConvs]         = useState<Conversation[]>([]);
  const [sel, setSel]             = useState<Conversation | null>(null);
  const [msgs, setMsgs]           = useState<Message[]>([]);
  const [reply, setReply]         = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus]     = useState('open');
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConvs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPlatform) params.set('platform', filterPlatform);
      if (filterStatus)   params.set('status', filterStatus);
      const data = await req(`/hub-conversations?${params}`) as Conversation[];
      setConvs(data);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function loadMsgs(conv: Conversation) {
    setSel(conv);
    setMsgs([]);
    try {
      const data = await req(`/hub-conversations/${conv.id}/messages`) as Message[];
      setMsgs(data);
      setConvs(cs => cs.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    } catch { /* silent */ }
  }

  async function sendReply() {
    if (!sel || !reply.trim()) return;
    setSending(true);
    try {
      const msg = await req(`/hub-conversations/${sel.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: reply }),
      }) as Message;
      setMsgs(ms => [...ms, msg]);
      setReply('');
    } catch (e: any) {
      alert(e?.message || 'Erro ao enviar');
    }
    setSending(false);
  }

  useEffect(() => { loadConvs(); }, [filterPlatform, filterStatus]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const totalUnread = convs.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>

      {/* ── Painel esquerdo ─────────────────────────────────────── */}
      <div style={{ width: 340, minWidth: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Conversas</span>
              {totalUnread > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 9999, fontSize: 11, padding: '1px 7px', fontWeight: 600 }}>{totalUnread}</span>
              )}
            </div>
            <button onClick={loadConvs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6 }}>
            {['open','closed','all'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  background: filterStatus === s ? 'var(--accent)' : 'transparent',
                  color: filterStatus === s ? '#fff' : 'var(--text-muted)' }}>
                {s === 'open' ? 'Abertas' : s === 'closed' ? 'Fechadas' : 'Todas'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {[['', 'Todas'], ['instagram','IG'], ['messenger','MSG'], ['whatsapp','WA']].map(([val, label]) => (
              <button key={val} onClick={() => setFilterPlatform(val)}
                style={{ flex: 1, padding: '3px 0', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer',
                  background: filterPlatform === val ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: filterPlatform === val ? '#a5b4fc' : 'var(--text-muted)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>}
          {!loading && convs.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhuma conversa ainda.<br/>
              <span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Configure o webhook de mensagens na Meta para começar a receber.</span>
            </div>
          )}
          {convs.map(c => (
            <button key={c.id} onClick={() => loadMsgs(c)}
              style={{ width: '100%', textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: sel?.id === c.id ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <PlatformIcon platform={c.platform} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: c.unread_count > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {c.contact_name || c.contact_external_id}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }}>{timeAgo(c.last_message_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                      {c.last_message_preview || '—'}
                    </span>
                    {c.unread_count > 0 && (
                      <span style={{ background: '#6366f1', color: '#fff', borderRadius: 9999, fontSize: 10, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>{c.unread_count}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Painel direito ──────────────────────────────────────── */}
      {!sel ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
          <MessageCircle size={40} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 14 }}>Selecione uma conversa</span>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header da conversa */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <PlatformIcon platform={sel.platform} size={20} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{sel.contact_name || sel.contact_external_id}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {sel.platform === 'instagram' ? 'Instagram DM' : sel.platform === 'whatsapp' ? 'WhatsApp' : 'Messenger'}
                {sel.opportunity_id && <><Link2 size={10} /> Oportunidade #{sel.opportunity_id}</>}
              </div>
            </div>
            {/* Status toggle */}
            <button onClick={async () => {
              const next = sel.status === 'open' ? 'closed' : 'open';
              await req(`/hub-conversations/${sel.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
              setSel(s => s ? { ...s, status: next } : s);
              setConvs(cs => cs.map(c => c.id === sel.id ? { ...c, status: next } : c));
            }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
              fontSize: 11, color: sel.status === 'open' ? '#10b981' : 'var(--text-muted)' }}>
              {sel.status === 'open' ? <><Circle size={8} fill="#10b981" style={{ display:'inline', marginRight:4 }} />Aberta</> : <><CheckCheck size={12} style={{ display:'inline', marginRight:4 }} />Fechada</>}
            </button>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>Nenhuma mensagem carregada</div>
            )}
            {msgs.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '70%', padding: '8px 12px', borderRadius: m.direction === 'outbound' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.direction === 'outbound' ? '#6366f1' : 'var(--bg-secondary)',
                  color: m.direction === 'outbound' ? '#fff' : 'var(--text-primary)', fontSize: 13, lineHeight: 1.5,
                }}>
                  {m.media_url && m.media_type?.includes('image') && (
                    <img src={m.media_url} alt="mídia" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4 }} />
                  )}
                  {m.content || (m.media_url ? `[${m.media_type || 'mídia'}]` : '')}
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, textAlign: 'right' }}>
                    {new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {m.direction === 'outbound' && m.sent_by && ` · ${m.sent_by}`}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input de resposta */}
          {sel.status === 'open' ? (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Digite uma mensagem… (Enter para enviar)"
                rows={2}
                style={{ flex: 1, resize: 'none', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                style={{ padding: '10px 16px', borderRadius: 10, background: sending || !reply.trim() ? 'var(--bg-secondary)' : '#6366f1',
                  color: sending || !reply.trim() ? 'var(--text-muted)' : '#fff', border: 'none', cursor: sending || !reply.trim() ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}>
                {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          ) : (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              Conversa fechada — reabra para responder
            </div>
          )}
        </div>
      )}
    </div>
  );
}
