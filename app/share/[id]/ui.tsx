import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { LedrixDelta as ValDeltaSVG } from '@/components/LedrixDelta';
import { LedrixEye } from '@/components/LedrixEye';
import { AccountButton, type AccountInfo } from './Account';
import { assetUrl } from '@/lib/portalAssets';
import { forHomeowner, neutralProSearch, FURTHER_EVALUATION_HEADING } from '@/lib/homeownerRecommendation';
import { PORTAL_TOKEN, can, lookOnly, openClaim, supaPost, supaPatch, BLUE, ACCENT, CRITICAL, WARN, GREEN, INFO, PURPLE, BG, CARD, CARD2, BORDER, DIM, MED, TEXT, SERIF, eyebrow, type Anomaly, type HomeRecord, type Project, type Reminder, type Tab, TAB_LABEL, RAIL, RAIL_OF, STATUS_COLOR, STATUS_LABEL, STATUS_NEXT, SEV_COLOR, SEV_LABEL, priorityOf, fmtDate, addDays, haversineM, isApplianceSystem, compressPhoto, GLASS, TINT_INFO } from './shared';

// ─── Icon ─────────────────────────────────────────────────────────────────────
// Clean SVG line icons (Lucide-style) matching the inspector app's thin-stroke
// look — replaces the inconsistent unicode/emoji glyphs.
type IconName = 'home' | 'findings' | 'specs' | 'projects' | 'reminders' | 'docs' | 'camera';
function Icon({ name, size = 22, color = TEXT }: { name: IconName; size?: number; color?: string }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (<svg {...common}><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /><path d="M9.5 20v-6h5v6" /></svg>);
    case 'findings':
      return (<svg {...common}><path d="M6 3h12l3.5 6L12 21.5 2.5 9z" /><path d="M2.5 9h19M9 3l-3 6 6 12 6-12-3-6" /></svg>);
    case 'projects':
      return (<svg {...common}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>);
    case 'reminders':
      return (<svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
    case 'docs':
      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></svg>);
    case 'specs':
      return (<svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.4" /><rect x="13" y="3" width="8" height="8" rx="1.4" /><rect x="3" y="13" width="8" height="8" rx="1.4" /><rect x="13" y="13" width="8" height="8" rx="1.4" /></svg>);
    case 'camera':
      return (<svg {...common}><path d="M3 8a2 2 0 0 1 2-2h1.6L8 3.8h8L17.4 6H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.4" /></svg>);
  }
}

// ─── Logo (the Ledrix delta mark — matches the marketing site) ──────────────────
function Logo({ size = 32 }: { size?: number }) {
  const r = Math.round(size * 0.22);
  return (
    <div style={{ width: size, height: size, borderRadius: r, backgroundColor: '#080808',
      border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* The logo: white on its black tile (owner 2026-11-26, logo option D). Ledrix blue stays for Ledrix Intelligence. */}
      <ValDeltaSVG size={Math.round(size * 0.82)} color="#FFFFFF" />
    </div>
  );
}

// ─── FindingCard → opens the full homeowner card (price · pros · videos · Ask Ledrix) ──
// Resolve an anomaly's photo to a loadable URL: absolute stays as-is; a private evidence
// storage path routes through the /api/photo signing proxy; a never-uploaded file:// → none.
function photoUrl(uri?: string | null): string | null {
  if (!uri) return null;
  if (/^https?:\/\//.test(uri)) {
    // Finding photos live in the inspection-pdfs bucket (may be private) → sign server-side.
    // Any other absolute URL is already public/external and passes through untouched.
    return uri.includes('/inspection-pdfs/') ? assetUrl('report-asset', uri, PORTAL_TOKEN) : uri;
  }
  if (uri.startsWith('file')) return null;
  // Both signing routes require the share token (Phase 0b, 2026-10-10) — see lib/portalAssets.ts.
  return assetUrl('photo', uri, PORTAL_TOKEN);
}

// Fullscreen image viewer — tap anywhere or ✕ to close.
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      <button aria-label="Close" style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>✕</button>
    </div>
  );
}

