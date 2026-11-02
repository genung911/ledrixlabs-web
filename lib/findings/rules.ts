// Editing a finding on the website (2026-11-02, mockup "Website Finding Editing", owner: "Build it as shown").
// The RULES, pure and import-free so scripts/verify-finding-edit-web.mjs runs them. They are the phone's rules, not
// new ones:
//   · who may edit — the job's lead edits every finding; a teammate edits the findings they wrote; anyone not on the
//     job edits none (the server's ledrix_lease_guard: not_on_team / not_your_finding, may_change_finding #86)
//   · a staged limitation is confirmed on the phone, where its checkpoint lives (findingConfirmation: applyLimitation)
//   · confirm needs a complete card — description, system, priority, location (cardDefinition, finding kind)
//   · a photo draft's priority counts only once someone picked it or accepted Ledrix's suggestion (isPriorityUnset)
//   · confirming strips the review queue's "Possible duplicate — review: " marker (findingConfirmation)
//   · reject stamps rejected_at; restore returns it to the queue as PROPOSED, never confirmed (anomaliesStore)

export type EditableRow = {
  status: string | null; severity: string | null; description: string | null; inspector_notes: string | null;
  room: string | null; location: string | null; level: string | null; unit: string | null; is_safety: boolean | null;
  inspector_id: string | null; staged_limitation: boolean | null; source: string | null; ai_severity: string | null;
};
export type TeamLike = { lead: string; me: string; people: { user_id: string }[] } | null;

export type EditAccess = 'edit' | 'not_on_job' | 'not_yours' | 'limitation';

/** The finding priorities an inspector picks from — every tier but GOOD (build 668: a finding is not "good"). */
export const PICKABLE_PRIORITIES = ['critical', 'deficiency', 'maintenance', 'characteristic'] as const;
export const AMBIGUOUS_PREFIX = 'Possible duplicate — review: ';

export function editAccess(row: EditableRow, team: TeamLike): EditAccess {
  if (!team || !team.people.some(p => p.user_id === team.me)) return 'not_on_job';
  if (row.staged_limitation === true) return 'limitation';
  if (team.me !== team.lead && row.inspector_id !== team.me) return 'not_yours';
  return 'edit';
}

export type Draft = { description: string; severity: string; is_safety: boolean; room: string; level: string; inspector_notes: string };

const str = (v: string | null | undefined) => (v ?? '').trim();

/** No priority yet: an unconfirmed photo draft with no Ledrix suggestion — its severity is only the column's
 *  placeholder. The same test as model.isPriorityUnset (and the phone's cardDefinition), kept here import-free. */
export function priorityUnset(row: EditableRow): boolean {
  const confirmed = row.status == null || row.status === '' || row.status === 'confirmed';
  return row.source === 'document_photo' && !confirmed && !str(row.ai_severity);
}

export function draftOf(row: EditableRow): Draft {
  return {
    description: row.description ?? '',
    severity: priorityUnset(row) ? '' : (row.severity ?? ''),
    is_safety: row.is_safety === true,
    room: row.room ?? row.location ?? '',
    level: row.level ?? '',
    inspector_notes: row.inspector_notes ?? '',
  };
}

/** What the draft changes, as columns. The room is the finding's place: room and location move together. */
export function changesOf(row: EditableRow, d: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (str(d.description) !== str(row.description)) out.description = str(d.description);
  if (d.severity && d.severity !== row.severity) out.severity = d.severity;
  if (d.is_safety !== (row.is_safety === true)) out.is_safety = d.is_safety;
  if (str(d.room) !== str(row.room ?? row.location)) { out.room = str(d.room) || null; out.location = str(d.room) || null; }
  if (str(d.level) !== str(row.level)) out.level = str(d.level) || null;
  if (str(d.inspector_notes) !== str(row.inspector_notes)) out.inspector_notes = str(d.inspector_notes);
  return out;
}

/** What still stops CONFIRM, named as the card names it. [] = it may be confirmed. */
export function missingForConfirm(row: EditableRow, d: Draft): string[] {
  const m: string[] = [];
  if (!str(d.description)) m.push('Description');
  if (!str(row.unit)) m.push('System');
  if (!d.severity) m.push('Priority');
  if (!str(d.room)) m.push('Location');
  return m;
}

/** CONFIRM: the edits and the decision in one write. The priority is always sent, so accepting Ledrix's suggestion is
 *  a recorded choice. */
export function confirmPatch(row: EditableRow, d: Draft): Record<string, unknown> {
  const p: Record<string, unknown> = { ...changesOf(row, d), status: 'confirmed', severity: d.severity };
  const desc = typeof p.description === 'string' ? p.description : str(row.description);
  if (desc.startsWith(AMBIGUOUS_PREFIX)) p.description = desc.slice(AMBIGUOUS_PREFIX.length);
  return p;
}

export function rejectPatch(row: EditableRow, d: Draft, nowIso: string): Record<string, unknown> {
  return { ...changesOf(row, d), status: 'rejected', rejected_at: nowIso };
}

export function restorePatch(nowIso: string): Record<string, unknown> {
  return { status: 'proposed', rejected_at: null, restored_at: nowIso };
}

/** After a save: the columns the server did not take as sent (somebody changed them first; the server kept theirs). */
export function notTaken(patch: Record<string, unknown>, saved: Record<string, unknown>): string[] {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
  return Object.keys(patch).filter(k => k !== 'rejected_at' && k !== 'restored_at' && JSON.stringify(norm(saved[k])) !== JSON.stringify(norm(patch[k])));
}
