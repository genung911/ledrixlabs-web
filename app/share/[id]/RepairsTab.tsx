import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { can, lookOnly, shareUrlFor, portal, supaPost, supaPatch, supaDelete, GREEN, INFO, CARD, CARD2, BORDER, DIM, MED, TEXT, SERIF, eyebrow, type Anomaly, type HomeRecord, type RepairRow, SEV_COLOR, SEV_LABEL } from './shared';
import { homeView, ClaimToAdd } from './ui';

function repairRefOf(a: Anomaly, i: number): string { return a.id || `a${i}`; }
function repairFp(a: Anomaly): string { return `${a.id ?? ''}:${a.severity ?? ''}:${(a.description ?? '').slice(0, 40)}`; }
function repairText(r: RepairRow): string { return (r.edited_text && r.edited_text.trim()) || r.generated_text || ''; }

// Plain-text handoff document — copy/paste into an email, form, or text.
function buildRepairText(record: HomeRecord, items: RepairRow[]): string {
  const head = `REPAIR REQUEST\n${record.address ?? ''}${record.inspection_date ? ` · Inspected ${record.inspection_date}` : ''}\n`;
  const body = items.map((r, i) => {
    const ctx = [r.item, r.location].filter(Boolean).join(' · ');
    return `${i + 1}. ${repairText(r)}${ctx ? `\n   (${ctx})` : ''}`;
  }).join('\n\n');
  return `${head}\n${body}\n\nThis is a buyer-prepared repair request based on the inspection findings. It is not a legal form or legal advice.\nPrepared with Ledrix · ledrixlabs.com`;
}

async function draftRepairRequest(a: Anomaly): Promise<{ item: string; remedy: string; request: string } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch('/api/ledrix/repair', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ finding: { unit: a.unit, location: a.location, severity: a.severity, isSafety: !!a.isSafety, description: homeView(a).description } }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.request ? j : null;
  } catch { return null; }
}

function RepairItemCard({ r, index, busy, onRemove, onSave, readOnly }: { r: RepairRow; index: number; busy: boolean; onRemove: () => void; onSave: (t: string) => void; readOnly?: boolean }) {
  const [text, setText] = useState(repairText(r));
  useEffect(() => { setText(repairText(r)); }, [r.generated_text, r.edited_text]);
  const sev = (r.severity ?? '').toLowerCase();
  const tagColor = SEV_COLOR[sev] ?? INFO;
  const tagLabel = SEV_LABEL[sev] ?? 'MAINTENANCE';
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '13px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: MED, fontSize: 9, fontWeight: 600, fontFamily: 'Roboto Mono, monospace' }}>{index}.</span>
        <span style={{ color: tagColor, fontSize: 7.5, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', border: `1px solid ${tagColor}44`, borderRadius: 6, padding: '2px 6px' }}>{tagLabel}</span>
        {r.item && <span style={{ color: MED, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item}{r.location ? ` · ${r.location}` : ''}</span>}
        <span style={{ flex: 1 }} />
        {!readOnly && <button onClick={onRemove} title="Remove from request" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 17, lineHeight: 1 }}>×</button>}
      </div>
      {busy && !r.generated_text ? (
        <div style={{ color: DIM, fontSize: 10, fontStyle: 'italic', animation: 'pulse 1.4s infinite', padding: '4px 2px' }}>Ledrix is drafting the request…</div>
      ) : readOnly ? (
        <div style={{ color: TEXT, fontSize: 12.5, lineHeight: 1.55, padding: '4px 2px', whiteSpace: 'pre-wrap' }}>{repairText(r)}</div>
      ) : (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => onSave(text)}
          rows={2}
          style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12.5, lineHeight: 1.55, padding: '9px 11px', resize: 'vertical', fontFamily: 'Inter, system-ui, sans-serif' }}
        />
      )}
    </div>
  );
}