// Split a prose observation into short bullets at sentence boundaries — mirrors the app's proseToBullets
// so a legacy finding (no observationBullets) still renders in the canonical bulleted format.
// What a homeowner reads of a finding's text (owner decision 2026-10-13). Every render of a finding's
// description, bullets or legacy recommendation goes through this; the stored record is never
// changed, and identity uses (repair fingerprints, project de-duplication) keep the raw text.
// `LOCATION:` header lines are stripped first, as every render here already did.
const homeView = (a: Anomaly) => forHomeowner({ ...a, description: (a.description ?? '').replace(/^LOCATION:.*\n?/i, '').trim(), issue: a.issueTitle });
// home_projects carry a priority, not a severity; map it so the same rule applies to their copied text.
const projectSeverity = (priority?: string) => priority === 'critical' ? 'critical' : priority === 'high' ? 'deficiency' : 'maintenance';
function splitBullets(text: string): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  return t.replace(/([.!?])\s+/g, '$1').split('').map(s => s.trim()).filter(Boolean);
}
// Uppercase field label — matches the AnalysisConfirmSheet / PDF canonical card sections.
function FLabel({ children }: { children: ReactNode }) {
  return <div style={{ ...eyebrow(DIM, 7.5), marginBottom: 3 }}>{children}</div>;
}

// The printable PDF link. Routed through the /api/report-asset signing proxy (keyed on the
// canonical share_id storage path) so it works when the inspection-pdfs bucket is private —
// and regardless of whether the pdf_url column was ever stamped. If pdf_url holds a full
// public inspection-pdfs URL, the proxy normalizes it back to the object path and signs it.
function pdfHref(record: HomeRecord): string | null {
  const src = record.pdf_url || (record.share_id ? `${record.share_id}/report.pdf` : '');
  return src ? assetUrl('report-asset', src, PORTAL_TOKEN) : null;
}

