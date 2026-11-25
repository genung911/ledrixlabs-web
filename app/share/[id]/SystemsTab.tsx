import { useMemo, useState, type CSSProperties } from 'react';
import { homeSystems, type HomeSystem } from '@/lib/scope/core/home/homeSystemsModel';
import { ACCENT, CRITICAL, WARN, CARD, BORDER, MED, TEXT, SERIF, eyebrow, type Anomaly, type HomeRecord, priorityOf } from './shared';
import { FindingDetailModal } from './ui';

const SYS_MONO = 'Roboto Mono, monospace';
const sysLine = (s: HomeSystem): string => [
  s.facts[0]?.value,
  s.made ? `${s.made.year}` : '',
  s.life?.past ? 'past its typical life' : '',
  s.manual ? 'manual' : '',
].filter(Boolean).join(' · ');

function SystemsTab({ record, anomalies, onAllFindings }: { record: HomeRecord; anomalies: Anomaly[]; onAllFindings: () => void }) {
  const systems = useMemo(() => homeSystems({ specs: Array.isArray(record.specs) ? record.specs : [], findings: anomalies, inspectedAt: record.inspection_date ?? null }), [record, anomalies]);
  const [open, setOpen] = useState<string | null>(null);
  const current = systems.find(s => s.key === open) ?? null;
  if (current) return <SystemScreen s={current} record={record} onBack={() => setOpen(null)} />;
  return (
    <div style={{ padding: '16px 18px 96px' }}>
      <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Home Record</div>
      <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>Systems</div>
      {anomalies.length > 0 && (
        <button onClick={onAllFindings} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '13px 15px', marginBottom: 12, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>All findings</span>
          <span style={{ fontSize: 13, color: MED }}>{anomalies.length} ›</span>
        </button>
      )}
      {systems.length === 0 ? <div style={{ textAlign: 'center', padding: '26px 0', color: MED, fontSize: 14 }}>No systems recorded yet.</div> : (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          {systems.map((s, i) => (
            <button key={s.key} onClick={() => setOpen(s.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', border: 'none', borderBottom: i < systems.length - 1 ? `1px solid ${BORDER}` : 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: TEXT }}>{s.label}</span>
                {sysLine(s) && <span style={{ display: 'block', fontSize: 12, color: MED, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sysLine(s)}</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.findings.length ? WARN : MED, flexShrink: 0 }}>{s.findings.length ? `${s.findings.length} finding${s.findings.length === 1 ? '' : 's'}` : 'No findings'}</span>
              <span aria-hidden style={{ color: MED }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SystemScreen({ s, record, onBack }: { s: HomeSystem; record: HomeRecord; onBack: () => void }) {
  const [openFinding, setOpenFinding] = useState<Anomaly | null>(null);
  const byId = new Map((Array.isArray(record.anomalies) ? record.anomalies : []).map(a => [a.id, a] as const));
  const every = (d: number) => (d % 365 === 0 ? (d === 365 ? 'Every year' : `Every ${d / 365} years`) : d % 30 === 0 ? (d === 30 ? 'Every month' : `Every ${d / 30} months`) : `Every ${d} days`);
  const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '13px 15px' };
  const head: CSSProperties = { fontFamily: SYS_MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 };
  return (
    <div style={{ padding: '14px 18px 96px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: ACCENT, fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 0 }}>‹ Systems</button>
      <div>
        <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 26, fontWeight: 600 }}>{s.label}</div>
        {s.facts.length > 0 && <div style={{ fontSize: 13, color: MED, marginTop: 3 }}>{s.facts.slice(0, 3).map(f => f.value).join(' · ')}</div>}
      </div>
      {s.made && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...head, marginBottom: 0 }}>Made</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{s.made.year} · {s.made.age} year{s.made.age === 1 ? '' : 's'}</span>
          </div>
          {s.life && <>
            <div style={{ height: 8, borderRadius: 4, background: BORDER, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.round((s.made.age / s.life.high) * 100))}%`, background: s.life.past ? WARN : ACCENT }} />
            </div>
            <div style={{ fontSize: 12, color: MED, marginTop: 6 }}>Typical life {s.life.low}–{s.life.high} years.{s.life.past ? ' Past it: worth budgeting for a replacement.' : ''}</div>
          </>}
        </div>
      )}
      {s.manual && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: TEXT }}>Owner&apos;s manual</span>
            <span style={{ fontFamily: SYS_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: ACCENT }}>FROM THE DATA PLATE</span>
          </div>
          <a href={s.manual.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 22, border: `1px solid ${ACCENT}`, color: ACCENT, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Open manual</a>
        </div>
      )}
      {s.upkeep.length > 0 && (
        <div style={card}>
          <div style={head}>Upkeep from the manual</div>
          {s.upkeep.map((u, i) => (
            <div key={u.task} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
              <span style={{ flex: 1, fontSize: 14, color: TEXT }}>{u.task}</span>
              <span style={{ fontSize: 12, color: MED }}>{every(u.intervalDays)}</span>
            </div>
          ))}
        </div>
      )}
      {s.facts.length > 0 && (
        <div style={card}>
          <div style={head}>Recorded at the inspection</div>
          {s.facts.map((f, i) => (
            <div key={`${f.label}-${i}`} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
              <span style={{ flex: 1, fontSize: 13, color: MED }}>{f.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, textAlign: 'right' }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}
      <div style={card}>
        <div style={head}>From the inspection</div>
        {s.findings.length === 0 ? <div style={{ fontSize: 14, color: MED }}>No findings for this system.</div> : s.findings.map((f, i) => {
          const a = byId.get(f.id);
          return (
            <button key={f.id || i} onClick={() => a && setOpenFinding(a)} disabled={!a} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0', border: 'none', borderTop: i ? `1px solid ${BORDER}` : 'none', background: 'none', textAlign: 'left', cursor: a ? 'pointer' : 'default' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{f.title}</span>
              <span style={{ fontSize: 12, color: f.isSafety ? CRITICAL : MED }}>{a ? priorityOf(a).label : f.severity}{f.isSafety ? ' · Safety' : ''}</span>
            </button>
          );
        })}
      </div>
      {openFinding && <FindingDetailModal a={openFinding} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={record.share_id} onClose={() => setOpenFinding(null)} />}
    </div>
  );
}

/** Maintain: upkeep reminders, repair status and the repair request, one section. */
export { SYS_MONO, sysLine, SystemsTab, SystemScreen };
