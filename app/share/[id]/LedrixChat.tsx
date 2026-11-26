import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ValVoiceVisualizer from '../../../components/ValVoiceVisualizer';
import { LedrixDelta as ValDeltaSVG } from '@/components/LedrixDelta';
import { PORTAL_TOKEN, BLUE, ACCENT, CRITICAL, BG, CARD, BORDER, DIM, MED, TEXT } from './shared';

// ─── THE LEDRIX CHAT (its own file so the page loads it only when opened — approval pack item 6, owner 2026-11-25) ───
// page.tsx imports it with next/dynamic the first time Ask Ledrix opens; nothing else imports it.
function LedrixPanel({ open, onClose, shareId, seed }: { open: boolean; onClose: () => void; shareId: string; seed?: string | null }) {
  const [msgs, setMsgs]   = useState<{ role: 'ledrix' | 'user'; text: string }[]>([
    { role: 'ledrix', text: "Hi — I'm Ledrix. Ask me anything about your home: a finding, a repair, what something costs, or what to do next." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);
  const [recording, setRecording] = useState(false);
  const [vizStream, setVizStream] = useState<MediaStream | null>(null);   // shared with the equalizer
  const [vp, setVp]       = useState<{ h: number; top: number } | null>(null);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Size the panel to the VISIBLE viewport so the input stays above the mobile
  // keyboard instead of being hidden under it.
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setVp({ h: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [open]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs, busy]);

  // Auto-send a transcript handed in from the FAB voice orb (option a) when the panel opens.
  const sendRef = useRef<(t?: string) => void>(() => {});
  const seedSent = useRef<string | null>(null);
  useEffect(() => {
    if (open && seed && seedSent.current !== seed) { seedSent.current = seed; sendRef.current(seed); }
  }, [open, seed]);

  if (!open) return null;

  const send = async (text?: string) => {
    const t = (text ?? input).trim(); if (!t || busy) return;
    const next = [...msgs, { role: 'user' as const, text: t }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const resp = await fetch('/api/ledrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ shareId, token: PORTAL_TOKEN, mode: 'chat', messages: next.map(m => ({ role: m.role === 'ledrix' ? 'assistant' : 'user', content: m.text })) }),
      });
      const j = await resp.json().catch(() => ({}));
      setMsgs(m => [...m, { role: 'ledrix', text: resp.ok ? (j.text || '…') : (j.error || 'Ledrix is unavailable.') }]);
    } catch {
      setMsgs(m => [...m, { role: 'ledrix', text: 'Network error — please try again.' }]);
    } finally { setBusy(false); }
  };
  sendRef.current = send;

  const toggleMic = async () => {
    if (recording) { mediaRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVizStream(stream);   // feed the live equalizer off the same mic stream
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setVizStream(null);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (!blob.size) return;
        setBusy(true);
        try {
          const { data } = await supabase.auth.getSession();
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          const resp = await fetch('/api/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: fd });
          const j = await resp.json().catch(() => ({}));
          if (resp.ok && j.text) setInput(prev => (prev ? prev + ' ' : '') + j.text);
        } finally { setBusy(false); }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch { /* mic denied / unsupported */ }
  };

  return (
    <div style={{ position: 'fixed', top: vp ? vp.top : 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, height: vp ? vp.h : '100dvh', zIndex: 210, background: BG, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <ValDeltaSVG size={20} color={BLUE} sheen />
        <span style={{ color: TEXT, fontSize: 13, fontWeight: 700, flex: 1 }}>Ledrix</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%',
            background: m.role === 'user' ? '#161616' : `${BLUE}10`, border: `1px solid ${m.role === 'user' ? BORDER : BLUE + '2a'}`,
            borderRadius: 12, padding: '10px 13px', color: m.role === 'user' ? '#e2e8f0' : TEXT, fontSize: 13, lineHeight: 1.55 }}>{m.text}</div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', color: MED, fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}>Ledrix is thinking…</div>}
      </div>
      {recording && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 16px', borderTop: `1px solid ${BORDER}`, background: BG, flexShrink: 0 }}>
          <ValVoiceVisualizer active={recording} stream={vizStream} color={BLUE} height={42} bars={7} />
          <span style={{ color: BLUE, fontSize: 10, fontWeight: 600, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LISTENING</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, alignItems: 'flex-end' }}>
        <button onClick={toggleMic} aria-label="Voice" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 10,
          background: recording ? CRITICAL : CARD, border: `1px solid ${recording ? CRITICAL : BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={recording ? '#fff' : ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
        </button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder={recording ? 'Listening…' : 'Ask Ledrix about your home…'} enterKeyHint="send"
          style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 16, outline: 'none', minWidth: 0 }} />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ flexShrink: 0, height: 44, padding: '0 16px',
          background: 'rgba(33,123,232,0.10)', color: BLUE, border: '1px solid rgba(33,123,232,0.5)', borderRadius: 10, fontWeight: 600, fontSize: 11, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', boxShadow: '0 0 14px rgba(33,123,232,0.28)', opacity: (busy || !input.trim()) ? 0.45 : 1 }}>SEND</button>
      </div>
    </div>
  );
}
export { LedrixPanel };
