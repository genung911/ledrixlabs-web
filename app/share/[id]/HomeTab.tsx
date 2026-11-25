import { useMemo, useState, type ReactNode } from 'react';
import { homeSystems } from '@/lib/scope/core/home/homeSystemsModel';
import { useDesk, can, type Anomaly, type HomeRecord, type Project, type Reminder, type RepairRow, type Tab, priorityOf, fmtDate } from './shared';
import { photoUrl, FindingDetailModal, Footer, PhotoAnalyze } from './ui';
import { InsightSection } from './LedrixPanel';

// ─── HOME TAB — the house is the home screen (owner 2026-11-25, mockup 1CCUJycYwNKA8862rsStQ4 "Approved") ─────────────
// Apple's layout, Elon's taps: the house drawn with a point on each system this record has (colour = its worst finding);
// a point pushes that system's page inside Home, back returns to the house. Counts, not a score (no ring, no grade —
// owner 2026-10-13, verify-no-health-score). Light and dark follow the device (.hr tokens). The tabs, the Ask Ledrix
// dock and the claim flow are the page's own.
const HR_LIGHT = '--hb:#F2F3F5;--hc:#FFFFFF;--hc2:#EEF0F3;--hl:#E3E6EA;--hi:#0F1216;--hd:#5F6672;--hf:#9AA1AB;--hblue:#217BE8;--hbs:rgba(33,123,232,.10);'
  + '--hsafety:#D92D20;--hmajor:#D9590B;--hminor:#A87A00;--hmaint:#5B6678;--hok:#17834B;'
  + '--hsky1:#DCE7F3;--hsky2:#F3F6FA;--hwall:#FFFFFF;--hwall2:#E7EBF0;--hroof:#4B5563;--hroof2:#6B7280;--hground:#E1E6EC;--hwin:#BFD6EE;--hsh:0 1px 2px rgba(15,18,22,.05),0 6px 20px rgba(15,18,22,.05);';
const HR_DARK = '--hb:#0A0B0D;--hc:#15171A;--hc2:#1D1F23;--hl:#272A2F;--hi:#F4F5F7;--hd:#9198A1;--hf:#5F656C;--hblue:#4C9BF2;--hbs:rgba(76,155,242,.15);'
  + '--hsafety:#FF5A52;--hmajor:#FF8A3D;--hminor:#F2C230;--hmaint:#9AA6B8;--hok:#3CC57C;'
  + '--hsky1:#05070A;--hsky2:#101926;--hwall:#1B1F25;--hwall2:#13161B;--hroof:#2A2F37;--hroof2:#353B45;--hground:#0B0C0E;--hwin:#F7C66B;--hsh:none;';
const HR_CSS = `.hr{${HR_LIGHT}background:var(--hb);color:var(--hi)}
@media (prefers-color-scheme:dark){.hr{${HR_DARK}}}
.hr *{box-sizing:border-box}
.hr .hr-card{background:var(--hc);border-radius:14px;box-shadow:var(--hsh);overflow:hidden}
.hr .hr-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;background:none;border:0;color:var(--hi);font:inherit;text-align:left;cursor:pointer;position:relative;min-height:52px}
.hr .hr-row+.hr-row::before{content:"";position:absolute;top:0;left:58px;right:0;border-top:1px solid var(--hl)}
.hr .hr-row:active,.hr .hr-row:hover{background:var(--hc2)}
.hr .hr-gh{color:var(--hd);font-size:13px;margin:22px 16px 7px;display:flex;justify-content:space-between;align-items:baseline}
.hr .hr-pt{cursor:pointer;outline:none}
.hr .hr-pt:focus-visible circle.hr-dot{stroke:var(--hblue);stroke-width:3.5}
.hr .hr-pulse{animation:hrpulse 2.4s infinite;transform-box:fill-box;transform-origin:center}
@keyframes hrpulse{0%{opacity:.6;transform:scale(1)}70%{opacity:0;transform:scale(2.4)}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.hr .hr-pulse{animation:none;opacity:0}}
.hr .hr-big{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.hr .hr-big button{background:var(--hc);border:0;border-radius:14px;padding:11px 10px;text-align:left;color:var(--hi);font:inherit;cursor:pointer;box-shadow:var(--hsh);min-height:64px}
.hr .hr-cols{display:block}
@media (min-width:900px){.hr .hr-cols{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:28px;align-items:start}}
.hr a{color:var(--hblue)}`;