function FindingCard({ a, zip, cityState, shareId }: { a: Anomaly; zip?: string; cityState?: string; shareId: string }) {
  const p = priorityOf(a);
  const color = p.color;
  const [open, setOpen] = useState(false);
  const img = photoUrl(a.imageUri);
  return (
    <>
      <div onClick={() => setOpen(true)} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderLeft: `2px solid ${color}`,
        borderRadius: 10, padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
      }}>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 6, marginBottom: 12 }} />
        )}
        <div style={{ marginBottom: 10 }}>
          <FLabel>ISSUE</FLabel>
          <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{(a.issueTitle && a.issueTitle.trim()) || a.unit || 'Finding'}</div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FLabel>SYSTEM</FLabel>
            <div style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{a.component || a.unit || 'Component'}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FLabel>PRIORITY</FLabel>
            <div style={{ color, fontSize: 11.5, fontWeight: 700 }}>{p.label}</div>
          </div>
          {a.location && (
            <div style={{ flex: 1.2, minWidth: 0 }}>
              <FLabel>LOCATION</FLabel>
              <div style={{ color: TEXT, fontSize: 12, fontWeight: 500 }}>{a.location}</div>
            </div>
          )}
        </div>
        <div>
          <FLabel>OBSERVATIONS</FLabel>
          {(() => { const hv = homeView(a); return (<>
          {hv.observations.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, marginTop: 4 }}>
              <span style={{ color: DIM, flexShrink: 0, lineHeight: 1.55 }}>•</span>
              <span style={{ color: MED, fontSize: 12, lineHeight: 1.55 }}>{b}</span>
            </div>
          ))}
          {hv.evaluation && <div style={{ ...eyebrow(TEXT, 7.5), marginTop: 8 }}>{hv.evaluation.heading}</div>}
          </>); })()}
        </div>
        <div style={{ ...eyebrow(MED, 8), marginTop: 12 }}>Tap for details →</div>
      </div>
      {open && <FindingDetailModal a={a} zip={zip} cityState={cityState} shareId={shareId} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── FindingDetailModal — the homeowner card ───────────────────────────────────
function CardSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 18, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
      <div style={{ ...eyebrow(MED, 8), marginBottom: 9 }}>{label}</div>
      {children}
    </div>
  );
}
function FindingDetailModal({ a, zip, cityState, shareId, onClose }: { a: Anomaly; zip?: string; cityState?: string; shareId: string; onClose: () => void }) {
  const sev = a.severity ?? 'cosmetic';
  const color = SEV_COLOR[sev] ?? MED;
  const [zoom, setZoom] = useState<string | null>(null);
  const img = photoUrl(a.imageUri);

  // The stored prosToCall is never the search term or a recommendation here — for historical findings it
  // is the model's guess from the system (owner decision 2026-10-13, lib/homeownerRecommendation.ts).
  // The search names the THING the finding is about; null = no pros list at all.
  const search = neutralProSearch(a);
  const hv = homeView(a);
  const evaluation = hv.evaluation;
  const where = zip || cityState || '';
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${a.unit ?? ''} ${homeView(a).description.slice(0, 60)} how to fix`)}`;

  const [pros, setPros] = useState<{ name: string; rating?: number; reviews?: number; phone?: string; website?: string }[]>([]);
  const [prosLoading, setProsLoading] = useState(false);

  const [msgs, setMsgs] = useState<{ role: 'user' | 'ledrix'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Top-3 local pros (by reviews) — tappable call list, fetched server-side from Places.
  useEffect(() => {
    let alive = true;
    if (!where || !search) { setPros([]); return; }
    setProsLoading(true);
    fetch(`/api/pros?zip=${encodeURIComponent(where)}&trade=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(j => { if (alive) setPros(Array.isArray(j.pros) ? j.pros : []); })
      .catch(() => {})
      .finally(() => { if (alive) setProsLoading(false); });
    return () => { alive = false; };
  }, [where, search]);

  const ask = async () => {
    const q = input.trim(); if (!q || busy) return;
    setMsgs(m => [...m, { role: 'user', text: q }]); setInput(''); setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setMsgs(m => [...m, { role: 'ledrix', text: 'Sign in (top-right) to ask Ledrix about this finding.' }]); return; }
      const seeded = [{ role: 'user' as const, content: `About the finding "${a.unit ?? ''}: ${hv.description}"${a.location ? ` (${a.location})` : ''} — ${q}` }];
      const r = await fetch('/api/ledrix', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shareId, token: PORTAL_TOKEN, mode: 'chat', messages: seeded }),
      });
      const j = await r.json();
      setMsgs(m => [...m, { role: 'ledrix', text: r.ok ? (j.text ?? '…') : (j.error ?? 'Ledrix is unavailable.') }]);
    } catch { setMsgs(m => [...m, { role: 'ledrix', text: 'Network error.' }]); }
    finally { setBusy(false); }
  };

  const cta: CSSProperties = {
    display: 'inline-block', background: CARD2, border: `1px solid ${BORDER}`, color: TEXT,
    fontSize: 12, fontWeight: 600, padding: '10px 14px', borderRadius: 9, textDecoration: 'none',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: BG, borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ ...eyebrow(color, 8), background: `${color}12`, padding: '4px 10px', borderRadius: 5, border: `1px solid ${color}33` }}>{SEV_LABEL[sev] ?? sev.toUpperCase()}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MED, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} onClick={() => setZoom(img)} alt={a.unit ?? 'Finding photo'} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 8, marginBottom: 14, cursor: 'zoom-in' }} />
        )}
        {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
        <h3 style={{ fontFamily: SERIF, color: TEXT, fontSize: 19, fontWeight: 600, margin: '0 0 4px' }}>{a.unit ?? 'Finding'}</h3>
        {a.location && <div style={{ ...eyebrow(DIM, 8), marginBottom: 12 }}>{a.location}</div>}
        <p style={{ color: TEXT, fontSize: 13, lineHeight: 1.65, margin: '0 0 8px' }}>{hv.description}</p>
        {hv.recommendation && <p style={{ color: MED, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{hv.recommendation}</p>}
        {evaluation && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...eyebrow(TEXT, 8), marginBottom: 4 }}>{evaluation.heading}</div>
            <p style={{ color: MED, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{evaluation.text}</p>
          </div>
        )}

        {search && <CardSection label="TOP-RATED LOCAL PROS · MIN. 20 REVIEWS">
          {pros.length > 0 ? pros.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', marginBottom: 7 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: TEXT, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ color: MED, fontSize: 10.5, marginTop: 1 }}>{p.rating ? `★ ${p.rating}` : ''}{p.reviews ? `  (${p.reviews.toLocaleString()})` : ''}</div>
              </div>
              {p.phone && <a href={`tel:${p.phone}`} style={{ ...cta, padding: '8px 12px', color: GREEN, textDecoration: 'none' }}>Call</a>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ ...cta, padding: '8px 12px' }}>Site</a>}
            </div>
          )) : (
            <div style={{ color: DIM, fontSize: 11 }}>{prosLoading ? 'Finding local pros…' : 'No local pros found for this area yet.'}</div>
          )}
        </CardSection>}

        <CardSection label="REPAIR VIDEOS">
          <a href={ytUrl} target="_blank" rel="noreferrer" style={cta}>▶ Watch how-to videos</a>
          <p style={{ color: WARN, fontSize: 10.5, lineHeight: 1.55, marginTop: 9, borderLeft: `2px solid ${WARN}66`, paddingLeft: 10 }}>
            Videos are a guide for minor upkeep only. For anything structural, electrical, gas, or plumbing — use a licensed pro.
          </p>
        </CardSection>

        <CardSection label="ASK LEDRIX ABOUT THIS">
          {msgs.map((m, i) => (
            <div key={i} style={{ marginBottom: 8, textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <span style={{ display: 'inline-block', background: m.role === 'user' ? `${BLUE}10` : CARD, border: `1px solid ${m.role === 'user' ? BLUE + '2e' : BORDER}`, color: TEXT, fontSize: 12, lineHeight: 1.55, padding: '8px 11px', borderRadius: 10, maxWidth: '85%', textAlign: 'left' }}>{m.text}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(); }} placeholder="Is this urgent? Can I DIY it?" style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', color: TEXT, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={ask} disabled={busy || !input.trim()} style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 9, padding: '0 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: busy || !input.trim() ? 0.4 : 1 }}>{busy ? '…' : 'Ask'}</button>
          </div>
        </CardSection>
      </div>
    </div>
  );
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────
function ProjectCard({ p, onUpdate, shareId, address }: { p: Project; onUpdate: () => void; shareId: string; address?: string }) {
  const [saving, setSaving] = useState(false);
  const [showAppliance, setShowAppliance] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_COLOR[p.status] ?? DIM;
  const pc = p.priority === 'critical' ? CRITICAL : p.priority === 'high' ? WARN : p.priority === 'low' ? GREEN : INFO;
  // The project's title and recommendation were COPIED from a finding, so they carry its legacy
  // specialist text; same homeowner rule (owner 2026-10-13). The stored row is not changed.
  const pvRaw = forHomeowner({ severity: projectSeverity(p.priority), description: p.title ?? '', recommendation: p.recommendation });
  // When the whole title was an unsupported specialist recommendation the corrected text is empty, and
  // falling back to p.title would put it straight back — so a CHANGED title falls back to the neutral
  // heading. An unchanged title (including an empty one) falls back to p.title exactly as before.
  const pv = { title: pvRaw.description || (pvRaw.changed ? (pvRaw.evaluation?.heading ?? FURTHER_EVALUATION_HEADING) : p.title),
               recommendation: pvRaw.recommendation, evaluation: pvRaw.evaluation };

  const advance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!can('project.update')) return;
    if (p.status === 'resolved') return;
    setSaving(true);
    await supaPatch('home_projects', `id=eq.${p.id}`, { status: STATUS_NEXT[p.status] });
    onUpdate(); setSaving(false);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!can('project.update')) return;
    const file = e.target.files?.[0]; if (!file) return;
    setSaving(true);
    const b64 = await compressPhoto(file);
    const photos = [...(p.photos ?? []), b64];
    await supaPatch('home_projects', `id=eq.${p.id}`, { photos });
    onUpdate(); setSaving(false);
  };

  return (
    <>
      <div onClick={() => setExpanded(v => !v)} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${sc}`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ background: `${sc}18`, color: sc, fontSize: 7, fontWeight: 600, letterSpacing: 1,
                padding: '2px 7px', borderRadius: 99, border: `1px solid ${sc}44`, fontFamily: 'Roboto Mono, monospace',
                whiteSpace: 'nowrap' }}>{STATUS_LABEL[p.status] ?? p.status.toUpperCase()}</span>
              {p.system && <span style={{ color: DIM, fontSize: 8, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>{p.system.toUpperCase()}</span>}
            </div>
            <div style={{ color: TEXT, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{pv.title}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {p.budget_estimate && p.budget_estimate !== 'N/A' && (
              <div style={{ color: WARN, fontSize: 9, fontWeight: 700 }}>{p.budget_estimate}</div>
            )}
            <div style={{ color: pc, fontSize: 7, fontWeight: 600, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', marginTop: 2 }}>
              {(p.priority ?? 'medium').toUpperCase()}
            </div>
          </div>
        </div>

        {expanded && (
          <div onClick={e => e.stopPropagation()} style={{ paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            {pv.recommendation && <p style={{ color: MED, fontSize: 11, lineHeight: 1.6, marginBottom: 10 }}>{pv.recommendation}</p>}
            {pv.evaluation && <p style={{ color: MED, fontSize: 11, lineHeight: 1.6, marginBottom: 10 }}><b>{pv.evaluation.heading}</b> — {pv.evaluation.text}</p>}
            {/* No CONTRACTOR line: contractor_type was only ever copied from a finding's prosToCall — the
                model's guess from the system — so it is not shown as a recommendation (owner 2026-10-13). */}

            {/* Photo thumbnails */}
            {p.photos?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.photos.map((ph, i) => (
                  <img key={i} src={ph} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                ))}
              </div>
            )}

            {/* Appliance info badge */}
            {p.appliance_info?.model && (
              <div style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}30`, borderRadius: 8,
                padding: '8px 12px', marginBottom: 10, fontSize: 10, color: GREEN }}>
                ✓ {p.appliance_info.brand} {p.appliance_info.model}
                {p.appliance_info.serial && ` · S/N ${p.appliance_info.serial}`}
              </div>
            )}

            {can('project.update') && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.status !== 'resolved' && (
                <button onClick={advance} disabled={saving} style={{
                  background: `${sc}15`, border: `1px solid ${sc}44`, color: sc,
                  borderRadius: 8, padding: '7px 14px', fontSize: 9, fontWeight: 700,
                  letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
                }}>
                  {saving ? '...' : `MARK ${STATUS_LABEL[STATUS_NEXT[p.status]] ?? 'DONE'}`}
                </button>
              )}
              <button onClick={() => fileRef.current?.click()} style={{
                background: 'none', border: `1px solid ${BORDER}`, color: TEXT,
                borderRadius: 8, padding: '7px 14px', fontSize: 9, fontWeight: 700,
                letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
              }}>ADD PHOTO</button>
              {isApplianceSystem(p.system) && (
                <button onClick={() => setShowAppliance(true)} style={{
                  background: `${PURPLE}10`, border: `1px solid ${PURPLE}30`, color: PURPLE,
                  borderRadius: 8, padding: '7px 14px', fontSize: 9, fontWeight: 700,
                  letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
                }}>REPLACE APPLIANCE</button>
              )}
            </div>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhoto} style={{ display: 'none' }} />
          </div>
        )}
        {!expanded && <div style={{ marginTop: 4, color: DIM, fontSize: 9, fontWeight: 700 }}>{can('project.update') ? 'TAP FOR ACTIONS' : 'TAP FOR DETAILS'}</div>}
      </div>

      {showAppliance && can('project.update') && (
        <ApplianceModal
          project={p}
          shareId={shareId}
          address={address}
          onClose={() => setShowAppliance(false)}
          onSave={onUpdate}
        />
      )}
    </>
  );
}

// ─── ApplianceModal ───────────────────────────────────────────────────────────
function ApplianceModal({ project, shareId, address, onClose, onSave }: {
  project: Project; shareId: string; address?: string;
  onClose: () => void; onSave: () => void;
}) {
  const [geoStatus, setGeoStatus] = useState<'checking' | 'at-property' | 'off-site' | 'unavailable'>('checking');
  const [geoDistance, setGeoDistance] = useState<number | null>(null);
  const [brand, setBrand] = useState(project.appliance_info?.brand ?? '');
  const [model, setModel] = useState(project.appliance_info?.model ?? '');
  const [serial, setSerial] = useState(project.appliance_info?.serial ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: uLat, longitude: uLng } = pos.coords;
      let pLat: number | null = null, pLng: number | null = null;
      if (address) {
        try {
          const r = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
          const d = await r.json();
          pLat = d.lat; pLng = d.lng;
        } catch { /* ignore */ }
      }
      if (pLat && pLng) {
        const dist = haversineM(uLat, uLng, pLat, pLng);
        setGeoDistance(Math.round(dist));
        setGeoStatus(dist <= 150 ? 'at-property' : 'off-site');
      } else {
        setGeoStatus('unavailable');
      }
    }, () => setGeoStatus('unavailable'));
  }, [address]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const b64 = await compressPhoto(file);
    setPhoto(b64);
    // Try BarcodeDetector
    if ('BarcodeDetector' in window) {
      try {
        const img = new Image(); img.src = b64;
        await new Promise(r => { img.onload = r; });
        // @ts-ignore
        const detector = new BarcodeDetector();
        const codes = await detector.detect(img);
        if (codes.length > 0) setSerial(codes[0].rawValue);
      } catch { /* not supported */ }
    }
  };

  const handleSave = async () => {
    if (!can('project.update')) return;
    setSaving(true);
    let photos = project.photos ?? [];
    if (photo) photos = [...photos, photo];
    const appliance_info = { brand, model, serial, scanned_at: new Date().toISOString() };
    await supaPatch('home_projects', `id=eq.${project.id}`, { appliance_info, photos });
    if (project.status !== 'resolved') {
      await supaPatch('home_projects', `id=eq.${project.id}`, { status: 'resolved' });
    }
    onSave(); onClose();
  };

  const geoColor = geoStatus === 'at-property' ? GREEN : geoStatus === 'off-site' ? WARN : DIM;
  const geoLabel = geoStatus === 'checking' ? 'LOCATING...' : geoStatus === 'at-property'
    ? `AT PROPERTY · ${geoDistance}m` : geoStatus === 'off-site'
    ? `OFF-SITE · ${geoDistance}m away` : 'LOCATION UNAVAILABLE';

  const inputStyle = {
    width: '100%', background: CARD, border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '10px 12px', color: TEXT,
    fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0',
        padding: 24, width: '100%', maxWidth: 430, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ color: PURPLE, fontSize: 9, fontWeight: 600, letterSpacing: 3,
          fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>REPLACE APPLIANCE</div>
        <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          {project.system ?? project.title}
        </div>

        {/* Geo indicator */}
        <div style={{ background: `${geoColor}10`, border: `1px solid ${geoColor}30`,
          borderRadius: 8, padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: geoColor, fontSize: 8, fontWeight: 600, letterSpacing: 1,
            fontFamily: 'Roboto Mono, monospace' }}>{geoLabel}</span>
        </div>

        {/* Photo capture */}
        <button onClick={() => fileRef.current?.click()} style={{
          width: '100%', background: photo ? `${GREEN}10` : 'none',
          border: `1px solid ${photo ? GREEN + '33' : BORDER}`,
          color: photo ? GREEN : TEXT, borderRadius: 10, padding: '12px',
          fontSize: 10, fontWeight: 600, letterSpacing: 1, cursor: 'pointer',
          fontFamily: 'Roboto Mono, monospace', marginBottom: 16,
        }}>
          {photo ? '✓ PHOTO CAPTURED — TAP TO RETAKE' : '📷 TAKE PHOTO OF ID TAG'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          onChange={handlePhoto} style={{ display: 'none' }} />
        {photo && <img src={photo} alt="ID tag" style={{ width: '100%', borderRadius: 10,
          marginBottom: 16, border: `1px solid ${BORDER}` }} />}

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 600, letterSpacing: 1.5,
              fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>BRAND</div>
            <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Carrier"
              style={inputStyle} />
          </div>
          <div>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 600, letterSpacing: 1.5,
              fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>MODEL</div>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 24ACC636A003"
              style={inputStyle} />
          </div>
          <div>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 600, letterSpacing: 1.5,
              fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>SERIAL{serial && ' (SCANNED)'}</div>
            <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="e.g. 1234A567890"
              style={{ ...inputStyle, borderColor: serial ? GREEN : BORDER }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: MED,
            borderRadius: 10, padding: 12, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Roboto Mono, monospace',
          }}>CANCEL</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 2, background: `${PURPLE}20`, border: `1px solid ${PURPLE}44`, color: PURPLE,
            borderRadius: 10, padding: 12, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Roboto Mono, monospace',
          }}>{saving ? 'SAVING...' : 'SAVE REPLACEMENT'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── ReminderCard ─────────────────────────────────────────────────────────────
function ReminderCard({ r, onUpdate, access, onUnlock }: { r: Reminder; onUpdate: () => void; access: boolean; onUnlock: () => void }) {
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const overdue = r.due_date && r.due_date < today;
  const soon = r.due_date && r.due_date <= addDays(7) && !overdue;
  const dotColor = r.completed ? GREEN : overdue ? CRITICAL : soon ? WARN : INFO;

  const complete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!can('reminder.update')) return;
    if (!access) { onUnlock(); return; }
    setSaving(true);
    // Record the completion to the permanent service history (Carfax) before advancing the schedule.
    await supaPost('home_maintenance_log', [{ share_id: r.share_id, title: r.title, system: r.system ?? null, kind: 'service', source: 'task', reminder_id: r.id, done_date: today }]).catch(() => {});
    // last_done: when it was done, which the Home app shows (one list since ruling A, 2026-11-04).
    let update: object = { completed: true, last_done: today };
    if (r.recurrence) {
      const days = parseInt(r.recurrence);
      update = { completed: false, due_date: addDays(days), last_done: today };
    }
    await supaPatch('home_reminders', `id=eq.${r.id}`, update);
    onUpdate(); setSaving(false);
  };
  const snooze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!can('reminder.update')) return;
    setSaving(true);
    await supaPatch('home_reminders', `id=eq.${r.id}`, { snoozed_until: addDays(7), due_date: addDays(7) });
    onUpdate(); setSaving(false);
  };

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 8,
      opacity: r.completed ? 0.45 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor,
          flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: r.completed ? MED : TEXT, fontSize: 14, fontWeight: 700,
            lineHeight: 1.4, textDecoration: r.completed ? 'line-through' : 'none',
            marginBottom: 4 }}>{r.title}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {r.system && <span style={{ color: DIM, fontSize: 8, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>{r.system.toUpperCase()}</span>}
            {r.due_date && (
              <span style={{ color: dotColor, fontSize: 8, fontWeight: 600, fontFamily: 'Roboto Mono, monospace' }}>
                {overdue ? 'OVERDUE · ' : soon ? 'SOON · ' : ''}{fmtDate(r.due_date)}
              </span>
            )}
            {r.recurrence && <span style={{ color: DIM, fontSize: 7, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>↻ RECURRING</span>}
          </div>
        </div>
      </div>
      {!r.completed && lookOnly() && <div style={{ marginTop: 8, color: DIM, fontSize: 11 }}><span aria-hidden>🔒</span> Claim this home to mark it done</div>}
      {!r.completed && can('reminder.update') && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={complete} disabled={saving} style={{
            background: `${GREEN}10`, border: `1px solid ${GREEN}30`, color: GREEN,
            borderRadius: 8, padding: '6px 14px', fontSize: 9, fontWeight: 700,
            letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
          }}>{saving ? '...' : r.recurrence ? 'DONE (RESET)' : 'COMPLETE'}</button>
          <button onClick={snooze} disabled={saving} style={{
            background: `${WARN}10`, border: `1px solid ${WARN}30`, color: WARN,
            borderRadius: 8, padding: '6px 14px', fontSize: 9, fontWeight: 700,
            letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
          }}>SNOOZE 7D</button>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  const bar = (w: string, h = 10, mb = 8) => (
    <div style={{ width: w, height: h, background: CARD2, borderRadius: 6, marginBottom: mb,
      animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
  return (
    <div style={{ padding: '24px 16px' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
      {bar('60%', 14, 12)}{bar('40%', 10, 24)}{bar('100%', 80, 12)}{bar('100%', 80, 12)}{bar('100%', 80)}
    </div>
  );
}

// ─── NotFound ─────────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 40, textAlign: 'center', gap: 16 }}>
      <div style={{ color: DIM, fontSize: 32 }}>◈</div>
      <div style={{ ...eyebrow(MED, 9) }}>Record not found</div>
      <p style={{ color: MED, fontSize: 12, lineHeight: 1.7, maxWidth: 280 }}>
        This Home Record may not be activated yet. Contact your inspector to publish this report.
      </p>
    </div>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar({ address, onShare, copied, active, onBack, signedIn, onSignOut, account }: { address: string; onShare: () => void; copied: boolean; active: Tab; onBack: () => void; signedIn?: boolean; onSignOut?: () => void; account?: AccountInfo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: GLASS,
      position: 'sticky', top: 0, zIndex: 90, backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)', width: '100%', boxSizing: 'border-box',
    }}>
      {active === 'home' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Logo size={28} />
          <span style={{ ...eyebrow(MED, 8) }}>Home Record</span>
        </div>
      ) : (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          ...eyebrow(TEXT, 9.5) }}>
          <span style={{ fontSize: 19, lineHeight: 1, marginTop: -2 }}>‹</span>
          <span>{TAB_LABEL[active] ?? active}</span>
        </button>
      )}
      <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
        {address && (
          <div style={{ fontFamily: SERIF, color: MED, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {address}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {signedIn && <AccountButton account={account} address={address} onSignOut={onSignOut} />}
        <button onClick={onShare} style={{
          background: 'none', border: `1px solid ${copied ? GREEN + '55' : BORDER}`,
          borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
          ...eyebrow(copied ? GREEN : TEXT, 8.5),
        }}>{copied ? 'Copied' : 'Share'}</button>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
// h2 — where a change would be, on the report's own link before its holder has claimed the home: a lock and
// "claim to add", one tap from claiming (approval pack item 1). Renders nothing for a holder or a view-only link.
function ClaimToAdd({ label }: { label: string }) {
  if (!lookOnly()) return null;
  return (
    <button onClick={openClaim} aria-label={`${label} — claim this home to add`}
      style={{ width: '100%', background: 'transparent', border: `1px dashed ${BORDER}`, color: DIM, borderRadius: 9, padding: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span aria-hidden>🔒</span>{label}<span style={{ fontWeight: 500 }}> · claim to add</span>
    </button>
  );
}

function Footer() {
  return (
    <div style={{ padding: '22px 16px 100px', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 9 }}><Logo size={28} /></div>
      <div style={{ ...eyebrow(DIM, 8), marginBottom: 8 }}>Ledrix Intelligence</div>
      <a href="https://ledrixlabs.com" style={{ color: MED, fontSize: 10, fontWeight: 500, textDecoration: 'none' }}>ledrixlabs.com</a>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
// ─── PhotoAnalyze — homeowner snaps a photo, Ledrix analyzes it (premium) ────────
function PhotoAnalyze({ access, onUnlock, shareId }: { access: boolean; onUnlock: () => void; shareId: string }) {
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = () => { if (!access) { onUnlock(); return; } fileRef.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = '';
    setErr(null); setResult(null); setBusy(true);
    try {
      const img = await compressPhoto(f);
      setPreview(img);
      const { data } = await supabase.auth.getSession();
      const resp = await fetch('/api/ledrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ mode: 'analyze', image: img, shareId, token: PORTAL_TOKEN }),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok && j.text) setResult(String(j.text));
      else setErr(j.error || 'Ledrix couldn’t analyze that photo.');
    } catch { setErr('Couldn’t read that photo.'); }
    setBusy(false);
  };
  const close = () => { setResult(null); setErr(null); setPreview(null); };

  return (
    <>
      {/* A card row in the page's own colours (light and dark, approval pack item 4) — the Home tab's grouped-row voice. */}
      <button onClick={pick} style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left', color: TEXT, fontFamily: 'inherit' }}>
        <span style={{ flexShrink: 0, width: 50, height: 50, borderRadius: '50%', display: 'grid', placeItems: 'center', background: TINT_INFO, boxShadow: `0 0 0 1px ${ACCENT}55` }}>
          <LedrixEye size={30} color={ACCENT} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>Analyze a photo</span>
          <span style={{ display: 'block', color: MED, fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>Snap anything in your home — Ledrix tells you what it is and whether it needs attention.</span>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      {(busy || result || err) && (
        <div onClick={() => { if (!busy) close(); }} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(14,21,24,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: CARD, borderRadius: '18px 18px 0 0', padding: '20px 20px 28px', maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={{ ...eyebrow(ACCENT), marginBottom: 12 }}>Ledrix · Photo analysis</div>
            {preview && <img src={preview} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 14 }} />}
            {busy
              ? <div style={{ color: MED, fontSize: 14, padding: '8px 0' }}>Ledrix is looking at your photo…</div>
              : err
              ? <div style={{ color: CRITICAL, fontSize: 14 }}>{err}</div>
              : <div style={{ color: TEXT, fontSize: 15, lineHeight: 1.6 }}>{result}</div>}
            {!busy && <button onClick={close} style={{ marginTop: 16, width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>}
          </div>
        </div>
      )}
    </>
  );
}
// THE TABS (owner 2026-11-25, approval pack item 4): along the top on a computer; on a phone a bottom bar with icons,
// the Ask Ledrix dock sitting just above it (page.tsx TABBAR_H). Same five tabs, same order, either way.
const RAIL_ICON: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  systems: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  maintain: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  history: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  report: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
};
const TABBAR_H = 56;
function HomeRail({ active, onPick, bottom }: { active: Tab; onPick: (t: Tab) => void; bottom?: boolean }) {
  const on = RAIL_OF[active] ?? active;
  if (bottom) {
    return (
      <nav aria-label="Home sections" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 125, background: GLASS, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderTop: `1px solid ${BORDER}`, paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <div style={{ display: 'flex', maxWidth: 430, margin: '0 auto', height: TABBAR_H }}>
          {RAIL.map(r => {
            const cur = on === r.tab;
            return (
              <button key={r.tab} onClick={() => onPick(r.tab)} aria-current={cur ? 'page' : undefined}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer',
                  color: cur ? ACCENT : MED, fontSize: 10.5, fontWeight: cur ? 700 : 500, fontFamily: 'inherit' }}>
                <svg aria-hidden viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={cur ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"><path d={RAIL_ICON[r.tab] ?? RAIL_ICON.home} /></svg>
                {r.label}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }
  return (
    <nav aria-label="Home sections" style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, background: GLASS, position: 'sticky', top: 57, zIndex: 89, overflowX: 'auto' }}>
      {RAIL.map(r => (
        <button key={r.tab} onClick={() => onPick(r.tab)} aria-current={on === r.tab ? 'page' : undefined}
          style={{ flex: '1 0 auto', minHeight: 36, padding: '6px 12px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: on === r.tab ? ACCENT : 'transparent', color: on === r.tab ? '#fff' : MED }}>{r.label}</button>
      ))}
    </nav>
  );
}
export { TABBAR_H, ClaimToAdd, Icon, Logo, photoUrl, Lightbox, homeView, projectSeverity, splitBullets, FLabel, pdfHref, FindingCard, CardSection, FindingDetailModal, ProjectCard, ApplianceModal, ReminderCard, Skeleton, NotFound, NavBar, Footer, PhotoAnalyze, HomeRail };
export type { IconName };
