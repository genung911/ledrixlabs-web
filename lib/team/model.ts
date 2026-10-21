// Team — who may invite, which roles they may offer, whose role they may change. PURE (no I/O): the page and the
// guard (scripts/verify-team.mjs) both run it.
//
// Mirrors the server, which decides regardless of what this returns (supabase_phase0_security.sql in ledrix-app):
//   · company_invitations "Company admin manage invitations" — owner / admin / manager of the company invite and revoke.
//   · guard_invitation — only an owner (or ledrix_admin) may invite an owner.
//   · set_company_member_role — owner / admin / manager / ledrix_admin of the SAME company; never your own role; only an
//     owner may grant 'owner' or change an owner's role.
// and the phone (ledrix-app src/state/roleStore.ts TEAM_ROLES / assignableRoles — the guard compares the two).

export const TEAM_ROLES = ['inspector', 'office', 'manager', 'admin'] as const;

const MANAGES_TEAM = ['ledrix_admin', 'owner', 'admin', 'manager'];
const OWNERS = ['owner', 'ledrix_admin'];

/** May this role invite people, revoke invitations and change roles at all? */
export function canManageTeam(actorRole: string | null | undefined): boolean {
  return MANAGES_TEAM.includes(String(actorRole ?? ''));
}

/** The roles an invitation or role change may name — owner only for an owner. */
export function assignableRoles(actorRole: string | null | undefined): string[] {
  return OWNERS.includes(String(actorRole ?? '')) ? [...TEAM_ROLES, 'owner'] : [...TEAM_ROLES];
}

/** Why this member's role cannot be changed by this actor — or null when it can. */
export function roleLockReason(actor: { userId: string; role: string | null | undefined }, member: { id: string; role: string | null }): string | null {
  if (member.id === actor.userId) return 'You can’t change your own role';
  if (!canManageTeam(actor.role)) return 'Only an owner, admin or manager can change roles';
  if (OWNERS.includes(String(member.role ?? '')) && !OWNERS.includes(String(actor.role ?? ''))) return 'Only an owner can change an owner’s role';
  return null;
}

/** What each role can do — one sentence each, the same words the dialog and the explainer use. */
export const ROLE_SUMMARY: Record<string, string> = {
  inspector: 'Their own inspections and the ones assigned to them.',
  office: 'Sees the company’s inspections. Never edits findings.',
  manager: 'Company inspections, assigning work, inviting, changing roles below owner.',
  admin: 'Everything a manager can, plus drafting template changes.',
  owner: 'Everything, including publishing the live template and naming another owner.',
};

/** An address worth sending to the server (the server and RLS decide the rest). */
export function cleanInviteEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export const INVITE_DAYS = 7;   // the phone's createInvitation uses the same window

/** "Oct 28 · 7 days" / "Oct 22 · 1 day" / "Expired" — from now. */
export function expiresLabel(expiresAt: string | null | undefined, now: number = Date.now()): string {
  if (!expiresAt) return '—';
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return '—';
  if (t <= now) return 'Expired';
  const days = Math.max(1, Math.ceil((t - now) / 86_400_000));
  const date = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} · ${days} day${days === 1 ? '' : 's'}`;
}
