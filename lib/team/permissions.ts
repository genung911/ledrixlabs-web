// Team → a person → Permissions (2026-10-29, ledrix-app PLAN_2026-10-29 Part C; mockup approved by the owner).
// The role is the starting point; the OWNER turns single permissions on or off per person. The server decides
// (ledrix-app supabase_member_permissions.sql, #76: member_has_capability) — this module only asks it, as the signed-in
// user, through four functions and nothing else:
//   my_capabilities          — the signed-in person's resolved set (who may manage the team here)
//   member_permissions       — one colleague's list with the role's default and what changed (team managers read it)
//   set_member_permission    — OWNER ONLY; returns the list as the server now has it
//   reset_member_permissions — OWNER ONLY; back to the role's defaults
// The same calls as the phone (ledrix-app AuthService). scripts/verify-team.mjs holds this module to exactly these.
import { workspace } from '@/lib/workspace/client';

export type Capability =
  | 'add_inspections' | 'see_all_inspections' | 'assign_work' | 'edit_findings'
  | 'crm' | 'invoices' | 'team' | 'company_settings';

export type MemberPermission = { capability: Capability; preset: boolean; allowed: boolean; changed: boolean };
export type MemberPermissions = { role: string | null; can_change: boolean; permissions: MemberPermission[] };

/** Plain words, the same as the phone's Permissions screen. */
export const PERMISSION_LABEL: Record<Capability, string> = {
  add_inspections: 'Add inspections',
  see_all_inspections: 'See all company inspections',
  assign_work: 'Assign work to others',
  edit_findings: 'Edit findings',
  crm: 'CRM — clients, agents, bookings',
  invoices: 'Invoices & payments',
  team: 'Team — invite, change people',
  company_settings: 'Company settings',
};

export class PermissionError extends Error {
  constructor(what: string, cause?: { message?: string; code?: string } | null) {
    const why = cause?.message ?? '';
    super(/not_allowed|Only the company owner/.test(why) ? 'Only the company owner can change permissions.'
      : cause?.code === 'PGRST202' ? `${what}: permissions are not available on the server yet.`
      : why ? `${what}. Server: ${why}` : what);
    this.name = 'PermissionError';
  }
}

/** The signed-in person's permissions, or null when the server cannot say (the page then falls back to the role). */
export async function loadMyCapabilities(): Promise<Partial<Record<Capability, boolean>> | null> {
  const res = await workspace.rpc('my_capabilities');
  if (res.error || !res.data || typeof res.data !== 'object') return null;
  return res.data as Partial<Record<Capability, boolean>>;
}

export async function loadMemberPermissions(memberId: string): Promise<MemberPermissions> {
  const res = await workspace.rpc('member_permissions', { p_member: memberId });
  if (res.error || !res.data) throw new PermissionError('Permissions could not be loaded', res.error);
  return res.data as MemberPermissions;
}

/** OWNER ONLY. The page shows what this returns — the server's list — never the value that was clicked. */
export async function setMemberPermission(memberId: string, capability: Capability, allowed: boolean): Promise<MemberPermissions> {
  const res = await workspace.rpc('set_member_permission', { p_member: memberId, p_cap: capability, p_allowed: allowed });
  if (res.error || !res.data) throw new PermissionError('The permission was not changed', res.error);
  return res.data as MemberPermissions;
}

export async function resetMemberPermissions(memberId: string): Promise<MemberPermissions> {
  const res = await workspace.rpc('reset_member_permissions', { p_member: memberId });
  if (res.error || !res.data) throw new PermissionError('Permissions were not reset', res.error);
  return res.data as MemberPermissions;
}

/** "Everything" / "Custom · 2 changes" / "Office defaults" — the Access column. */
export function accessLabel(role: string | null | undefined, perms: MemberPermissions | null | undefined): string {
  if (role === 'owner' || role === 'ledrix_admin') return 'Everything';
  const n = perms?.permissions.filter(p => p.changed).length ?? 0;
  const name = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Inspector';
  return n ? `Custom · ${n} change${n === 1 ? '' : 's'}` : `${name} defaults`;
}