function AddFindingRow({ a, busy, onAdd }: { a: Anomaly; busy: boolean; onAdd: () => void }) {
  const tagColor = SEV_COLOR[(a.severity ?? '').toLowerCase()] ?? INFO;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tagColor, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: TEXT, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.unit || 'Finding'}{a.location ? ` · ${a.location}` : ''}</div>
        <div style={{ color: DIM, fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{homeView(a).description}</div>
      </div>
      <button onClick={onAdd} disabled={busy} style={{ flexShrink: 0, background: busy ? CARD2 : 'none', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: '6px 12px', fontSize: 8, fontWeight: 600, letterSpacing: 1, cursor: busy ? 'default' : 'pointer', fontFamily: 'Roboto Mono, monospace' }}>{busy ? '…' : 'ADD'}</button>
    </div>
  );
}

function RepairsTab({ anomalies, shareId, repairs, record, onRefresh, signedIn }: {
  anomalies: Anomaly[]; shareId: string; repairs: RepairRow[]; record: HomeRecord; onRefresh: () => Promise<void> | void; signedIn: boolean;
}) {
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const setBusyRef = (ref: string, on: boolean) => setBusy(s => { const n = new Set(s); if (on) n.add(ref); else n.delete(ref); return n; });

  const byRef = new Map(repairs.map(r => [r.anomaly_ref ?? '', r]));
  const included = repairs.filter(r => r.status === 'included').sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
  const available = anomalies.map((a, i) => ({ a, ref: repairRefOf(a, i) })).filter(({ ref }) => !byRef.has(ref));

  const addOne = async (a: Anomaly, ref: string) => {
    if (!can('repair.edit')) return;
    if (busy.has(ref)) return;
    setBusyRef(ref, true);
    try {
      await supaPost('home_repairs', {
        share_id: shareId, anomaly_ref: ref, item: a.unit ?? null, location: a.location ?? null,
        severity: a.severity ?? null, status: 'included', sort_order: Date.now(),
      });
      await onRefresh();
      const w = await draftRepairRequest(a);
      if (w) {
        await supaPatch('home_repairs', `share_id=eq.${encodeURIComponent(shareId)}&anomaly_ref=eq.${encodeURIComponent(ref)}`,
          { item: w.item || a.unit || null, remedy: w.remedy, generated_text: w.request, source_fp: repairFp(a), updated_at: new Date().toISOString() });
        await onRefresh();
      }
    } finally { setBusyRef(ref, false); }
  };
  const addAll = async () => { if (!can('repair.edit')) return; for (const { a, ref } of available) await addOne(a, ref); };
  const remove = async (r: RepairRow) => { if (!can('repair.edit')) return; await supaDelete('home_repairs', `id=eq.${encodeURIComponent(r.id)}`); await onRefresh(); };
  const saveText = async (r: RepairRow, text: string) => {
    if (!can('repair.edit')) return;
    const v = text.trim();
    if (v === repairText(r)) return;
    await supaPatch('home_repairs', `id=eq.${encodeURIComponent(r.id)}`, { edited_text: v || null, updated_at: new Date().toISOString() });
    await onRefresh();
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(buildRepairText(record, included)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  // The public, no-login hand-off link the buyer sends the seller/agent.
  const shareLink = async () => {
    if (!can('repair.share')) return;
    // A repairs-only link (/api/portal-links): the recipient sees the request, not the report, and
    // cannot change anything. The old link was built from the share_id, which no route accepts.
    const link = await shareUrlFor('repairs');
    if (!link.ok) { window.alert(`${link.message} You can use Copy text instead.`); return; }
    const url = link.url;
    try {
      if (navigator.share) await navigator.share({ title: 'Repair Request', url });
      else { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
    } catch {}
  };

  if (!signedIn) {
    return (
      <div style={{ padding: '40px 28px', textAlign: 'center', color: MED }}>
        <div style={{ fontSize: 22, marginBottom: 10 }}>🔑</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.7 }}>Sign in (top-right) to build your repair request. Ledrix drafts neutral wording from the findings — <b style={{ color: TEXT }}>you choose</b> what to ask the seller to repair.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Home Record</div>
      <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Repair Request</div>
      <p style={{ color: MED, fontSize: 10.5, lineHeight: 1.6, marginBottom: 16 }}>
        Your list to give the seller — <b style={{ color: TEXT }}>you decide</b> what to ask to be repaired. Ledrix drafts neutral wording; edit anything. This is a draft, not legal advice.
      </p>

      {included.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {can('repair.share') && <button onClick={shareLink} style={{ width: '100%', background: linkCopied ? `${GREEN}20` : TEXT, border: `1px solid ${linkCopied ? GREEN + '55' : TEXT}`, color: linkCopied ? GREEN : '#fff', borderRadius: 8, padding: '11px', fontSize: 9.5, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>{linkCopied ? 'LINK COPIED ✓' : 'SHARE REQUEST LINK'}</button>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyText} style={{ flex: 1, background: copied ? `${GREEN}20` : 'none', border: `1px solid ${copied ? GREEN + '44' : BORDER}`, color: copied ? GREEN : TEXT, borderRadius: 8, padding: '9px', fontSize: 9, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>{copied ? 'COPIED ✓' : 'COPY TEXT'}</button>
            <button onClick={() => window.print()} style={{ flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: '9px', fontSize: 9, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>PRINT / PDF</button>
          </div>
        </div>
      )}

      {included.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0 26px', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📝</div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace' }}>NOTHING REQUESTED YET</div>
          <div style={{ fontSize: 10.5, marginTop: 6, color: MED }}>{can('repair.edit') ? 'Add findings below to build your request.' : lookOnly() ? 'Claim this home to build a repair request.' : 'This view-only link cannot change the request.'}</div>
        </div>
      ) : included.map((r, i) => (
        <RepairItemCard key={r.id} r={r} index={i + 1} busy={busy.has(r.anomaly_ref ?? '')} onRemove={() => remove(r)} onSave={t => saveText(r, t)} readOnly={!can('repair.edit')} />
      ))}

      <ClaimToAdd label="Add findings to the request" />
      {can('repair.edit') && <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 12px' }}>
        <div style={{ color: MED, fontSize: 9, fontWeight: 600, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>ADD FROM FINDINGS</div>
        {available.length > 0 && (
          <button onClick={addAll} style={{ background: 'none', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: '6px 12px', fontSize: 8, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>+ ADD ALL ({available.length})</button>
        )}
      </div>
      {available.length === 0 ? (
        <div style={{ color: GREEN, fontSize: 9, fontWeight: 600, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace', padding: '4px 0 24px' }}>✓ EVERY FINDING ADDED</div>
      ) : available.map(({ a, ref }) => (
        <AddFindingRow key={ref} a={a} busy={busy.has(ref)} onAdd={() => addOne(a, ref)} />
      ))}
      </>}
      <div style={{ height: 28 }} />

      {/* Print/PDF document — off-screen on screen; @media print reveals only this. */}
      <div id="repair-print" style={{ position: 'fixed', left: -10000, top: 0, width: 640, background: '#fff', color: '#111', padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>Repair Request</div>
        <div style={{ fontSize: 12.5, color: '#444', marginTop: 4 }}>
          {record.address ?? ''}{record.inspection_date ? ` · Inspected ${record.inspection_date}` : ''}
        </div>
        <div style={{ borderTop: '2px solid #111', margin: '14px 0 18px' }} />
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          {included.map(r => (
            <li key={r.id} style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
              {repairText(r)}
              {(r.item || r.location) && (
                <div style={{ fontSize: 11, color: '#777', marginTop: 3 }}>{[r.item, r.location].filter(Boolean).join(' · ')}</div>
              )}
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 10.5, color: '#666', marginTop: 22, lineHeight: 1.5 }}>
          This is a buyer-prepared repair request based on the inspection findings. It is not a legal form or legal advice.
        </p>
        <div style={{ fontSize: 10.5, color: '#999', marginTop: 8 }}>Prepared with Ledrix · ledrixlabs.com</div>
      </div>
    </div>
  );
}
export { repairRefOf, repairFp, repairText, buildRepairText, draftRepairRequest, RepairItemCard, AddFindingRow, RepairsTab };
