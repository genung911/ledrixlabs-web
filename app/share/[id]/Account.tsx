import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BLUE, BORDER, CARD, CRITICAL, GREEN, MED, TEXT, eyebrow } from './shared';

// ─── Account (owner 2026-11-26, mockup QGBCS3JhtN4vhxVSuA1b1b option A, "Approved") ─────────────────────────────────────
// For someone signed in: their initials at the top right. One short menu — who they are, this home and where it stands,
// the Ledrix Home app, and Sign out, which asks first (it used to sign out on a single tap of the "● LEDRIX" pill).
type AccountInfo = { name: string | null; email: string | null; status: 'yours' | 'waiting' | 'not_yet'; since?: string | null };
/** "Yours since Nov 26, 2026" — the date this person got the home (#156); "On your account" until it's known. */
function sinceText(since?: string | null): string | null {
  const t = since ? Date.parse(since) : NaN;
  return Number.isFinite(t) ? `Yours since ${new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : null;
}
function initialsOf(name: string | null, email: string | null): string {
  const src = (name || email || '').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (name && parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
}
const STATUS_TEXT: Record<AccountInfo['status'], string> = { yours: 'On your account', waiting: 'Waiting for closing', not_yet: 'Not claimed yet' };
function AccountButton({ account, address, onSignOut }: { account?: AccountInfo; address: string; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const name = account?.name ?? null, email = account?.email ?? null;
  const ini = initialsOf(name, email);
  const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', fontSize: 13, color: TEXT, borderTop: `1px solid ${BORDER}`, background: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box' };
  const avatar = (px: number): CSSProperties => ({ width: px, height: px, borderRadius: '50%', background: '#2A3340', color: '#fff', fontSize: Math.round(px * 0.38), fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.18)' });
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${name || email || 'signed in'}`} onClick={() => setOpen(o => !o)}
        style={{ ...avatar(30), cursor: 'pointer', outline: open ? `2px solid ${BLUE}` : 'none', outlineOffset: 1, padding: 0 }}>{ini}</button>
      {open && (
        <div role="menu" aria-label="Account" style={{ position: 'absolute', top: 40, right: 0, width: 280, maxWidth: 'calc(100vw - 24px)', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: '0 18px 40px rgba(0,0,0,0.45)', overflow: 'hidden', zIndex: 120 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 14 }}>
            <span style={avatar(34)}>{ini}</span>
            <span style={{ minWidth: 0 }}>
              {name && <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: TEXT }}>{name}</span>}
              <span style={{ display: 'block', fontSize: 11.5, color: MED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email ?? 'Signed in'}</span>
            </span>
          </div>
          <div style={{ ...eyebrow(MED, 8.5), padding: '10px 14px 4px', borderTop: `1px solid ${BORDER}` }}>This home</div>
          <div style={{ ...row, borderTop: 'none', cursor: 'default' }}><span>{address || 'This home'}</span><span style={{ fontSize: 11.5, color: account?.status === 'yours' ? GREEN : MED }}>{(account?.status === 'yours' && sinceText(account.since)) || STATUS_TEXT[account?.status ?? 'not_yet']}</span></div>
          <a role="menuitem" href="/home" target="_blank" rel="noopener" style={row}><span>The Ledrix Home app</span><span style={{ color: MED }}>›</span></a>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setConfirm(true); }} style={{ ...row, color: CRITICAL, fontWeight: 600 }}>Sign out</button>
        </div>
      )}
      {confirm && (
        <div role="dialog" aria-modal="true" aria-label="Sign out?" onClick={() => setConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, maxWidth: 300, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b style={{ fontSize: 15, color: TEXT }}>Sign out?</b>
            <p style={{ margin: 0, color: MED, fontSize: 12.5, lineHeight: 1.5 }}>You can sign back in any time with an email code.{account?.status === 'yours' ? ' Your home stays on your account.' : ''}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" autoFocus onClick={() => setConfirm(false)} style={{ flex: 1, padding: 9, borderRadius: 10, border: 'none', background: 'rgba(127,127,127,0.16)', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={() => { setConfirm(false); onSignOut?.(); }} style={{ flex: 1, padding: 9, borderRadius: 10, border: 'none', background: CRITICAL, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { AccountButton };
export type { AccountInfo };
