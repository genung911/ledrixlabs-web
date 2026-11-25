import { useEffect, useMemo, useRef, useState } from 'react';
import { findingSections } from '../../../lib/report/findingSections';
import { assetUrl, withTokenInHtml, defaultReportHtmlPaths, loadFirstReport } from '@/lib/portalAssets';
import { PORTAL_TOKEN, can, supaGet, SERIF, MONO, eyebrow, type Anomaly, type HomeRecord, type Tab, PRIO, type PrioKey, PRIO_ORDER, reportSystem, prioRank, isSafetyFinding, priorityOf, fmtDate } from './shared';
import { photoUrl, homeView, pdfHref } from './ui';

// ─── REPORT TAB ──────────────────────────────────────────────────────────────
// Spectora-style: findings grouped into SYSTEM sections with a sticky, clickable
// table of contents. Additive — does not touch the other tabs.
// White, Spectora-style web report: left-sidebar system ToC (with counts) + hero + sections.
type RC = { ink: string; sub: string; line: string; accent: string };
function ReportRow({ a, C }: { a: Anomaly; C: RC }) {
  const p = priorityOf(a);
  const color = p.report;
  const label = p.label;
  const hv    = homeView(a);
  const desc  = hv.description;
  return (
    <div style={{ background: '#fff', border: '1px solid #eef0f3', borderLeft: `2px solid ${color}`, borderRadius: 10, padding: 16, marginBottom: 12, display: 'flex', gap: 14 }}>
      {photoUrl(a.imageUri) ? <img src={photoUrl(a.imageUri)!} alt="" style={{ width: 104, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
          <span style={{ ...eyebrow(color, 8), background: `${color}10`, border: `1px solid ${color}2e`, padding: '3px 9px', borderRadius: 5 }}>{label}</span>
          {isSafetyFinding(a) ? <span style={{ ...eyebrow('#dc2626', 8), background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 5 }}>⚠ Safety</span> : null}
          {a.location ? <span style={{ color: C.sub, fontSize: 12 }}>{a.location}</span> : null}
        </div>
        {a.unit ? <div style={{ fontFamily: SERIF, color: C.ink, fontSize: 15, fontWeight: 600 }}>{a.unit}</div> : null}
        {desc ? <div style={{ color: '#4b5563', fontSize: 13.5, lineHeight: 1.55, marginTop: 3 }}>{desc}</div> : null}
        {hv.recommendation ? <div style={{ color: C.accent, fontSize: 12.5, fontWeight: 500, marginTop: 6, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>Recommendation: {hv.recommendation}</div> : null}
        {hv.evaluation ? <div style={{ color: C.accent, fontSize: 12.5, fontWeight: 500, marginTop: 6, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}><b>{hv.evaluation.heading}</b> — {hv.evaluation.text}</div> : null}
      </div>
    </div>
  );
}
// Condensed summary: findings grouped by priority tier, one compact line each.
function ReportSummary({ anomalies, C }: { anomalies: Anomaly[]; C: RC }) {
  if (anomalies.length === 0) return <div style={{ color: C.sub, fontSize: 14, textAlign: 'center', padding: '48px 0' }}>No findings were recorded for this inspection.</div>;
  const byKey = new Map<PrioKey, Anomaly[]>();
  for (const a of anomalies) {
    const k = priorityOf(a).key;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(a);
  }
  return (
    <div>
      {PRIO_ORDER.filter(k => byKey.has(k)).map(k => {
        const color = PRIO[k].report;
        return (
        <section key={k} style={{ paddingTop: 24 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink, margin: '0 0 8px', borderBottom: `1px solid ${color}`, paddingBottom: 7, display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: color, alignSelf: 'center' }} />{PRIO[k].label} <span style={{ fontFamily: MONO, fontSize: 10, color: C.sub, fontWeight: 500 }}>({byKey.get(k)!.length})</span></h2>
          {byKey.get(k)!.map((a, j) => (
            <div key={a.id ?? j} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ width: 14, flexShrink: 0, color: '#dc2626', fontSize: 12 }}>{isSafetyFinding(a) ? '⚠' : ''}</span>
              <span style={{ fontWeight: 600, color: C.ink, fontSize: 13, minWidth: 110, flexShrink: 0 }}>{reportSystem(a)}</span>
              <span style={{ color: '#4b5563', fontSize: 13, flex: 1 }}>{a.unit ? `${a.unit} — ` : ''}{homeView(a).description.slice(0, 130)}</span>
            </div>
          ))}
        </section>
        );
      })}
    </div>
  );
}
// "What Matters" — the free triage: Safety + Immediate items, plain-language, with the Ledrix Insight
// upsell anchored right here (the homeowner just saw the brain work). Built from inspector-CONFIRMED
// findings only — Ledrix surfaces + explains, it doesn't invent.
function WhatMatters({ anomalies, C, onOpen }: { anomalies: Anomaly[]; C: RC; onOpen: () => void }) {
  const matters = anomalies.filter(a => isSafetyFinding(a) || a.severity === 'critical')
    .sort((x, y) => (isSafetyFinding(y) ? 1 : 0) - (isSafetyFinding(x) ? 1 : 0) || prioRank(x.severity) - prioRank(y.severity));
  const rest = anomalies.length - matters.length;
  return (
    <section style={{ paddingTop: 24 }}>
      <div style={{ background: '#FFFBF3', border: '1px solid #F3E4C8', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: C.ink }}>What Matters</span>
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>— {matters.length} thing{matters.length !== 1 ? 's' : ''} Ledrix flagged</span>
        </div>
        {matters.length === 0 ? (
          <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 600 }}>✓ No safety or immediate-attention items — nothing urgent.</div>
        ) : matters.map((a, i) => {
          const safety = isSafetyFinding(a);
          const hv = homeView(a);
          const desc = hv.description;
          return (
            <div key={a.id ?? i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i ? '1px solid #fde3c4' : 'none' }}>
              <span style={{ ...eyebrow(safety ? PRIO.safety.report : PRIO.major.report, 8), flexShrink: 0, paddingTop: 4, width: 88 }}>{safety ? '⚠ Safety' : PRIO.major.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.ink, fontSize: 14, fontWeight: 600 }}>{a.unit ?? 'Finding'}</div>
                <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.5 }}>{desc.slice(0, 170)}{desc.length > 170 ? '…' : ''}</div>
                {hv.evaluation ? <div style={{ color: C.accent, fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{hv.evaluation.heading}</div> : null /* never the stored prosToCall (owner 2026-10-13) */}
              </div>
            </div>
          );
        })}
        {rest > 0 ? <div style={{ color: C.sub, fontSize: 12.5, marginTop: 12, fontWeight: 500 }}>✓ {rest} more item{rest !== 1 ? 's' : ''} below — all Repair / Maintenance, not urgent.</div> : null}
        <button onClick={onOpen} style={{ marginTop: 18, width: '100%', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 18px', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>Ask Ledrix about your home<span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.9 }}>Unlock Insight →</span></div>
          <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>“Will the furnace make it another winter?” · maintenance plan · ask anything</div>
        </button>
      </div>
    </section>
  );
}
// Renders the app's published report HTML inline via a same-origin srcDoc iframe (isolated styles),
// auto-sizing to its content so it reads as one continuous page, not a scroll-in-scroll.
function FullReportFrame({ doc, frameRef, onSections, title = 'Inspection Report' }: { doc: string; frameRef?: { current: HTMLIFrameElement | null }; onSections?: (ids: string[]) => void; title?: string }) {
  const innerRef = useRef<HTMLIFrameElement>(null);
  const ref = frameRef ?? innerRef;
  const fit = () => {
    const f = ref.current;
    try {
      const cw = f?.contentWindow;
      if (!f || !cw) return;
      f.style.height = (cw.document.documentElement.scrollHeight + 16) + 'px';
      onSections?.(Array.from(cw.document.querySelectorAll('[id^="sec-"]')).map(e => (e as HTMLElement).id));
    } catch { /* cross-origin guard — srcDoc is same-origin so this is just defensive */ }
  };
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <iframe ref={ref} srcDoc={doc} onLoad={fit} title={title}
        style={{ width: '100%', border: 'none', display: 'block', minHeight: 200, background: '#fff' }} />
    </div>
  );
}
function ReportTab({ anomalies, record, onTabChange }: { anomalies: Anomaly[]; record: HomeRecord; onTabChange: (t: Tab) => void }) {
  const [view, setView] = useState<'full' | 'summary'>('full');
  const C: RC = { ink: '#1f2937', sub: '#6b7280', line: '#e5e7eb', accent: '#0e7490' };
  // The phone's PDF grouping: its system list, then component (worst first), worst finding first.
  const sections = findingSections(anomalies, record.reportGroups).map(sec => ({
    system: sec.label, systemId: sec.systemId, components: sec.components,
    items: sec.components.flatMap(c => c.findings),
  }));
  const slug = (s: string) => 'rpt-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const sub = [record.city, record.state, record.zip].filter(Boolean).join(', ');

  // Path A: the Full Report is the app's REAL report HTML (the exact thing that becomes the PDF),
  // published to storage. Fetch it; if present, render the complete report + hide the reconstructed
  // sidebar. If not published yet, fall back to the system-grouped reconstruction below.
  const [doc, setDoc] = useState<string | null | 'none'>(null);
  // Report ARCHIVE (home_reports) — every publish snapshots a versioned copy, so this home
  // accumulates report history across re-publishes and re-inspections. Empty (table absent or
  // no snapshots yet) simply means "latest only" — exactly the old behavior.
  const [history, setHistory] = useState<{ version: string; published_at: string; inspection_date?: string; html_path?: string; pdf_path?: string }[]>([]);
  const [histSel, setHistSel] = useState<string | null>(null);   // null = latest (canonical path)
  useEffect(() => {
    if (!record.share_id) return;
    let alive = true;
    supaGet<any>(`home_reports?share_id=eq.${encodeURIComponent(record.share_id)}&order=published_at.desc&limit=24`)
      .then(rows => { if (alive) setHistory(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [record.share_id]);
  const selected = histSel ? history.find(h => h.version === histSel) : null;
  // Signed via /api/report-asset so it resolves whether the inspection-pdfs bucket is public
  // or private (fetch below follows the 302 redirect and reads the HTML text).
  // A history version reads its own snapshot. The DEFAULT (latest) reads the html of the version
  // `pdf_url` names, then the legacy fixed report.html — so the web report switches together with
  // the record and PDF (S-14, 2026-10-10; see defaultReportHtmlPaths in lib/portalAssets.ts).
  const reportUrls: string[] = selected?.html_path
    ? [assetUrl('report-asset', selected.html_path, PORTAL_TOKEN)]
    : defaultReportHtmlPaths(record.share_id, record.pdf_url).map(p => assetUrl('report-asset', p, PORTAL_TOKEN));
  const reportKey = reportUrls.join('\n');
  useEffect(() => {
    if (!reportKey) { setDoc('none'); return; }
    let alive = true;
    setDoc(null);
    loadFirstReport(reportKey.split('\n'), url => fetch(url))
      // The stored HTML's own <img> URLs were written without a token; add it before rendering.
      .then(t => { if (alive) setDoc(t ? withTokenInHtml(t, PORTAL_TOKEN) : 'none'); })
      .catch(() => { if (alive) setDoc('none'); });
    return () => { alive = false; };
  }, [reportKey]);
  const reportReady = typeof doc === 'string' && doc !== 'none';

  // Live ToC sidebar: the report HTML carries sec-* anchors; we render it in a same-origin srcDoc
  // iframe, so the left rail can scroll the parent page to any section. onSections reports which
  // anchors actually exist so the rail only lists real sections.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [secIds, setSecIds] = useState<string[]>([]);
  // MUST mirror generateInspectionPDF's actual chapter anchors (anchored() ids) — this list
  // drifted once and sections silently vanished from the sidebar (2026-07-09 audit).
  const REPORT_TOC: { id: string; label: string }[] = [
    { id: 'sec-profile',   label: 'Home Profile' },
    { id: 'sec-summary',   label: 'Executive Summary' },
    { id: 'sec-findings',  label: 'Detailed Findings' },
    { id: 'sec-reinspect', label: 'Re-Inspection' },
    { id: 'sec-floorplan', label: 'Floor Plan' },
    { id: 'sec-systems',   label: 'Systems, Specs & Scope' },
    { id: 'sec-extras',    label: 'Certification & Extras' },
  ];
  const toc = REPORT_TOC.filter(t => secIds.length === 0 || secIds.includes(t.id));
  // Auto-height iframe doesn't scroll itself — scroll the PARENT to the section's absolute Y.
  const jumpIn = (id: string) => {
    const f = frameRef.current;
    const d = f?.contentWindow?.document;
    const el = d?.getElementById(id);
    if (!f || !d || !el) return;
    const frameTop = f.getBoundingClientRect().top + window.scrollY;
    const elTop = el.getBoundingClientRect().top - d.body.getBoundingClientRect().top;
    window.scrollTo({ top: frameTop + elTop - 8, behavior: 'smooth' });
  };

  // Cover-first: split the report into [cover page] and [everything after] (parsed from the same
  // HTML — no duplication) so the What Matters panel can sit BETWEEN them. Falls back to one frame.
  const split = useMemo(() => {
    if (!reportReady || typeof doc !== 'string') return null;
    try {
      const d = new DOMParser().parseFromString(doc, 'text/html');
      const pages = Array.from(d.querySelectorAll('.page'));
      if (pages.length < 2) return null;
      const head = d.head.innerHTML;
      const wrap = (inner: string) => `<!doctype html><html><head>${head}</head><body>${inner}</body></html>`;
      return { cover: wrap(pages[0].outerHTML), body: wrap(pages.slice(1).map(p => p.outerHTML).join('')) };
    } catch { return null; }
  }, [doc, reportReady]);

  return (
    <div className="rpt">
      {!reportReady && (
      <div className="rpt-hero" style={{ position: 'relative', minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '28px 28px 24px', background: photoUrl(record.cover_url) ? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.72) 100%), url(${photoUrl(record.cover_url)}) center/cover` : 'linear-gradient(160deg,#1e293b,#0f172a)' }}>
        <div style={{ fontFamily: SERIF, color: '#fff', fontSize: 30, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{record.address ?? 'Property'}</div>
        <div style={{ fontFamily: MONO, color: '#e5e7eb', fontSize: 12, marginTop: 6, letterSpacing: '0.04em' }}>{sub}{record.inspection_date ? ` · ${fmtDate(record.inspection_date)}` : ''}</div>
        {(record.inspector || record.company) ? (
          <div style={{ position: 'absolute', right: 24, bottom: 24, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(6px)', borderRadius: 999, padding: '8px 18px 8px 10px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 18px rgba(0,0,0,0.28)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 19, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 15, fontFamily: SERIF }}>{(record.inspector ?? 'I').slice(0, 1).toUpperCase()}</div>
            <div>
              <div style={{ ...eyebrow(C.sub, 7.5) }}>Inspector</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{record.inspector ?? '—'}</div>
              {record.company ? <div style={{ fontSize: 11, color: C.sub }}>{record.company}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
      )}
      <aside className="rpt-side">{reportReady ? (
        <>
          <div style={{ padding: '20px 18px 12px', ...eyebrow(C.accent, 8.5) }}>Contents</div>
          {toc.map((t, i) => (
            <button key={t.id} onClick={() => jumpIn(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '12px 18px', color: C.ink, fontSize: 13, fontWeight: 500, fontFamily: SERIF, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: MONO, color: C.accent, fontSize: 10, fontWeight: 500, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1 }}>{t.label}</span>
            </button>
          ))}
        </>
      ) : (<>
        <button onClick={() => jump('rpt-overview')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '13px 16px', color: C.accent, fontSize: 13.5, fontWeight: 600, fontFamily: SERIF, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
          <span style={{ flex: 1 }}>Inspection Details</span>
        </button>
        {sections.map(sec => (
          <button key={sec.systemId} onClick={() => jump(slug(sec.systemId))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '13px 16px', color: C.ink, fontSize: 13.5, fontWeight: 500, fontFamily: SERIF, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
            <span style={{ flex: 1 }}>{sec.system}</span>
            <span style={{ fontFamily: MONO, color: C.sub, fontSize: 10, fontWeight: 500, flexShrink: 0 }}>{sec.items.length}</span>
          </button>
        ))}
      </>)}</aside>

      <div className="rpt-main" style={{ color: C.ink }}>
        <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', position: 'sticky', top: 0, zIndex: 4 }}>
          {(['full', 'summary'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? C.accent : 'none', color: view === v ? '#fff' : C.sub, border: view === v ? '1px solid transparent' : `1px solid ${C.line}`, fontSize: 12, fontWeight: 600, padding: '7px 15px', borderRadius: 8, cursor: 'pointer' }}>
              {v === 'full' ? 'Full Report' : 'Summary'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto' }} />
          {history.length > 1 && (
            <select
              value={histSel ?? ''}
              onChange={e => setHistSel(e.target.value || null)}
              aria-label="Report history"
              style={{ background: 'none', color: C.ink, border: `1px solid ${C.line}`, fontSize: 11, fontWeight: 500, padding: '7px 10px', borderRadius: 8, fontFamily: MONO, marginRight: 8 }}>
              <option value="">Latest report</option>
              {history.slice(1).map(h => (
                <option key={h.version} value={h.version}>{fmtDate(h.inspection_date || h.published_at)} · {h.version}</option>
              ))}
            </select>
          )}
          {(selected?.pdf_path || pdfHref(record)) ? <a href={selected?.pdf_path ? assetUrl('report-asset', selected.pdf_path, PORTAL_TOKEN) : pdfHref(record)!} target="_blank" rel="noreferrer" style={{ background: 'none', color: C.ink, border: `1px solid ${C.line}`, fontSize: 11, fontWeight: 600, padding: '8px 14px', borderRadius: 8, textDecoration: 'none', fontFamily: MONO, letterSpacing: '0.08em' }}>⤓ PRINT / PDF</a> : null}
        </div>

        <div style={{ padding: '0 24px 90px', background: '#fff' }}>
          {view === 'summary' ? (
            <>
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <ReportSummary anomalies={anomalies} C={C} />
            </>
          ) : reportReady ? (
            <>
              {split && <FullReportFrame doc={split.cover} title="Report Cover" />}
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <FullReportFrame doc={split ? split.body : (doc as string)} frameRef={frameRef} onSections={setSecIds} />
            </>
          ) : doc === null ? (
            <>
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <div style={{ color: C.sub, fontSize: 14, textAlign: 'center', padding: '64px 0' }}>Loading the full report…</div>
            </>
          ) : (
            <>
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <section id="rpt-overview" style={{ scrollMarginTop: 56, paddingTop: 24 }}>
                <h1 style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 600, margin: '0 0 6px' }}>Inspection Details</h1>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: C.sub, fontSize: 13, marginBottom: 10 }}>
                  {record.year_built ? <span>Built {record.year_built}</span> : null}
                  {record.sqft ? <span>{record.sqft} sqft</span> : null}
                  {record.beds ? <span>{record.beds} bd</span> : null}
                  {record.baths ? <span>{record.baths} ba</span> : null}
                  {record.inspection_type ? <span>{record.inspection_type}</span> : null}
                </div>
                <div style={{ borderTop: `2px solid ${C.accent}`, paddingTop: 14, color: '#4b5563', fontSize: 13.5, lineHeight: 1.65 }}>
                  This inspection was a visual examination of the readily accessible systems and components of the home. It covered {sections.length > 0 ? <>the following system{sections.length !== 1 ? 's' : ''}: <strong>{sections.map(s => s.system).join(', ')}</strong></> : 'the home’s systems'}. <strong>{anomalies.length}</strong> finding{anomalies.length !== 1 ? 's were' : ' was'} documented. Conditions can change after the inspection date — download the full PDF for the complete report.
                </div>
              </section>
              {sections.length === 0 ? (
                <div style={{ color: C.sub, fontSize: 14, textAlign: 'center', padding: '48px 0' }}>No findings were recorded for this inspection.</div>
              ) : sections.map((sec, i) => (
                <section key={sec.systemId} id={slug(sec.systemId)} style={{ scrollMarginTop: 56, paddingTop: 28 }}>
                  <h2 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, margin: '0 0 12px', borderBottom: `1px solid ${C.ink}`, paddingBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span>{sec.system}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: C.sub, fontWeight: 500, letterSpacing: '0.08em' }}>{sec.items.length} FINDING{sec.items.length !== 1 ? 'S' : ''}</span>
                  </h2>
                  {sec.components.map((c, k) => (
                    <div key={k}>
                      {c.component ? <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#475569', margin: '10px 0 8px 2px' }}>{c.component}{c.findings.length > 1 ? <span style={{ color: C.sub, fontWeight: 500, marginLeft: 7 }}>{c.findings.length}</span> : null}</div> : null}
                      {c.findings.map((a, j) => <ReportRow key={a.id ?? j} a={a} C={C} />)}
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export { ReportRow, ReportSummary, WhatMatters, FullReportFrame, ReportTab };
export type { RC };
