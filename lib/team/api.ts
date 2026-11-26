// Team — the desktop's ONLY team writes, as the signed-in user (row-level security and the server's functions decide;
// nothing here uses a service key). Exactly three operations, the same ones the phone uses (ledrix-app AuthService):
//   createInvitation  — insert into company_invitations (RLS: owner/admin/manager of that company; guard_invitation:
//                       only an owner may invite an owner).
//   revokeInvitation  — delete a pending invitation of that company.
//   setMemberRole     — the set_company_member_role function, then the member's role read back to confirm.
// An invitation is a row against the address, accepted from the Ledrix app. #157 adds the person's name and mobile.
//   sendInviteEmail   — the send-invite function (Resend), acting as the signed-in user; it sends, it writes nothing.
// Kept outside lib/workspace, which stays read-only (scripts/verify-workspace.mjs); scripts/verify-team.mjs holds this
// module to exactly these calls.
import { workspace } from '@/lib/workspace/client';
import { INVITE_DAYS } from './model';

export class TeamError extends Error {
  constructor(what: string, cause?: { message?: string; code?: string } | null) {
    super(cause?.message ? `${what}. Server: ${cause.message}` : what);
    this.name = 'TeamError';
  }
}

export type InvitationRow = { id: string; email: string; role: string | null; expires_at: string | null; full_name?: string | null; phone?: string | null };
const noContactCols = (e: { message?: string } | null) => !!e && /full_name|phone/.test(e.message ?? '') && /column|schema cache/i.test(e.message ?? '');

/** Invitations not yet accepted (expired ones included, so they can be revoked), newest first. */
export async function loadPendingInvitations(companyId: string): Promise<InvitationRow[]> {
  let res = await workspace.from('company_invitations').select('id, email, role, expires_at, full_name, phone')
    .eq('company_id', companyId).is('accepted_at', null).order('created_at', { ascending: false });
  // Before #157 is applied the two columns don't exist: read the row as before.
  if (noContactCols(res.error)) res = await workspace.from('company_invitations').select('id, email, role, expires_at')
    .eq('company_id', companyId).is('accepted_at', null).order('created_at', { ascending: false }) as typeof res;
  if (res.error) throw new TeamError('Invitations could not be loaded', res.error);
  return (res.data ?? []) as InvitationRow[];
}

function inviteToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

/** Save an invitation for `email` (already cleaned) as `role`. Refused when that address is already a member. */
/** Returns the new invitation's id (#150: the sheet's permission changes are set on it). */
export async function createInvitation(companyId: string, email: string, role: string, contact: { fullName?: string | null; phone?: string | null } = {}): Promise<string> {
  const member = await workspace.from('company_members').select('id').ilike('email', email).limit(1);
  if (member.error) throw new TeamError('The team could not be checked', member.error);
  if ((member.data ?? []).length) throw new TeamError('That email already belongs to a team member');
  const row = {
    company_id: companyId,
    email,
    role,
    token: inviteToken(),
    expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
  };
  const extra = { ...(contact.fullName ? { full_name: contact.fullName } : {}), ...(contact.phone ? { phone: contact.phone } : {}) };
  let res = await workspace.from('company_invitations').insert({ ...row, ...extra }).select('id');
  if (noContactCols(res.error)) res = await workspace.from('company_invitations').insert(row).select('id');   // before #157
  if (res.error) throw new TeamError('The invitation was not saved', res.error);
  if (!(res.data ?? []).length) throw new TeamError('The invitation was not saved — the server did not confirm it');
  return (res.data as Array<{ id: string }>)[0].id;
}

/** Email the invitation (send-invite, Resend). `again` = a deliberate resend. Throws a TeamError in plain words. */
export async function sendInviteEmail(id: string, again = false): Promise<void> {
  const res = await workspace.functions.invoke('send-invite', { body: { invitation_id: id, again } });
  if (!res.error) return;
  let code = '';
  try { const b = await (res.error as { context?: Response }).context?.json(); code = String(b?.error ?? ''); } catch { /* no body */ }
  const said: Record<string, string> = {
    email_not_configured: 'Email isn’t set up on the server yet (RESEND_API_KEY)',
    email_failed: 'The email service refused it — check the ledrixlabs.com domain in Resend',
    already_joined: 'They have already joined', invitation_expired: 'This invitation has expired — revoke it and invite again',
    not_allowed: 'You can’t send this invitation', invitation_not_found: 'The invitation wasn’t found',
  };
  throw new TeamError(said[code] ?? 'The invitation email was not sent');
}

/** Remove a pending invitation. Confirmed by the rows the server says it deleted (RLS refuses silently). */
export async function revokeInvitation(companyId: string, id: string): Promise<void> {
  const res = await workspace.from('company_invitations').delete().eq('id', id).eq('company_id', companyId).select('id');
  if (res.error) throw new TeamError('The invitation was not revoked', res.error);
  if (!(res.data ?? []).length) throw new TeamError('The invitation was not revoked — it may already be gone, or you may not be allowed');
}

/** Change a member's role through the server's function, then read it back: shown only once the server agrees. */
export async function setMemberRole(memberId: string, role: string): Promise<void> {
  const rpc = await workspace.rpc('set_company_member_role', { p_member: memberId, p_role: role });
  if (rpc.error) throw new TeamError('The role was not changed', rpc.error);
  const back = await workspace.from('company_members').select('role').eq('id', memberId).maybeSingle();
  if (back.error || (back.data as { role?: string } | null)?.role !== role) {
    throw new TeamError('The server did not confirm the change. Refresh and check the role', back.error);
  }
}
