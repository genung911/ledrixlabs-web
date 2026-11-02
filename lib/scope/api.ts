// The website's Scope checklist — reads and WRITES (2026-11-02). Kept out of lib/workspace, which verify-workspace holds
// read-only, the way lib/invoices, lib/team and lib/findings are.
//
// A pick goes up through put_inspection_values, the function every phone uses (#83, sections #85), naming the version
// of the item this page saw (`base_seq`, #92): if a phone changed it since, the server refuses 'changed' and keeps
// theirs. The browser holds the job's edit lock first (lib/findings/edit), so your phone and the website are never
// both changing the same job.
import { workspace } from '@/lib/workspace/client';
import { webDevice } from '@/lib/findings/edit';
import type { ServerValue, ValueKind } from './model';

export async function loadTemplate(inspectionId: string): Promise<{ systems?: unknown[] } | null> {
  const { data, error } = await workspace.from('inspection_templates').select('snapshot').eq('inspection_id', inspectionId).maybeSingle();
  if (error) throw new Error(error.message || 'The checklist could not be loaded');
  return ((data as { snapshot?: { systems?: unknown[] } } | null)?.snapshot) ?? null;
}

export async function loadValues(inspectionId: string): Promise<ServerValue[]> {
  const out: ServerValue[] = [];
  for (let after = 0; ;) {
    const { data, error } = await workspace.from('inspection_values')
      .select('structure_id, node_key, kind, section_key, value, updated_by, updated_at, seq')
      .eq('inspection_id', inspectionId).gt('seq', after).order('seq', { ascending: true }).limit(1000);
    if (error) throw new Error(error.message || 'The checklist could not be loaded');
    const rows = (data ?? []) as ServerValue[];
    out.push(...rows);
    if (rows.length < 1000) return out;
    after = rows[rows.length - 1].seq;
  }
}

export type PutRow = { key: string; kind: ValueKind; section: string | null; value: Record<string, unknown>; baseSeq: number | null };
export type PutAnswer = { kind: 'saved'; seq: number } | { kind: 'refused'; reason: string } | { kind: 'error'; message: string };

/** One item's value, on the main building. */
export async function putValue(inspectionId: string, row: PutRow): Promise<PutAnswer> {
  const { data, error } = await workspace.rpc('put_inspection_values', {
    p_inspection: inspectionId, p_device: webDevice(),
    p_rows: [{ structure: 'main', key: row.key, kind: row.kind, section: row.section, value: row.value, base_seq: row.baseSeq }],
  });
  if (error) {
    if (/not_allowed|42501/.test(`${error.code ?? ''} ${error.message ?? ''}`)) return { kind: 'error', message: 'You can’t change this job’s checklist.' };
    return { kind: 'error', message: error.message || 'The pick could not be saved.' };
  }
  const d = data as { accepted?: { key: string; seq: number }[]; refused?: { key: string; reason: string }[] } | null;
  const ok = d?.accepted?.find(a => a.key === row.key);
  if (ok) return { kind: 'saved', seq: Number(ok.seq) };
  return { kind: 'refused', reason: d?.refused?.find(r => r.key === row.key)?.reason ?? 'refused' };
}
