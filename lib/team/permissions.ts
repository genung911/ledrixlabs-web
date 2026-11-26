// Team → a person → Permissions (2026-10-29, ledrix-app PLAN_2026-10-29 Part C; mockup approved by the owner).
// The role is the starting point; the OWNER turns single permissions on or off per person. The server decides
// (ledrix-app supabase_member_permissions.sql, #76: member_has_capability) — this module only asks it, as the signed-in
// user, through four functions and nothing else:
//   my_capabilities          — the signed-in person's resolved set (who may manage the team here)
//   member_permissions       — one colleague's list with the role's default and what changed (team managers read it)
//   set_member_permission    — OWNER ONLY; returns the list as the server now has it
//   reset_member_permissions — OWNER ONLY; back to the role's defaults
// and, since #150 (2026-11-24, permissions on an invitation, set before the person accepts; accepting copies them):
//   role_permission_preset       — a role's 9 defaults (the invite sheet, before the invitation exists)
//   invitation_permissions       — a pending invitation's list, the same shape as a member's
//   set_invitation_permission    — OWNER ONLY, pending invitations only
//   reset_invitation_permissions — OWNER ONLY
// The same calls as the phone (ledrix-app AuthService). scripts/verify-team.mjs holds this module to exactly these.
import { workspace } from '@/lib/workspace/client';

export type Capability =
  | 'add_inspections' | 'see_all_inspections' | 'assign_work' | 'edit_findings'
  | 'crm' | 'invoices' | 'team' | 'company_settings' | 'approve_locations';

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
  approve_locations: 'Approve locations',
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

/** A role's defaults, in the screen's order — the invite sheet's Permissions before Send. */
export async function loadRolePreset(role: string): Promise<Array<{ capability: Capability; preset: boolean }>> {
  const res = await workspace.rpc('role_permission_preset', { p_role: role });
  if (res.error || !res.data) throw new PermissionError('The role\'s defaults could not be loaded', res.error);
  return (res.data as { permissions: Array<{ capability: Capability; preset: boolean }> }).permissions;
}

export async function loadInvitationPermissions(invitationId: string): Promise<MemberPermissions> {
  const res = await workspace.rpc('invitation_permissions', { p_invitation: invitationId });
  if (res.error || !res.data) throw new PermissionError('Permissions could not be loaded', res.error);
  return res.data as MemberPermissions;
}

/** OWNER ONLY, pending invitations only. Shows the server's list, never the click. */
export async function setInvitationPermission(invitationId: string, capability: Capability, allowed: boolean): Promise<MemberPermissions> {
  const res = await workspace.rpc('set_invitation_permission', { p_invitation: invitationId, p_cap: capability, p_allowed: allowed });
  if (res.error || !res.data) throw new PermissionError('The permission was not changed', res.error);
  return res.data as MemberPermissions;
}

export async function resetInvitationPermissions(invitationId: string): Promise<MemberPermissions> {
  const res = await workspace.rpc('reset_invitation_permissions', { p_invitation: invitationId });
  if (res.error || !res.data) throw new PermissionError('The invitation’s permissions were not reset', res.error);
  return res.data as MemberPermissions;
}

/** The steps an invited person follows, until invites are emailed (b3, Resend) — the same words as the phone. */
export const joinSteps = (email: string, name?: string | null, company?: string | null) =>
  `${(name ?? '').trim() ? `Hi ${(name ?? '').trim().split(/\s+/)[0]}, you're` : `You're`} invited to join ${(company ?? '').trim() || 'our team'} on Ledrix.\n\n1. Install Ledrix Inspect from the App Store.\n2. Tap Create account and use this email: ${email}\n3. Confirm the email Ledrix sends, sign in, and tap "I'm joining my company".`;

/** "Everything" / "Custom · 2 changes" / "Office defaults" — the Access column. */
export function accessLabel(role: string | null | undefined, perms: MemberPermissions | null | undefined): string {
  if (role === 'owner' || role === 'ledrix_admin') return 'Everything';
  const n = perms?.permissions.filter(p => p.changed).length ?? 0;
  const name = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Inspector';
  return n ? `Custom · ${n} change${n === 1 ? '' : 's'}` : `${name} defaults`;
}