type HrPrio = 'safety' | 'major' | 'minor' | 'maint';
const HR_PRIO: Record<HrPrio, { label: string; color: string }> = {
  safety: { label: 'Safety', color: 'var(--hsafety)' }, major: { label: 'Major repair', color: 'var(--hmajor)' },
  minor: { label: 'Minor repair', color: 'var(--hminor)' }, maint: { label: 'Upkeep', color: 'var(--hmaint)' },
};
const hrPrioOf = (a: Anomaly): HrPrio | null => { const k = priorityOf(a).key; return k === 'safety' || k === 'major' || k === 'minor' || k === 'maint' ? k : null; };
const HR_RANK: HrPrio[] = ['safety', 'major', 'minor', 'maint'];
/** The four points on the drawing, and which of the record's systems each stands for. */
const HR_POINTS: { id: string; label: string; keys: string[]; x: number; y: number }[] = [
  { id: 'roof', label: 'Roof', keys: ['roof'], x: 150, y: 86 },
  { id: 'hvac', label: 'HVAC', keys: ['hvac', 'heating', 'cooling', 'heat_pump', 'mini_split'], x: 347, y: 170 },
  { id: 'electrical', label: 'Panel', keys: ['electrical'], x: 63, y: 154 },
  { id: 'water_heater', label: 'Water heater', keys: ['water_heater'], x: 272, y: 146 },
];
const hrIcon = (d: string, bg: string) => (
  <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'grid', placeItems: 'center', flex: 'none' }}>
    <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  </span>
);
const HR_I = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', wrench: 'M14.7 6.3a4 4 0 0 0 5 5L12 19a2 2 0 0 1-3-3l7.7-7.7a4 4 0 0 0-5-5z',
  cal: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4', pro: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c1-4 4-6 8-6s7 2 8 6', report: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', doc: 'M7 3h7l5 5v13H7zM14 3v5h5', ethix: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
};
const Chev = () => <svg aria-hidden width={8} height={14} viewBox="0 0 8 14" style={{ flex: 'none' }}><path d="M1 1l6 6-6 6" fill="none" stroke="var(--hf)" strokeWidth={2} /></svg>;

