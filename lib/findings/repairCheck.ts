// ─── repairCheck — the inspector's word on a homeowner's repair (approval pack item 3, SQL #154) ─────────────────────
// mark_finding_verified as the signed-in inspector: the server allows only the record's inspector, or a company member
// who may edit the inspection, and only once the homeowner has marked the repair Fixed. `on: false` takes it back.
// Kept out of components/workspace (read-only by rule, verify-workspace) like every other workspace write.
import { workspace } from '@/lib/workspace/client';

/** null = saved; a string = the server's reason. */
export async function markFindingVerified(inspectionId: string, ref: string, on: boolean): Promise<string | null> {
  const r = await workspace.rpc('mark_finding_verified', { p_share_id: inspectionId, p_ref: ref, p_verified: on });
  return r.error ? (r.error.message || 'Couldn’t save. Try again.') : null;
}
