import { useState } from 'react';
import { canEdit, can, supaPost, supaDelete, ACCENT, GREEN, BG, CARD, BORDER, DIM, MED, TEXT, SERIF, MONO, eyebrow, type Anomaly, type HomeRecord, type Project, type Reminder, type RepairRow, type MaintenanceLog, priorityOf, fmtDate } from './shared';
import { homeView, ProjectCard, ReminderCard } from './ui';
import { DocsTab } from './RecordsTab';
import { RepairsTab } from './RepairsTab';

// ─── SPECS TAB — the property's recorded systems/components inventory ─────────
// Findings-only was the pattern this mirrors (sort/group + search); specs have no
// severity, so there's no priority filter row — just Search + Sort by System/Room.
// Only 'confirmed' specs surface here (same rule the PDF/report and the maintenance
// schedule already use — pending/dismissed rows never reach the homeowner).
function titleCaseLabel(s: string): string {
  return (s ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function ProjectsTab({ projects, anomalies, shareId, address, onRefresh }: { projects: Project[]; anomalies: Anomaly[]; shareId: string; address?: string; onRefresh: () => void }) {
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const open   = projects.filter(p => p.status !== 'resolved');
  const shown  = statusFilter === 'open' ? open : projects;
  const resolved = projects.filter(p => p.status === 'resolved').length;
  const existingTitles = new Set(projects.map(p => (p.title ?? '').trim().toLowerCase()));
  const fromFindings = anomalies.filter(a => !existingTitles.has((a.description ?? '').trim().slice(0, 100).toLowerCase()));

  const addManual = async () => {
    if (!can('project.add')) return;
    const t = title.trim(); if (!t || busy) return;
    setBusy(true);
    await supaPost('home_projects', { share_id: shareId, title: t.slice(0, 100), status: 'identified', photos: [], seeded: false });
    setTitle(''); setBusy(false); onRefresh();
  };
  const addFromFinding = async (a: Anomaly) => {
    if (!can('project.add')) return;
    if (busy) return;
    setBusy(true);
    await supaPost('home_projects', {
      share_id: shareId, title: (a.description ?? 'Finding').slice(0, 100), system: a.unit ?? null,
      priority: a.severity === 'critical' ? 'critical' : (a.severity === 'deficiency' || a.severity === 'anomaly') ? 'high' : 'low',
      status: 'identified', description: a.description ?? null, recommendation: a.recommendation ?? null,
      contractor_type: null, photos: [], seeded: false,   // never a guessed specialist (owner 2026-10-13)
    });
    setBusy(false); onRefresh();
  };

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Home Record</div>
          <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600 }}>Repair Status</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['open','all'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              background: statusFilter === f ? TEXT : CARD, border: `1px solid ${statusFilter === f ? TEXT : BORDER}`,
              color: statusFilter === f ? '#fff' : MED, borderRadius: 8, padding: '5px 12px',
              fontSize: 8, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
            }}>{f.toUpperCase()}</button>
          ))}
        </div>
      </div>
      {resolved > 0 && (
        <div style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}20`, borderRadius: 10,
          padding: '8px 14px', marginBottom: 12, color: GREEN, fontSize: 9, fontWeight: 700,
          fontFamily: 'Roboto Mono, monospace' }}>
          ✓ {resolved} PROJECT{resolved > 1 ? 'S' : ''} RESOLVED
        </div>
      )}
      {/* Add a project — manually or from a finding */}
      {can('project.add') && <button onClick={() => setShowAdd(v => !v)} style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 9, padding: 12, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, cursor: 'pointer', marginBottom: 12 }}>{showAdd ? 'Close' : '+ Track a repair or project'}</button>}
      {showAdd && can('project.add') && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 13, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: fromFindings.length ? 14 : 0 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManual()} placeholder="New project…" style={{ flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', color: TEXT, fontSize: 13, outline: 'none' }} />
            <button onClick={addManual} disabled={busy || !title.trim()} style={{ background: TEXT, color: '#fff', border: 'none', borderRadius: 9, padding: '0 16px', fontSize: 12, fontWeight: 600, cursor: title.trim() ? 'pointer' : 'default', opacity: title.trim() ? 1 : 0.5 }}>Add</button>
          </div>
          {fromFindings.length > 0 && (
            <>
              <div style={{ color: DIM, fontSize: 9, fontWeight: 600, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>OR ADD FROM A FINDING</div>
              {fromFindings.slice(0, 40).map((a, i) => (
                <div key={a.id ?? i} onClick={() => addFromFinding(a)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${BORDER}33`, cursor: 'pointer' }}>
                  <span style={{ color: priorityOf(a).color, fontSize: 16, flexShrink: 0, lineHeight: 1 }}>+</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: TEXT, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.unit ?? 'Finding'}</div>
                    <div style={{ color: DIM, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{homeView(a).description}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: DIM }}>
          {projects.length === 0
            ? <div style={{ fontSize: 12, lineHeight: 1.7 }}>No projects yet.<br />Add one above, or pull from a finding.</div>
            : <><div style={{ fontSize: 22, marginBottom: 8 }}>✓</div><div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: GREEN, fontFamily: 'Roboto Mono, monospace' }}>ALL REPAIRS RESOLVED</div></>}
        </div>
      ) : shown.map(p => <ProjectCard key={p.id} p={p} shareId={shareId} address={address} onUpdate={onRefresh} />)}
    </div>
  );
}