function HrHouse({ colorOf, onPick, present }: { colorOf: (id: string) => string; onPick: (id: string) => void; present: (id: string) => boolean }) {
  const pts = HR_POINTS.filter(p => present(p.id));
  return (
    <svg viewBox="0 0 390 236" preserveAspectRatio="xMidYMax meet" role="group" aria-label="Your home — tap a point to open that system" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs><linearGradient id="hrsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--hsky1)" /><stop offset="1" stopColor="var(--hsky2)" /></linearGradient></defs>
      <rect width="390" height="236" fill="url(#hrsky)" />
      <path d="M0 206 Q130 196 200 200 T390 197 V236 H0z" fill="var(--hground)" />
      <ellipse cx="190" cy="210" rx="150" ry="7" fill="#000" opacity=".12" />
      <path d="M64 112 L148 56 L232 112 Z" fill="var(--hroof)" /><path d="M148 56 L232 112 L216 112 L148 67Z" fill="var(--hroof2)" />
      <rect x="76" y="112" width="144" height="96" fill="var(--hwall)" stroke="var(--hl)" /><rect x="192" y="112" width="28" height="96" fill="var(--hwall2)" />
      <path d="M220 134 L268 100 L322 134 Z" fill="var(--hroof)" /><rect x="228" y="134" width="88" height="74" fill="var(--hwall)" stroke="var(--hl)" />
      <rect x="238" y="152" width="68" height="56" rx="2" fill="var(--hwall2)" />
      {[0, 1, 2, 3].map(i => <line key={i} x1="238" x2="306" y1={163 + i * 11} y2={163 + i * 11} stroke="var(--hl)" />)}
      <rect x="94" y="128" width="30" height="25" rx="2" fill="var(--hwin)" /><rect x="160" y="128" width="30" height="25" rx="2" fill="var(--hwin)" opacity=".85" />
      <rect x="94" y="170" width="30" height="25" rx="2" fill="var(--hwin)" opacity=".7" /><rect x="136" y="166" width="22" height="42" rx="2" fill="var(--hroof2)" />
      <rect x="330" y="180" width="34" height="28" rx="3" fill="var(--hwall2)" stroke="var(--hl)" /><circle cx="347" cy="194" r="9" fill="none" stroke="var(--hf)" strokeWidth="2" />
      <rect x="58" y="164" width="11" height="17" rx="1.5" fill="var(--hwall2)" stroke="var(--hl)" />
      {pts.map(p => (
        <g key={p.id} className="hr-pt" tabIndex={0} role="button" aria-label={`${p.label}: open`} onClick={() => onPick(p.id)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.id); } }}>
          <circle className="hr-pulse" cx={p.x} cy={p.y} r="8" fill={colorOf(p.id)} />
          <circle cx={p.x} cy={p.y} r="18" fill="transparent" />
          <circle className="hr-dot" cx={p.x} cy={p.y} r="6.5" fill={colorOf(p.id)} stroke="var(--hb)" strokeWidth="2.5" />
          <text x={p.x} y={p.y + 26} textAnchor="middle" fill="var(--hd)" fontSize="10.5" fontWeight="600">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

type HrPage = { kind: 'system'; id: string } | { kind: 'limits' } | null;

function HomeTab({ record, anomalies, reminders, onTabChange, access, shareId, onUnlock, claim }: {
  record: HomeRecord; anomalies: Anomaly[];
  projects: Project[]; reminders: Reminder[]; repairs: RepairRow[];
  onTabChange: (t: Tab) => void;
  /** One Home phase 3: the "Claim your home" card, under the address, for someone not signed in. */
  claim?: ReactNode;
  access: boolean; shareId: string; onUnlock: () => void; onAsk: () => void;
}) {
  const desk = useDesk();
  const [page, setPage] = useState<HrPage>(null);
  const [open, setOpen] = useState<Anomaly | null>(null);
  const systems = useMemo(() => homeSystems({ specs: Array.isArray(record.specs) ? record.specs : [], findings: anomalies, inspectedAt: record.inspection_date || null }), [record, anomalies]);
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const cover = photoUrl(record.cover_url);
  const listed = anomalies.filter(a => hrPrioOf(a));
  const count = (k: HrPrio) => listed.filter(a => hrPrioOf(a) === k).length;
  const first = [...listed].sort((a, b) => HR_RANK.indexOf(hrPrioOf(a)!) - HR_RANK.indexOf(hrPrioOf(b)!)).slice(0, 3);
  const point = (id: string) => HR_POINTS.find(p => p.id === id)!;
  const sysOf = (id: string) => systems.filter(s => point(id).keys.includes(s.key));
  const findingsOf = (id: string) => { const ids = new Set(sysOf(id).flatMap(s => s.findings.map(f => f.id))); return anomalies.filter(a => a.id && ids.has(a.id)); };
  const colorOf = (id: string) => {
    const ks = findingsOf(id).map(hrPrioOf).filter(Boolean) as HrPrio[];
    for (const k of HR_RANK) if (ks.includes(k)) return HR_PRIO[k].color;
    return 'var(--hok)';
  };
  const present = (id: string) => sysOf(id).length > 0;
  const limits = Array.isArray(record.limitations) ? record.limitations : [];
  const nextUp = reminders.find(r => !r.completed);
  const gut = 16;
  const sealed = record.inspection_date ? fmtDate(record.inspection_date) : '';

  const findingRow = (a: Anomaly, i: number) => {
    const k = hrPrioOf(a); const img = photoUrl(a.imageUri);
    const title = (a.issueTitle && a.issueTitle.trim()) || a.unit || 'Finding';
    return (
      <button key={a.id ?? i} className="hr-row" onClick={() => setOpen(a)} style={{ alignItems: 'flex-start' }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" style={{ width: 46, height: 46, borderRadius: 9, objectFit: 'cover', flex: 'none' }} />
          : <span aria-hidden style={{ width: 46, height: 46, borderRadius: 9, background: 'var(--hc2)', flex: 'none' }} />}
        <span style={{ flex: 1, minWidth: 0 }}>
          {k && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: HR_PRIO[k].color }}>{HR_PRIO[k].label}</span>}
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)', marginTop: 2 }}>{[a.component || a.unit, a.location].filter(Boolean).join(' · ')}</span>
        </span>
        <Chev />
      </button>
    );
  };

  const back = (
    <button onClick={() => setPage(null)} style={{ background: 'none', border: 0, color: 'var(--hblue)', font: 'inherit', fontSize: 16, cursor: 'pointer', padding: '10px 8px', display: 'flex', alignItems: 'center', gap: 2 }}>‹ Home</button>
  );

  let body: ReactNode;
  if (page?.kind === 'system') {
    const pt = point(page.id); const ss = sysOf(page.id); const fs = findingsOf(page.id);
    body = (
      <div style={{ padding: `4px ${gut}px 0` }}>
        {back}
        <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 6px' }}>{ss.map(s => s.label).join(' & ') || pt.label}</h2>
        {ss.map(s => (
          <div key={s.key}>
            <div className="hr-gh" style={{ marginLeft: 0, marginRight: 0 }}><span>{ss.length > 1 ? s.label : 'Details'}</span>{s.facts.length > 0 && <span style={{ color: 'var(--hok)', fontWeight: 600, fontSize: 12 }}>✓ Confirmed by your inspector</span>}</div>
            <div className="hr-card">
              {s.facts.length === 0 && <div className="hr-row" style={{ cursor: 'default', color: 'var(--hd)' }}>Nothing recorded</div>}
              {s.facts.map((f, i) => (
                <div key={`${f.label}-${i}`} className="hr-row" style={{ cursor: 'default', justifyContent: 'space-between', minHeight: 44 }}>
                  <span style={{ fontSize: 14.5 }}>{f.label}</span><span style={{ fontSize: 14.5, color: 'var(--hd)', textAlign: 'right' }}>{f.value}</span>
                </div>
              ))}
              {s.made && <div className="hr-row" style={{ cursor: 'default', justifyContent: 'space-between', minHeight: 44 }}><span style={{ fontSize: 14.5 }}>Made</span><span style={{ fontSize: 14.5, color: s.life?.past ? 'var(--hmajor)' : 'var(--hd)' }}>{s.made.year} · {s.made.age} yr{s.made.age === 1 ? '' : 's'}{s.life ? ` · typical ${s.life.low}–${s.life.high}` : ''}</span></div>}
              {s.manual && <a className="hr-row" href={s.manual.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><span style={{ flex: 1, fontSize: 14.5, color: 'var(--hblue)' }}>Owner&apos;s manual</span><Chev /></a>}
            </div>
          </div>
        ))}
        <div className="hr-gh" style={{ marginLeft: 0, marginRight: 0 }}><span>Findings</span></div>
        <div className="hr-card">{fs.length ? fs.map(findingRow) : <div className="hr-row" style={{ cursor: 'default', justifyContent: 'space-between' }}><span>No findings</span><span style={{ color: 'var(--hok)', fontWeight: 600, fontSize: 12.5 }}>All clear</span></div>}</div>
      </div>
    );
  } else if (page?.kind === 'limits') {
    body = (
      <div style={{ padding: `4px ${gut}px 0` }}>
        {back}
        <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 12px' }}>What wasn&apos;t inspected</h2>
        <div className="hr-card">
          {limits.length === 0 && <div className="hr-row" style={{ cursor: 'default', color: 'var(--hd)' }}>Your inspector recorded no limitations.</div>}
          {limits.map((l, i) => (
            <div key={i} className="hr-row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{l.item}</span><span style={{ fontSize: 13, color: 'var(--hd)' }}>{l.reason}</span>
            </div>
          ))}
        </div>
        <p style={{ color: 'var(--hd)', fontSize: 13, lineHeight: 1.5, margin: '12px 4px 0' }}>An inspection covers what can be seen and safely reached on the day. These were limited, and the report says why.</p>
      </div>
    );
  } else {
    const house = (
      <div>
        <div style={{ borderRadius: desk ? 18 : 0, overflow: 'hidden', marginTop: 8 }}>
          <HrHouse colorOf={colorOf} onPick={id => setPage({ kind: 'system', id })} present={present} />
        </div>
        <div style={{ textAlign: 'center', color: 'var(--hf)', fontSize: 12, marginTop: 6 }}>
          {HR_POINTS.some(p => present(p.id)) ? 'Tap a point to open that system' : 'Systems appear here as your inspector records them'}
        </div>
        {/* the points, as a list too — for keyboards and screen readers */}
        <nav aria-label="Systems on the drawing" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {HR_POINTS.filter(p => present(p.id)).map(p => <button key={p.id} onClick={() => setPage({ kind: 'system', id: p.id })}>{p.label}</button>)}
        </nav>
        <div className="hr-big" style={{ padding: `14px ${gut}px 0` }}>
          {HR_RANK.map(k => (
            <button key={k} onClick={() => onTabChange('findings')} aria-label={`${count(k)} ${HR_PRIO[k].label}`}>
              <b style={{ display: 'block', fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: count(k) ? HR_PRIO[k].color : 'var(--hok)' }}>{count(k)}</b>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--hd)', marginTop: 4, lineHeight: 1.2 }}>{HR_PRIO[k].label}</span>
            </button>
          ))}
        </div>
        <div className="hr-gh"><span>What to do first</span>{listed.length > 0 && <a href="#" onClick={e => { e.preventDefault(); onTabChange('findings'); }} style={{ fontWeight: 600, textDecoration: 'none' }}>All {listed.length}</a>}</div>
        <div className="hr-card" style={{ margin: `0 ${gut}px` }}>
          {first.length ? first.map(findingRow) : <div className="hr-row" style={{ cursor: 'default', justifyContent: 'space-between' }}><span>Nothing needs attention</span><span style={{ color: 'var(--hok)', fontWeight: 600, fontSize: 12.5 }}>All clear</span></div>}
        </div>
      </div>
    );
    const lists = (
      <div>
        <div className="hr-gh">Home DNA</div>
        <div style={{ margin: `0 ${gut}px` }}><InsightSection access={access} shareId={shareId} onUnlock={onUnlock} /></div>
        <div className="hr-gh">Your home</div>
        <div className="hr-card" style={{ margin: `0 ${gut}px` }}>
          <button className="hr-row" onClick={() => onTabChange('systems')}>{hrIcon(HR_I.grid, '#5E5CE6')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>Systems</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>Details and findings, system by system</span></span><span style={{ color: 'var(--hd)', fontSize: 14 }}>{systems.length}</span><Chev /></button>
          <button className="hr-row" onClick={() => onTabChange('findings')}>{hrIcon(HR_I.wrench, '#D9590B')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>Repairs</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>Everything your inspector found</span></span><span style={{ color: 'var(--hd)', fontSize: 14 }}>{listed.length}</span><Chev /></button>
          <button className="hr-row" onClick={() => onTabChange('maintain')}>{hrIcon(HR_I.cal, '#A87A00')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>Maintenance</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>{nextUp ? `Next: ${nextUp.title}` : 'Upkeep reminders and the repair request'}</span></span><Chev /></button>
        </div>
        <div className="hr-gh">Records</div>
        <div className="hr-card" style={{ margin: `0 ${gut}px` }}>
          <button className="hr-row" onClick={() => onTabChange('report')}>{hrIcon(HR_I.report, '#217BE8')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>Inspection report</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>{sealed ? `Inspected ${sealed}` : 'The full report'}</span></span>{record.pdf_url && <span style={{ color: 'var(--hd)', fontSize: 14 }}>PDF</span>}<Chev /></button>
          <button className="hr-row" onClick={() => setPage({ kind: 'limits' })}>{hrIcon(HR_I.eye, '#5B6678')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>What wasn&apos;t inspected</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>Limitations and areas not entered</span></span><span style={{ color: 'var(--hd)', fontSize: 14 }}>{limits.length}</span><Chev /></button>
          <button className="hr-row" onClick={() => onTabChange('history')}>{hrIcon(HR_I.doc, '#17834B')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>History & documents</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>Service history, manuals, permits, receipts</span></span><Chev /></button>
          <button className="hr-row" onClick={() => onTabChange('ethix')}>{hrIcon(HR_I.ethix, '#30B0C7')}<span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15.5 }}>Ethix</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>Your data, your call</span></span><Chev /></button>
        </div>
        {(record.inspector || record.company) && <>
          <div className="hr-gh">Your inspector</div>
          <div className="hr-card" style={{ margin: `0 ${gut}px`, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
            <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--hblue)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, flex: 'none' }}>
              {(record.inspector || record.company || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{record.inspector || record.company}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>{[record.inspector ? record.company : '', record.license_number ? `License ${record.license_number}` : ''].filter(Boolean).join(' · ')}</span>
            </span>
          </div>
        </>}
        <div style={{ margin: `16px ${gut}px 0` }}><PhotoAnalyze access={access} onUnlock={onUnlock} shareId={shareId} /></div>
        <p style={{ color: 'var(--hf)', fontSize: 12, lineHeight: 1.5, margin: `20px ${gut + 12}px 0` }}>
          This record shows the conditions your inspector observed{sealed ? ` on ${sealed}` : ''}. It is not a warranty or a guarantee. Questions about a finding go to your inspector.
        </p>
      </div>
    );
    body = (
      <>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: `16px ${gut}px 0` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: desk ? 34 : 28, lineHeight: 1.08, letterSpacing: '-.025em', margin: 0, fontWeight: 700 }}>{record.address ?? 'Address pending'}</h1>
            <div style={{ color: 'var(--hd)', fontSize: 13, marginTop: 5, lineHeight: 1.4 }}>
              {[subAddress, sealed ? `Inspected ${sealed}` : ''].filter(Boolean).join(' · ')}
              {record.company ? <><br />{record.company}</> : null}
            </div>
          </div>
          {cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cover} alt="The house" style={{ width: 58, height: 58, borderRadius: 12, objectFit: 'cover', flex: 'none', border: '1px solid var(--hl)' }} />
            : null}
        </div>
        {claim && <div style={{ margin: `14px ${gut}px 0` }}>{claim}</div>}
        <div className="hr-cols" style={{ padding: desk ? '0 24px' : 0 }}>{house}{lists}</div>
      </>
    );
  }

  return (
    <div className="hr" style={{ minHeight: '100%', fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif', paddingBottom: 120 }}>
      <style>{HR_CSS}</style>
      {body}
      <div style={{ marginTop: 28 }}><Footer /></div>
      {open && <FindingDetailModal a={open} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={record.share_id} onClose={() => setOpen(null)} />}
    </div>
  );
}
export { HR_LIGHT, HR_DARK, HR_CSS, HR_PRIO, hrPrioOf, HR_RANK, HR_POINTS, hrIcon, HR_I, Chev, HrHouse, HomeTab };
export type { HrPrio, HrPage };
