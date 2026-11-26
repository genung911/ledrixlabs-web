// Before you start on the website — the server half (owner 2026-11-14). Reads the job's own house-fact columns; writes
// them the way every phone writes the job (lib/findings/edit's rule): under the job's edit lock, naming the row_version the
// page saw (sync_base_version), this browser as the device and the lock's epoch — if the job moved since, nothing is sent
// and the newer row comes back. A type is an item's spec value, saved through put_inspection_values (lib/scope/api).
import { workspace } from '@/lib/workspace/client';
import { webDevice, type Lease } from '@/lib/findings/edit';
import type { FactsRow } from './model';

const COLS = 'id, row_version, gas_supply, water_source, sewer_type, garage_type, front_faces, stories, appliances_asked, weather, ground, temp_f, weather_confirmed_at, weather_confirmed_weather, weather_confirmed_temp_f, occupancy, water_state, gas_state, power_state';   // + this visit (#103), z22 2026-11-25   // front_faces: #127, 2026-11-14; stories: #128, 2026-11-15; appliances_asked: #134, read here 2026-11-23 (w22)

export async function loadFactsRow(inspectionId: string): Promise<FactsRow | null> {
  const { data, error } = await workspace.from('inspections').select(COLS).eq('id', inspectionId).maybeSingle();
  if (error) throw new Error(error.message || 'The house facts could not be loaded');
  return (data as FactsRow | null) ?? null;
}

export type FactsSave = { kind: 'saved'; row: FactsRow } | { kind: 'changed'; row: FactsRow } | { kind: 'locked' } | { kind: 'error'; message: string };

/** One column of the job (gas_supply · water_source · sewer_type · garage_type), based on the row the page holds. */
export async function saveFactColumn(row: FactsRow, column: string, value: string | null, lease: Lease): Promise<FactsSave> {
  return saveFactColumns(row, { [column]: value }, lease);
}

/** Several of the job's columns at once (a visit page: weather + ground + its confirmation; the three utilities). */
export async function saveFactColumns(row: FactsRow, patch: Record<string, string | null>, lease: Lease): Promise<FactsSave> {
  const now = await workspace.from('inspections').select(COLS).eq('id', row.id).maybeSingle();
  if (now.error || !now.data) return { kind: 'error', message: now.error?.message || 'This job is no longer on the server. Reload the page.' };
  const current = now.data as FactsRow;
  if (Number(current.row_version) !== Number(row.row_version)) return { kind: 'changed', row: current };
  const { data, error } = await workspace.from('inspections')
    .update({ ...patch, updated_at: new Date().toISOString(), sync_base_version: row.row_version, sync_device: webDevice(), lease_epoch: lease.epoch })
    .eq('id', row.id).select(COLS).maybeSingle();
  if (error) {
    if (/ledrix lease: (not_lease_holder|no_lease)/.test(error.message ?? '')) return { kind: 'locked' };
    if (/row-level security|42501/.test(`${error.code ?? ''} ${error.message ?? ''}`)) return { kind: 'error', message: 'You can’t change this job. Only its inspector, the lead or the team can.' };
    return { kind: 'error', message: error.message || 'The change could not be saved.' };
  }
  if (!data) return { kind: 'error', message: 'You can’t change this job. Only its inspector, the lead or the team can.' };
  const saved = data as FactsRow;
  // Someone got in between the read and the write: the server kept theirs (and recorded the conflict).
  return Object.entries(patch).every(([k, v]) => ((saved as Record<string, unknown>)[k] ?? null) === v) ? { kind: 'saved', row: saved } : { kind: 'changed', row: saved };
}
