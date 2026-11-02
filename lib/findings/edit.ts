// Editing a finding on the website — the SERVER half (2026-11-02, owner: "Build it as shown"). The rules live in
// lib/findings/rules.ts; this file talks to the server as the signed-in person, under the same row-level security,
// lease guard and versioning every phone write goes through.
//
// THE BROWSER IS ONE OF YOUR DEVICES (#81). It takes the job's edit lock the way a phone does — lazily, at the first
// save, so opening the page never takes the job away from a phone — keeps it with a check-in while the page is open,
// and lets go when the page closes. "Edit here instead" moves your own lock from your phone at once (#91
// move_edit_here); the phone's next check-in is refused and it goes view only.
//
// A SAVE NEVER SILENTLY WINS. It names the version it was based on (sync_base_version). The row is read first: if it
// moved since the page loaded, nothing is sent and the newer row comes back. If someone gets in between the read and
// the write, the server keeps their fields (it records the conflict) and the columns that did not take come back.
import { workspace } from '@/lib/workspace/client';

export const FINDING_COLUMNS = 'id, inspection_id, status, severity, description, inspector_notes, location, room, level, unit, component, defect_type, is_safety, source, ai_description, ai_severity, ai_confidence, image_uri, evidence, created_at, updated_at, rejected_at, restored_at, inspector_id, staged_limitation, row_version';

export const WEB_DEVICE_NAME = 'Website';
const DEVICE_KEY = 'ledrix-web-edit-device';

/** This browser's device id, kept per browser. A private window or blocked storage gets one per page load. */
export function webDevice(): string {
  let id: string | null = null;
  try { id = window.localStorage.getItem(DEVICE_KEY); } catch { /* no storage */ }
  if (!id) {
    id = `web_${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16)}`;
    try { window.localStorage.setItem(DEVICE_KEY, id); } catch { /* one per load */ }
  }
  return id;
}

export type Lease = { epoch: number };
export type LeaseAnswer = { kind: 'ok'; lease: Lease } | { kind: 'held'; by: string } | { kind: 'not_on_job' } | { kind: 'error'; message: string };

const leaseError = (e: { message?: string; details?: string | null; code?: string }): LeaseAnswer => {
  const m = e.message ?? '';
  if (/held_by_other_device|lease_live/.test(m)) return { kind: 'held', by: e.details || 'another device' };
  if (/not_on_team/.test(m)) return { kind: 'not_on_job' };
  return { kind: 'error', message: m || 'The job could not be opened for editing.' };
};

/** Take the lock for this browser. A lapsed lock on another device is taken over (that device stopped checking in). */
export async function takeLease(inspectionId: string): Promise<LeaseAnswer> {
  const args = { p_inspection: inspectionId, p_device: webDevice(), p_device_name: WEB_DEVICE_NAME };
  const a = await workspace.rpc('acquire_edit', args);
  if (!a.error) return { kind: 'ok', lease: { epoch: Number((a.data as { epoch?: number } | null)?.epoch) } };
  if (/lapsed_take_over_needed/.test(a.error.message ?? '')) {
    const t = await workspace.rpc('take_over_edit', args);
    return t.error ? leaseError(t.error) : { kind: 'ok', lease: { epoch: Number((t.data as { epoch?: number } | null)?.epoch) } };
  }
  return leaseError(a.error);
}

/** "Edit here instead": move this person's own lock here now (#91). */
export async function moveLeaseHere(inspectionId: string): Promise<LeaseAnswer> {
  const r = await workspace.rpc('move_edit_here', { p_inspection: inspectionId, p_device: webDevice(), p_device_name: WEB_DEVICE_NAME });
  if (r.error) {
    if (/PGRST202|Could not find the function/.test(r.error.message ?? '')) return { kind: 'error', message: 'Editing here while your phone has the job open isn’t switched on yet. Leave the job on your phone, then try again.' };
    return leaseError(r.error);
  }
  return { kind: 'ok', lease: { epoch: Number((r.data as { epoch?: number } | null)?.epoch) } };
}

/** Keep the lock while the page is open. false = it is gone (moved back to a phone, or lapsed). */
export async function checkInLease(inspectionId: string, lease: Lease): Promise<boolean> {
  const { error } = await workspace.rpc('heartbeat_edit', { p_inspection: inspectionId, p_device: webDevice(), p_epoch: lease.epoch });
  return !error;
}

export async function releaseLease(inspectionId: string, lease: Lease): Promise<void> {
  await workspace.rpc('release_edit', { p_inspection: inspectionId, p_device: webDevice(), p_epoch: lease.epoch });
}

export type SaveAnswer<T> =
  | { kind: 'saved'; row: T }
  | { kind: 'changed'; row: T; fields: string[] }       // someone changed it first; theirs is shown
  | { kind: 'locked'; by: string }                       // another of your devices is editing the job now
  | { kind: 'error'; message: string };

const saveError = (m: string): string => {
  if (/not_your_finding|not_on_team|row-level security|42501/.test(m)) return 'You can’t change this finding. Only its inspector or the job’s lead can.';
  if (/unversioned write/.test(m)) return 'The server refused the save. Reload the page and try again.';
  return m || 'The change could not be saved.';
};

/** Save a patch onto the row the page holds. `base` is the row_version the page loaded. */
export async function saveFinding<T extends { id: string; row_version: number | null }>(
  row: T, patch: Record<string, unknown>, lease: Lease, notTaken: (p: Record<string, unknown>, saved: Record<string, unknown>) => string[],
): Promise<SaveAnswer<T>> {
  const now = await workspace.from('anomalies').select(FINDING_COLUMNS).eq('id', row.id).maybeSingle();
  if (now.error) return { kind: 'error', message: saveError(now.error.message) };
  if (!now.data) return { kind: 'error', message: 'This finding is no longer on the server. Reload the page.' };
  const current = now.data as unknown as T;
  if (Number(current.row_version) !== Number(row.row_version)) return { kind: 'changed', row: current, fields: [] };

  const { data, error } = await workspace.from('anomalies')
    .update({ ...patch, updated_at: new Date().toISOString(), sync_base_version: row.row_version, sync_device: webDevice(), lease_epoch: lease.epoch })
    .eq('id', row.id).select(FINDING_COLUMNS).maybeSingle();
  if (error) {
    if (/ledrix lease: (not_lease_holder|no_lease)/.test(error.message ?? '')) return { kind: 'locked', by: 'your phone' };
    return { kind: 'error', message: saveError(error.message ?? '') };
  }
  if (!data) return { kind: 'error', message: 'You can’t change this finding. Only its inspector or the job’s lead can.' };
  const saved = data as unknown as T;
  const missed = notTaken(patch, saved as unknown as Record<string, unknown>);
  return missed.length ? { kind: 'changed', row: saved, fields: missed } : { kind: 'saved', row: saved };
}