// ─── LogServiceForm — quick manual entry into the service history (Carfax) ───────
function LogServiceForm({ shareId, onSaved, access, onUnlock }: { shareId: string; onSaved: () => void; access: boolean; onUnlock: () => void }) {
  const [open, setOpen]     = useState(false);
  const [title, setTitle]   = useState('');
  const [system, setSystem] = useState('');
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 13px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const save = async () => {
    if (!can('log.add')) return;
    if (!title.trim()) return;
    setSaving(true);
    await supaPost('home_maintenance_log', [{ share_id: shareId, title: title.trim(), system: system.trim() || null, kind: 'service', note: note.trim() || null, done_date: date, source: 'manual' }]).catch(() => {});
    setTitle(''); setSystem(''); setNote(''); setSaving(false); setOpen(false); onSaved();
  };
  if (!can('log.add')) return null;
  if (!open) return (
    <button onClick={() => access ? setOpen(true) : onUnlock()} style={{ width: '100%', background: TEXT, color: '#fff', border: 'none', borderRadius: 9, padding: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>+ Log a service or improvement</button>
  );
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 16, boxShadow: '0 1px 2px rgba(16,24,28,0.04)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Log a service or improvement</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What was done? e.g. New roof installed" style={inp} />
        <div style={{ display: 'flex', gap: 9 }}>
          <input value={system} onChange={e => setSystem(e.target.value)} placeholder="System (Roof, HVAC…)" style={{ ...inp, flex: 1 }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, flex: 1 }} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note — contractor, cost, warranty (optional)" style={inp} />
        <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
          <button onClick={() => setOpen(false)} style={{ flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !title.trim()} style={{ flex: 2, background: TEXT, color: '#fff', border: 'none', borderRadius: 9, padding: 12, fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: title.trim() ? 1 : 0.5 }}>{saving ? 'Saving…' : 'Add to home record'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAINTENANCE TAB — spec-driven schedule + the Carfax service history ────────
function RemindersTab({ reminders, log, shareId, onRefresh, access, onUnlock, showHistory = true }: { reminders: Reminder[]; log: MaintenanceLog[]; shareId: string; onRefresh: () => void; access: boolean; onUnlock: () => void; showHistory?: boolean }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const pending   = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);
  const shown     = showCompleted ? reminders : pending;
  const MONO = 'Roboto Mono, monospace';

  return (
    <div style={{ padding: '16px 18px 28px' }}>
      <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Home Record</div>
      <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600, marginBottom: 16 }}>Maintenance</div>
      <LogServiceForm shareId={shareId} onSaved={onRefresh} access={access} onUnlock={onUnlock} />

      {/* Upcoming schedule — built from THIS home's specs (Stage 3a) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 12px' }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase' }}>Upcoming maintenance</div>
        {completed.length > 0 && (
          <button onClick={() => setShowCompleted(v => !v)} style={{ background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 8, padding: '5px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{showCompleted ? 'Hide done' : `+${completed.length} done`}</button>
        )}
      </div>
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '26px 0', color: MED, fontSize: 14 }}>All caught up.</div>
      ) : shown.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1;
      }).map(r => <ReminderCard key={r.id} r={r} onUpdate={onRefresh} access={access} onUnlock={onUnlock} />)}

      {/* Service history — the living Carfax timeline (One Home: its own History section; here only on the old screen) */}
      {showHistory && log.length > 0 && <ServiceHistory log={log} onRefresh={onRefresh} />}
    </div>
  );
}

/** The home's service history — every repair, upkeep and improvement logged, newest first. */
function ServiceHistory({ log, onRefresh }: { log: MaintenanceLog[]; onRefresh: () => void }) {
  const MONO = 'Roboto Mono, monospace';
  return (
    <>
      {log.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: MED, fontSize: 14 }}>Nothing logged yet.</div>}
      {log.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Service history · {log.length}</div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '4px 16px', boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
            {log.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: i < log.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: MED, fontWeight: 600, flexShrink: 0, width: 66, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(e.done_date)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{e.title}</div>
                  {(e.system || e.note) && <div style={{ fontSize: 12, color: MED, marginTop: 2 }}>{[e.system, e.note].filter(Boolean).join(' · ')}</div>}
                </div>
                {e.source === 'voice' && <div style={{ fontFamily: MONO, fontSize: 8, color: MED, flexShrink: 0, alignSelf: 'center' }}>VOICE</div>}
                {canEdit() && ['manual', 'task', 'voice'].includes(e.source ?? '') && (
                  <button aria-label="Delete entry" onClick={async () => {
                    if (!can('log.delete')) return;
                    if (!window.confirm('Delete this entry from your service history?')) return;
                    await supaDelete('home_maintenance_log', `id=eq.${encodeURIComponent(e.id)}`);
                    onRefresh();
                  }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 14, flexShrink: 0, alignSelf: 'center', lineHeight: 1 }}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── ONE HOME: SYSTEMS · MAINTAIN · HISTORY (owner 2026-11-12, mockup GejuM8pyUwwkWUyVnuPFGD) ────────────────────
// Systems and each System screen come from the SAME model the Ledrix Home app reads (homeSystemsModel.ts, copied from the
// app): what the inspection recorded, the year made against its typical service life, the manual Ledrix checked from the
// data plate and its upkeep, and the findings the report printed under that system.

/** The five sections, under the header. Tapping one starts fresh there (no back stack). */
function MaintainTab(props: {
  reminders: Reminder[]; log: MaintenanceLog[]; projects: Project[]; repairs: RepairRow[]; anomalies: Anomaly[]; record: HomeRecord;
  shareId: string; access: boolean; onUnlock: () => void; onRefreshReminders: () => void; onRefreshProjects: () => void; onRefreshRepairs: () => void;
}) {
  const [part, setPart] = useState<'upkeep' | 'projects' | 'repairs'>('upkeep');
  const parts: [typeof part, string][] = [['upkeep', 'Upkeep'], ['projects', 'Repair status'], ['repairs', 'Repair request']];
  return (
    <div>
      <div role="tablist" aria-label="Maintain" style={{ display: 'flex', gap: 6, padding: '12px 18px 0' }}>
        {parts.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={part === k} onClick={() => setPart(k)} style={{ minHeight: 34, padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            border: `1px solid ${part === k ? ACCENT : BORDER}`, background: part === k ? ACCENT : CARD, color: part === k ? '#fff' : TEXT }}>{l}</button>
        ))}
      </div>
      {part === 'upkeep' && <RemindersTab reminders={props.reminders} log={props.log} shareId={props.shareId} onRefresh={props.onRefreshReminders} access={props.access} onUnlock={props.onUnlock} showHistory={false} />}
      {part === 'projects' && <ProjectsTab projects={props.projects} anomalies={props.anomalies} shareId={props.shareId} address={props.record.address} onRefresh={props.onRefreshProjects} />}
      {part === 'repairs' && <RepairsTab anomalies={props.anomalies} shareId={props.shareId} repairs={props.repairs} record={props.record} onRefresh={props.onRefreshRepairs} signedIn={props.access} />}
    </div>
  );
}

/** History: the service history, then the home's documents. */
function HistoryTab({ log, record, onRefresh }: { log: MaintenanceLog[]; record: HomeRecord; onRefresh: () => void }) {
  return (
    <div>
      <div style={{ padding: '16px 18px 0' }}>
        <div style={{ ...eyebrow(MED, 8.5), marginBottom: 4 }}>Home Record</div>
        <div style={{ fontFamily: SERIF, color: TEXT, fontSize: 22, fontWeight: 600 }}>History</div>
        <ServiceHistory log={log} onRefresh={onRefresh} />
      </div>
      <DocsTab record={record} />
    </div>
  );
}

/** "Make this home yours" — the Home screen's way in to claiming (mockup GejuM8pyUwwkWUyVnuPFGD, board 1). */
export { titleCaseLabel, ProjectsTab, LogServiceForm, RemindersTab, ServiceHistory, MaintainTab, HistoryTab };
