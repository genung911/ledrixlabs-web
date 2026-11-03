// "When two devices disagree" on the website (owner-approved mockup 2026-11-03). The rules and words are ./rules.ts, a
// byte-identical copy of the app's conflictRules.ts. Kept out of lib/workspace (read-only by verify-workspace).
//   keep      the field already holds the saved value → resolve_inspection_conflict('original_server')
//   useOther  write the other value through the versioned path under the job's edit lock, then resolve('original_client')
import { workspace } from '@/lib/workspace/client';
import { webDevice, type Lease } from '@/lib/findings/edit';
import { BLOCKING_RELEVANCE, type ConflictRow } from './rules';

export type OpenConflict = ConflictRow & { inspection_id: string; through: number; title: string };
const COLS = 'id, inspection_id, table_name, record_id, field, reason, server_value, client_value, client_device, created_at, report_relevance';

export async function listBlockingConflicts(inspectionId: string): Promise<OpenConflict[]> {
  const { data, error } = await workspace.from('inspection_conflicts').select(COLS)
    .eq('inspection_id', inspectionId).eq('status', 'open').in('report_relevance', [...BLOCKING_RELEVANCE]).order('created_at');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (ConflictRow & { inspection_id: string })[];
  if (!rows.length) return [];
  const { data: vals } = await workspace.from('inspection_conflict_values').select('conflict_id, seq').in('conflict_id', rows.map(r => r.id));
  const through = new Map<string, number>();
  for (const v of (vals ?? []) as { conflict_id: string; seq: number }[]) through.set(v.conflict_id, Math.max(through.get(v.conflict_id) ?? 0, Number(v.seq)));
  const titles = new Map<string, string>();
  const ids = (t: string) => rows.filter(r => r.table_name === t).map(r => r.record_id);
  if (ids('anomalies').length) {
    const { data: f } = await workspace.from('anomalies').select('id, description').in('id', ids('anomalies'));
    for (const r of (f ?? []) as { id: string; description: string | null }[]) titles.set(`anomalies:${r.id}`, r.description || 'A finding');
  }
  if (ids('technical_specs').length) {
    const { data: s } = await workspace.from('technical_specs').select('id, category').in('id', ids('technical_specs'));
    for (const r of (s ?? []) as { id: string; category: string | null }[]) titles.set(`technical_specs:${r.id}`, r.category || 'A spec');
  }
  return rows.map(r => ({ ...r, through: through.get(r.id) ?? 0,
    title: r.table_name === 'inspections' ? 'Job details' : (titles.get(`${r.table_name}:${r.record_id}`) ?? 'A record') }));
}

export type SettleResult = { ok: true } | { ok: false; message: string };
const words = (m: string) => /current value is not the selected value/i.test(m) ? 'It was changed again in the meantime. Reload and pick again.'
  : /newer evidence/i.test(m) ? 'Someone sent another value since this was shown. Reload and pick again.'
  : /already resolved/i.test(m) ? 'Someone already settled this one.'
  : /not allowed|42501/i.test(m) ? 'You can’t change this job.' : (m || 'It could not be settled. Try again.');

export async function keepSaved(c: OpenConflict): Promise<SettleResult> {
  const { error } = await workspace.rpc('resolve_inspection_conflict', { p_conflict: c.id, p_selected_source: 'original_server', p_selected_value_id: null, p_expected_through_seq: c.through });
  return error ? { ok: false, message: words(error.message) } : { ok: true };
}

export async function useOther(c: OpenConflict, lease: Lease): Promise<SettleResult> {
  const { data: row, error: rErr } = await workspace.from(c.table_name).select('row_version').eq('id', c.record_id).maybeSingle();
  if (rErr || !row) return { ok: false, message: words(rErr?.message ?? 'record no longer exists') };
  const { error: wErr } = await workspace.from(c.table_name).update({
    [c.field]: c.client_value, sync_base_version: (row as { row_version: number }).row_version, sync_device: webDevice(), lease_epoch: lease.epoch,
  }).eq('id', c.record_id);
  if (wErr) return { ok: false, message: words(wErr.message) };
  const { error } = await workspace.rpc('resolve_inspection_conflict', { p_conflict: c.id, p_selected_source: 'original_client', p_selected_value_id: null, p_expected_through_seq: c.through });
  return error ? { ok: false, message: words(error.message) } : { ok: true };
}
