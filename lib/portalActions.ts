// ─── portalActions — which portal actions a link's page OFFERS (client-safe, pure) ───────
// (Homeowner security pass 4, 2026-10-20.) Used by app/share/[id]/page.tsx to hide controls and to
// stop handlers early; checked by scripts/verify-portal-security.mjs.
//
// This is presentation, not authorization. The server refuses every one of these writes for a
// view-only link on its own (lib/portalPolicy.ts scopeAllows, /api/docs, /api/portal-links); this
// only stops the page offering a button that would fail. A repairs-only link never renders the
// main page at all — it is sent to /share/<token>/repairs.

export type PortalPageScope = 'edit' | 'read' | 'repairs';

/** Every change the main portal page can make. Each is edit-link only. */
export const PORTAL_WRITE_ACTIONS = [
  'project.add', 'project.update',          // add, advance status, add photo, record appliance
  'reminder.update',                         // complete, snooze
  'repair.edit',                             // add to / remove from / reword the repair request
  'repair.share',                            // mint a repairs-only link
  'log.add', 'log.delete',                   // maintenance log (manual form, voice)
  'doc.upload', 'doc.delete',
  'seed',                                    // the page's own schedule/manual reconciliation
] as const;
export type PortalAction = typeof PORTAL_WRITE_ACTIONS[number];

const WRITES: ReadonlySet<string> = new Set(PORTAL_WRITE_ACTIONS);

export function portalCan(scope: PortalPageScope, action: PortalAction): boolean {
  return scope === 'edit' && WRITES.has(action);
}
