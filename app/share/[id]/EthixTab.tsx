import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { ETHIX_CATEGORIES, ETHIX_CATEGORY_KEYS } from '@/lib/ethix';
import { can, GREEN, CARD, BORDER, DIM, MED, TEXT, MONO } from './shared';

// ─── ETHIX TAB — the user-owned data program (opt-in, category control, $0 dashboard) ──
function EthixTab({ access, onUnlock }: { access: boolean; onUnlock: () => void }) {
  const [consent, setConsent] = useState<{ opted_in: boolean; categories: string[]; earned_cents: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const MONO = 'Roboto Mono, monospace';

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';

  const load = useCallback(async () => {
    if (!access) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/ethix', { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.consent) setConsent(j.consent);
    } catch { /* noop */ }
    setLoading(false);
  }, [access]);
  useEffect(() => { load(); }, [load]);

  const optedIn = !!consent?.opted_in;
  const cats = new Set(consent?.categories ?? []);

  const save = async (opted_in: boolean, categories: string[]) => {
    if (!access) { onUnlock(); return; }
    setConsent({ opted_in, categories, earned_cents: consent?.earned_cents ?? 0 });   // optimistic
    setSaving(true);
    try {
      const r = await fetch('/api/ethix', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ opted_in, categories }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.consent) setConsent(j.consent);
    } catch { /* noop */ }
    setSaving(false);
  };

  const toggleCat = (k: string) => {
    const next = new Set(cats);
    if (next.has(k)) next.delete(k); else next.add(k);
    save(true, Array.from(next));
  };

  return (
    <div style={{ padding: '18px 18px 40px' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Ethix · your data, your call</div>
      <h2 style={{ color: TEXT, fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: '0 0 8px' }}>Your data is yours.</h2>
      <p style={{ color: MED, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>Opt in to share only anonymized, aggregate signals about your home — never anything personal — and keep what it earns. Ledrix already makes its money on your subscription, so this isn&apos;t ours to profit from. <a href="/ethix" target="_blank" rel="noopener" style={{ color: TEXT, fontWeight: 600, textDecoration: "underline" }}>How Ethix works ›</a></p>

      {!access ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 18, textAlign: 'center' }}>
          <p style={{ color: MED, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>Sign in to set your Ethix preferences. It&apos;s tied to your account, so only you can change it.</p>
          <button onClick={onUnlock} style={{ background: TEXT, color: '#fff', border: 'none', borderRadius: 9, padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Sign in</button>
        </div>
      ) : loading ? (
        <div style={{ color: MED, fontSize: 14, padding: '20px 0' }}>Loading your preferences…</div>
      ) : (
        <>
          <div style={{ background: CARD, border: `1px solid ${optedIn ? 'rgba(11,143,166,0.4)' : BORDER}`, borderRadius: 15, padding: 16, display: 'flex', alignItems: 'center', gap: 13, boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Share anonymized home data</div>
              <div style={{ color: MED, fontSize: 12.5, marginTop: 3 }}>{optedIn ? 'On — you’re sharing the categories below.' : 'Off — nothing is shared.'}</div>
            </div>
            <button onClick={() => optedIn ? save(false, []) : save(true, ETHIX_CATEGORY_KEYS)} aria-pressed={optedIn}
              style={{ flexShrink: 0, width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer', background: optedIn ? TEXT : '#CBD5D8', position: 'relative', transition: 'background 0.15s' }}>
              <span style={{ position: 'absolute', top: 3, left: optedIn ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          {optedIn && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase', margin: '22px 0 10px' }}>What you share</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {ETHIX_CATEGORIES.map(c => {
                  const on = cats.has(c.key);
                  return (
                    <div key={c.key} onClick={() => toggleCat(c.key)} style={{ background: CARD, border: `1px solid ${on ? 'rgba(11,143,166,0.4)' : BORDER}`, borderRadius: 13, padding: 14, cursor: 'pointer', display: 'flex', gap: 12 }}>
                      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? TEXT : '#CBD5D8'}`, background: on ? TEXT : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, marginTop: 1 }}>{on ? '✓' : ''}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{c.label}</div>
                        <div style={{ color: MED, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}><b style={{ color: GREEN, fontWeight: 700 }}>Shared:</b> {c.shares}</div>
                        <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}><b style={{ fontWeight: 700 }}>Never:</b> {c.never}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: '#EAF6F6', border: '1px solid #CFE7E9', borderRadius: 14, padding: 16, marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ color: '#2A4247', fontSize: 13, fontWeight: 700 }}>Earned so far</span>
                  <span style={{ color: TEXT, fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>$0.00</span>
                </div>
                <p style={{ color: '#3C575C', fontSize: 12, lineHeight: 1.55, margin: '8px 0 0' }}>Nothing is being sold yet — we&apos;re building this carefully. Your choice is saved, and we&apos;ll ask you again before a single dollar ever changes hands. You&apos;ll see every cent.</p>
              </div>

              <button onClick={() => save(false, [])} style={{ width: '100%', marginTop: 14, background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Turn off &amp; stop sharing</button>
            </>
          )}
        </>
      )}
      {saving && <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 12 }}>Saving…</div>}
    </div>
  );
}
export { EthixTab };
