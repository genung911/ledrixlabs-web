import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { LedrixDelta as ValDeltaSVG } from '@/components/LedrixDelta';
import { PORTAL_TOKEN, BLUE, ACCENT, CRITICAL, BG, CARD, BORDER, DIM, MED, TEXT, eyebrow, FROST } from './shared';

// ─── Ledrix (Phase 1 experience layer) ──────────────────────────────────────
// Live chat + Insight are the paid tier. Blue returns here ONLY as the AI accent.
// Billing is DORMANT until NEXT_PUBLIC_BILLING_ENABLED=1. Until then the Subscribe sheet is a pure
// sign-in prompt — no pricing surfaces (these placeholder numbers must not show pre-launch).
const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === '1';
// PLACEHOLDER pricing — set real numbers before launch.
const PLAN_BASE_PRICE  = '$4.99';
const PLAN_BASE_TOKENS = '500K tokens / mo · ~150 questions';
const PLAN_PAYG        = '$0.01 / 1K tokens';

function PlanCard({ title, price, sub, highlight }: { title: string; price: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${highlight ? BLUE + '55' : BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ color: highlight ? BLUE : '#e2e8f0', fontSize: 10, fontWeight: 600, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace' }}>{title}</span>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{price}</span>
      </div>
      <div style={{ color: MED, fontSize: 10, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

// ─── "IS THIS HOME YOURS YET?" (owner 2026-11-25, SQL #153; DECISIONS "who holds a home's data") ─────────────────────────
// Asked before a claim. "Yes, I own it" claims as before; "Not yet — I'm buying it" + the closing date files the claim
// under a WAITING tenure: the Home Record stays look-only (no repair marking) until "Did you close?".
type ClaimAnswer = { owned: boolean; closesOn: string | null };
/** A date input's value (YYYY-MM-DD), `days` from today, in local time. */
const isoIn = (days: number): string => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** "Dec 18, 2026" from a YYYY-MM-DD date — read as a LOCAL day (a UTC read prints the day before in Mountain time). */
const closingLabel = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
function ClaimQuestion({ onAnswer, cta = 'Continue' }: { onAnswer: (a: ClaimAnswer) => void; cta?: string }) {
  const [owned, setOwned] = useState<boolean | null>(null);
  const [date, setDate] = useState(isoIn(30));
  const ok = owned === true || (owned === false && /^\d{4}-\d{2}-\d{2}$/.test(date));
  const opt = (on: boolean, label: string, sub: string, pick: () => void) => (
    <button type="button" role="radio" aria-checked={on} onClick={pick} style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer',
      background: CARD, border: `1.5px solid ${on ? ACCENT : BORDER}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
      <span aria-hidden style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${on ? ACCENT : BORDER}`, display: 'grid', placeItems: 'center', flex: 'none', marginTop: 1 }}>
        {on && <span style={{ width: 8, height: 8, borderRadius: 4, background: ACCENT }} />}</span>
      <span><span style={{ display: 'block', color: TEXT, fontSize: 14.5, fontWeight: 700 }}>{label}</span><span style={{ display: 'block', color: MED, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{sub}</span></span>
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Is this home yours yet?">
      <div style={{ color: TEXT, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Is this home yours yet?</div>
      {opt(owned === true, 'Yes, I own it', 'The record goes on your account now.', () => setOwned(true))}
      {opt(owned === false, 'Not yet — I\u2019m buying it', 'You can read everything now. Tracking repairs opens when you close.', () => setOwned(false))}
      {owned === false && (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
          <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>Closing date</span>
          <input type="date" value={date} min={isoIn(-60)} max={isoIn(365)} onChange={e => setDate(e.target.value)} aria-label="Closing date"
            style={{ border: 'none', background: 'none', color: TEXT, fontSize: 14, fontFamily: 'inherit' }} />
        </label>
      )}
      <button type="button" disabled={!ok} onClick={() => ok && onAnswer({ owned: owned === true, closesOn: owned === true ? null : date })}
        style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.45, marginTop: 4 }}>{cta}</button>
    </div>
  );
}

function SubscribeSheet({ open, onClose, signedIn, onSubscribe, answer, onAnswer }: { open: boolean; onClose: () => void; signedIn?: boolean; onSubscribe?: () => void;
  /** The claim question's answer, held by the page until sign-in; asked first when not signed in (claimable link only). */
  answer?: ClaimAnswer | null; onAnswer?: (a: ClaimAnswer) => void }) {
  const [email, setEmail] = useState('');
  const [sent,  setSent]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState('');
  // CLAIM BY CODE (One Home phase 3, owner 2026-11-12: "email code first"): the email carries a 6-digit code (the
  // Supabase Magic Link template has {{ .Token }}); typing it here signs in on THIS page, no redirect. The link in the
  // same email still works (sendLink's redirect) for anyone who taps it instead.
  const [code,  setCode]  = useState('');
  const verifyCode = async () => {
    const t = code.replace(/\D/g, '');
    if (t.length < 6) { setErr('Enter the 6-digit code from the email.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: t, type: 'email' });
    setBusy(false);
    if (error) setErr(/expired|invalid/i.test(error.message) ? 'That code didn\u2019t work. Check the newest email, or send a new code.' : error.message);
    else onClose();
  };
  const sendLink = async () => {
    const e = email.trim();
    if (!e || !/.+@.+\..+/.test(e)) { setErr('Enter a valid email.'); return; }
    setBusy(true); setErr('');
    // BACK TO THE CLEAN ADDRESS (owner 2026-11-11, desktop loop): this sent window.location.href, so after one failed link
    // the address kept `#error=…otp_expired…`, every new link returned to it, and the client read that stale error before
    // the new link's tokens — no sign-in, ever. Origin + path + query only; Supabase adds its own fragment.
    const back = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}${window.location.search}` : undefined;
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: back } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: BG, borderTop: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: '20px 18px 28px' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#222', margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <ValDeltaSVG size={20} color={BLUE} sheen />
          <span style={{ color: BLUE, fontSize: 9, fontWeight: 600, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX</span>
        </div>
        <div style={{ color: TEXT, fontSize: 21, fontWeight: 600, letterSpacing: -0.5, marginBottom: 7 }}>Claim your home</div>
        <p style={{ color: TEXT, fontSize: 12.5, lineHeight: 1.6, marginBottom: 20 }}>The inspection becomes the start of your home&apos;s record. Claim it to log repairs and upkeep, store receipts and manuals, and ask Ledrix about your home — on the web and in the Ledrix Home app. The link still opens the record without an account.</p>
        {BILLING_ENABLED && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <PlanCard title="LEDRIX PLUS" price={`${PLAN_BASE_PRICE}/mo`} sub={PLAN_BASE_TOKENS} highlight />
              <PlanCard title="PAY AS YOU GO" price={PLAN_PAYG} sub="Only pay for what you ask — no monthly commitment." />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', marginBottom: 18 }}>
              <span style={{ color: BLUE, fontSize: 11, flexShrink: 0, marginTop: 1 }}>ⓘ</span>
              <p style={{ color: MED, fontSize: 10, lineHeight: 1.55 }}>Most homeowners ask ~150 questions a month; a typical question costs about 3,000 tokens. You&apos;ll always see your balance, and we&apos;ll help you pick the right plan.</p>
            </div>
          </>
        )}
        {!signedIn && onAnswer && !answer ? (
          <ClaimQuestion onAnswer={onAnswer} />
        ) : BILLING_ENABLED && signedIn ? (
          <button onClick={onSubscribe} style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Subscribe — {PLAN_BASE_PRICE}/mo</button>
        ) : sent ? (
          <div style={{ padding: '6px 0 2px' }}>
            <div style={{ color: BLUE, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Check your email</div>
            <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>We sent a 6-digit code to <b style={{ color: ACCENT }}>{email}</b>.</p>
            <input value={code} onChange={e => { setCode(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && verifyCode()} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" aria-label="Sign-in code"
              style={{ width: '100%', background: CARD, border: `1px solid ${err ? CRITICAL : BORDER}`, borderRadius: 12, padding: 14, color: TEXT, fontSize: 20, letterSpacing: 6, textAlign: 'center', outline: 'none', marginBottom: 8 }} />
            {err && <div style={{ color: CRITICAL, fontSize: 11, marginBottom: 8 }}>{err}</div>}
            <button onClick={verifyCode} disabled={busy} style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Claim my home'}</button>
            <button onClick={() => { setSent(false); setCode(''); setErr(''); }} style={{ width: '100%', background: 'none', border: 'none', color: MED, fontSize: 12, padding: '10px 0 0', cursor: 'pointer' }}>Use a different email or send a new code</button>
          </div>
        ) : (
          <>
            <input value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && sendLink()} placeholder="you@email.com" type="email"
              style={{ width: '100%', background: CARD, border: `1px solid ${err ? CRITICAL : BORDER}`, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, outline: 'none', marginBottom: 8 }} />
            {err && <div style={{ color: CRITICAL, fontSize: 10, marginBottom: 8 }}>{err}</div>}
            <button onClick={sendLink} disabled={busy} style={{ width: '100%', background: 'rgba(33,123,232,0.10)', color: BLUE, border: '1px solid rgba(33,123,232,0.5)', borderRadius: 12, padding: 15, fontSize: 12, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', boxShadow: '0 0 18px rgba(33,123,232,0.28)', opacity: busy ? 0.6 : 1 }}>{busy ? 'SENDING…' : 'SEND ME A SIGN-IN CODE'}</button>
          </>
        )}
        <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', color: DIM, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: 12, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>MAYBE LATER</button>
      </div>
    </div>
  );
}

function InsightSection({ access, shareId, onUnlock }: { access: boolean; shareId: string; onUnlock: () => void }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!access || insight) return;
    let live = true;
    const cacheKey = `ledrix_insight_${shareId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const o = JSON.parse(cached);
        if (o?.text && Date.now() - o.t < 12 * 3600 * 1000) { setInsight(o.text); return; }
      }
    } catch { /* no cache */ }
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        const resp = await fetch('/api/ledrix', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ shareId, token: PORTAL_TOKEN, mode: 'insight' }) });
        const j = await resp.json().catch(() => ({}));
        if (!live) return;
        if (resp.ok && j.text) {
          setInsight(j.text);
          try { localStorage.setItem(cacheKey, JSON.stringify({ text: j.text, t: Date.now() })); } catch { /* quota */ }
        } else if (j.error) {
          setInsight(j.error);   // surface e.g. the daily-cap message
        }
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, shareId]);
  return (
    <div style={{ position: 'relative', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ValDeltaSVG size={13} color={ACCENT} sheen />
        <span style={{ ...eyebrow(ACCENT, 8) }}>Ledrix Insight</span>
      </div>
      {access ? (
        <p style={{ color: loading ? MED : TEXT, fontSize: 12.5, lineHeight: 1.65 }}>{loading ? 'Analyzing your home…' : (insight ?? 'No insight available yet — ask Ledrix anything below.')}</p>
      ) : (
        // Frost the CONTENT only — the card's own header stays crisp above the masking.
        <div style={{ position: 'relative' }}>
          <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.65, filter: 'blur(4.5px)', userSelect: 'none', minHeight: 74 }}>
            Your home is in strong overall condition, with a few maintenance items worth scheduling before winter. The water heater is approaching the end of its typical service life, and the panel shows&hellip;
          </p>
          <div style={{ position: 'absolute', inset: '-4px -16px -14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, background: FROST, backdropFilter: 'blur(9px) saturate(140%)', WebkitBackdropFilter: 'blur(9px) saturate(140%)' }}>
            <button onClick={onUnlock} style={{ background: CARD, border: `1px solid ${ACCENT}66`, borderRadius: 999, padding: '11px 20px', cursor: 'pointer', ...eyebrow(ACCENT, 8.5) }}>Unlock Ledrix Insight</button>
            <span style={{ ...eyebrow(MED, 7.5) }}>Live AI analysis of your home</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { isoIn, closingLabel, ClaimQuestion, BILLING_ENABLED, PLAN_BASE_PRICE, PLAN_BASE_TOKENS, PLAN_PAYG, PlanCard, SubscribeSheet, InsightSection };
export type { ClaimAnswer };
