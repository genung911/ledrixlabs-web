'use client';

import { useCallback, useEffect, useState } from 'react';
import { roleLabel, useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { loadMembers, type MemberRow } from '@/lib/workspace/data';
import { createInvitation, loadPendingInvitations, revokeInvitation, setMemberRole, type InvitationRow } from '@/lib/team/api';
import { ROLE_SUMMARY, assignableRoles, canManageTeam, cleanInviteEmail, expiresLabel, roleLockReason } from '@/lib/team/model';
import { PERMISSION_LABEL, accessLabel, loadMemberPermissions, loadMyCapabilities, resetMemberPermissions, setMemberPermission,
  type Capability, type MemberPermissions } from '@/lib/team/permissions';

// Team (2026-10-21, mockup approved by the owner): invite by email address, revoke a pending invitation, change a role.
// Every change goes to the server as the signed-in user and is shown only once the server confirms it (lib/team/api).
// Inspectors and office see the list only. Removing a member does not exist on the server yet, so it is not offered.

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; rows: MemberRow[]; invites: InvitationRow[] };
type Pending = { member: MemberRow; role: string } | null;

const BTN = 'rounded-full bg-ink px-5 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50';
const BTN_QUIET = 'rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50';
const FIELD = 'h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function TeamPage() {
  const { companyName, access } = useWorkspace();
  // Who may manage the team is the server's `team` permission since #76 (2026-10-29); the role is only its default and
  // the fallback while the server has not answered.
  const [caps, setCaps] = useState<Partial<Record<Capability, boolean>> | null>(null);
  useEffect(() => { loadMyCapabilities().then(setCaps).catch(() => setCaps(null)); }, []);
  const manages = typeof caps?.team === 'boolean' ? caps.team : canManageTeam(access.role);
  const [perms, setPerms] = useState<Record<string, MemberPermissions>>({});
  const [openPerm, setOpenPerm] = useState<string | null>(null);
  const [permBusy, setPermBusy] = useState(false);
  const roles = assignableRoles(access.role);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('inspector');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [rows, invites] = await Promise.all([
        loadMembers(),
        manages && access.companyId ? loadPendingInvitations(access.companyId) : Promise.resolve([] as InvitationRow[]),
      ]);
      setState({ kind: 'ready', rows, invites });
      if (manages) {
        const others = rows.filter(r => r.id !== access.userId && r.role !== 'owner' && r.role !== 'ledrix_admin');
        const got = await Promise.allSettled(others.map(r => loadMemberPermissions(r.id)));
        const next: Record<string, MemberPermissions> = {};
        got.forEach((g, i) => { if (g.status === 'fulfilled') next[others[i].id] = g.value; });
        setPerms(next);
      }
    } catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : 'The team could not load.' }); }
  }, [manages, access.companyId, access.userId]);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const clean = cleanInviteEmail(email);
    if (!clean) { setNotice({ ok: false, text: 'Enter a valid email address.' }); return; }
    if (!access.companyId) return;
    setBusy(true); setNotice(null);
    try {
      await createInvitation(access.companyId, clean, inviteRole);
      setNotice({ ok: true, text: `Invitation saved for ${clean} as ${roleLabel(inviteRole)}. No email was sent — they sign in with this address and accept.` });
      setEmail('');
      await load();
    } catch (e) { setNotice({ ok: false, text: msg(e) }); }
    finally { setBusy(false); }
  };

  const revoke = async (inv: InvitationRow) => {
    if (!access.companyId || !window.confirm(`Revoke the invitation for ${inv.email}?`)) return;
    setBusy(true); setNotice(null);
    try { await revokeInvitation(access.companyId, inv.id); setNotice({ ok: true, text: `Invitation for ${inv.email} revoked.` }); await load(); }
    catch (e) { setNotice({ ok: false, text: msg(e) }); }
    finally { setBusy(false); }
  };

  const confirmRole = async () => {
    if (!pending) return;
    setBusy(true); setNotice(null);
    try {
      await setMemberRole(pending.member.id, pending.role);
      setNotice({ ok: true, text: `${pending.member.full_name || pending.member.email || 'Member'} is now ${roleLabel(pending.role)}.` });
      setPending(null);
      await load();
    } catch (e) { setNotice({ ok: false, text: msg(e) }); setPending(null); }
    finally { setBusy(false); }
  };

  // Every switch shows the server's answer, never the click (lib/team/permissions returns the list as stored).
  const togglePerm = async (memberId: string, cap: Capability, allowed: boolean) => {
    setPermBusy(true); setNotice(null);
    try { const p = await setMemberPermission(memberId, cap, allowed); setPerms(prev => ({ ...prev, [memberId]: p })); }
    catch (e) { setNotice({ ok: false, text: msg(e) }); }
    finally { setPermBusy(false); }
  };
  const resetPerms = async (memberId: string, who: string) => {
    if (!window.confirm(`Reset ${who} to their role’s defaults? Every change you made for them is removed.`)) return;
    setPermBusy(true); setNotice(null);
    try { const p = await resetMemberPermissions(memberId); setPerms(prev => ({ ...prev, [memberId]: p })); }
    catch (e) { setNotice({ ok: false, text: msg(e) }); }
    finally { setPermBusy(false); }
  };
  const openMember = state.kind === 'ready' && openPerm ? state.rows.find(r => r.id === openPerm) ?? null : null;

  return (
    <Page>
      <PageHeader title="Team" subtitle={companyName ?? 'Your company'} />
      <div className="flex flex-col gap-6">
        {manages && (
          <Card title="Invite someone">
            <div className="flex flex-col gap-4 p-4">
              <p className="text-sm text-body">
                Ledrix doesn’t send an email. Tell them to sign in to Ledrix with this address and choose{' '}
                <strong className="text-ink">“I’m joining my company”</strong> — they join when they accept. Invitations expire after 7 days.
              </p>
              <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); invite(); }}>
                <div className="flex min-w-[240px] flex-[3] flex-col gap-1.5">
                  <label htmlFor="inv-email" className="text-xs font-semibold text-body">Email address</label>
                  <input id="inv-email" type="email" autoComplete="off" value={email} onChange={e => { setEmail(e.target.value); setNotice(null); }} className={FIELD} />
                </div>
                <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
                  <label htmlFor="inv-role" className="text-xs font-semibold text-body">Role</label>
                  <select id="inv-role" value={inviteRole} onChange={e => setInviteRole(e.target.value)} className={FIELD}>
                    {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={busy || !email.trim()} className={`${BTN} h-11`}>Save invitation</button>
              </form>
            </div>
          </Card>
        )}

        {notice && (
          <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>
            {notice.text}
          </div>
        )}

        {state.kind === 'loading' && <Card><Loading /></Card>}
        {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}

        {state.kind === 'ready' && manages && state.invites.length > 0 && (
          <Card title="Waiting to accept" count={state.invites.length}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5 font-semibold">Email</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">Expires</th><th className="px-4 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="divide-y divide-hairline">
                  {state.invites.map(inv => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 text-ink">{inv.email}</td>
                      <td className="px-4 py-2.5 text-body">{roleLabel(inv.role)}</td>
                      <td className="px-4 py-2.5 text-body">{expiresLabel(inv.expires_at)}</td>
                      <td className="px-4 py-2 text-right"><button type="button" disabled={busy} onClick={() => revoke(inv)} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {state.kind === 'ready' && (
          <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_560px]">
          <Card count={state.rows.length} title="Members">
            {state.rows.length === 0 ? <Empty>No members found.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-4 py-2.5 font-semibold">Role</th>{manages && <th className="px-4 py-2.5 font-semibold">Access</th>}<th className="px-4 py-2.5 font-semibold">Email</th><th className="px-4 py-2.5 font-semibold">Phone</th>{manages && <th className="px-4 py-2.5"><span className="sr-only">Permissions</span></th>}</tr></thead>
                  <tbody className="divide-y divide-hairline">
                    {state.rows.map(m => {
                      const lock = roleLockReason({ userId: access.userId, role: access.role }, m, manages);
                      const grantable = manages && m.id !== access.userId && m.role !== 'owner' && m.role !== 'ledrix_admin';
                      return (
                        <tr key={m.id} className={openPerm === m.id ? 'bg-accent/5' : undefined}>
                          <td className="px-4 py-2.5 font-medium text-ink">{m.full_name || '—'}{m.id === access.userId && <span className="ml-2 text-xs text-muted">(you)</span>}</td>
                          <td className="px-4 py-2 text-body">
                            {manages && !lock ? (
                              <>
                                <label htmlFor={`role-${m.id}`} className="sr-only">Role for {m.full_name || m.email || 'member'}</label>
                                <select id={`role-${m.id}`} value={m.role ?? 'inspector'} disabled={busy}
                                  onChange={e => { if (e.target.value !== m.role) setPending({ member: m, role: e.target.value }); }}
                                  className="h-9 min-w-[150px] rounded-lg border border-hairline bg-surface px-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
                                  {(m.role && !roles.includes(m.role) ? [m.role, ...roles] : roles).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                                </select>
                              </>
                            ) : (
                              <>{roleLabel(m.role)}{manages && lock && <span className="block text-xs text-muted">{lock}</span>}</>
                            )}
                          </td>
                          {manages && <td className="px-4 py-2.5 text-body">{m.id === access.userId && m.role !== 'owner' ? '—' : accessLabel(m.role, perms[m.id])}</td>}
                          <td className="px-4 py-2.5 text-body">{m.email || '—'}</td>
                          <td className="px-4 py-2.5 text-body">{m.phone || '—'}</td>
                          {manages && (
                            <td className="px-4 py-2 text-right">
                              {grantable && (
                                <button type="button" onClick={() => setOpenPerm(openPerm === m.id ? null : m.id)} aria-expanded={openPerm === m.id}
                                  className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5">Permissions</button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {manages && <p className="border-t border-hairline px-4 py-3 text-xs text-muted">Removing someone from the team isn’t available yet.</p>}
          </Card>
          </div>
          {openMember && (
            <PermissionsPanel member={openMember} perms={perms[openMember.id] ?? null} busy={permBusy}
              onToggle={(cap, v) => togglePerm(openMember.id, cap, v)}
              onReset={() => resetPerms(openMember.id, openMember.full_name || openMember.email || 'this person')}
              onClose={() => setOpenPerm(null)} />
          )}
          </div>
        )}

        {manages ? (
          <Card title="What each role can do">
            <div className="p-4">
              <p className="mb-3 text-sm text-body">A role is the starting point. You can turn single permissions on or off for one person under Permissions — it’s the same on the phone and here, and the server enforces it.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {['inspector', 'office', 'manager', 'admin', 'owner'].map(r => (
                  <div key={r} className="rounded-lg border border-hairline p-3">
                    <div className="text-sm font-semibold text-ink">{roleLabel(r)}</div>
                    <div className="mt-1 text-xs leading-relaxed text-body">{ROLE_SUMMARY[r]}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <p className="text-sm text-body">Only an owner, admin or manager can invite people or change roles.</p>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="rc-h" className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl">
            <h2 id="rc-h" className="text-lg font-bold text-ink">Make {pending.member.full_name || pending.member.email || 'this member'} {/^[aeio]/i.test(roleLabel(pending.role)) ? 'an' : 'a'} {roleLabel(pending.role)}?</h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm text-body">
              <div className="flex gap-3"><dt className="w-16 shrink-0 font-semibold text-ink">Now</dt><dd>{roleLabel(pending.member.role)} — {ROLE_SUMMARY[pending.member.role ?? ''] ?? ''}</dd></div>
              <div className="flex gap-3"><dt className="w-16 shrink-0 font-semibold text-ink">After</dt><dd>{roleLabel(pending.role)} — {ROLE_SUMMARY[pending.role] ?? ''}</dd></div>
            </dl>
            <p className="mt-4 rounded-lg border border-hairline bg-ground px-3 py-2 text-xs text-body">It takes effect the next time their phone syncs. Any permission changes you made for them are cleared — they start on the new role’s defaults. The change shows here only after the server confirms it.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setPending(null)} className={BTN_QUIET}>Cancel</button>
              <button type="button" disabled={busy} onClick={confirmRole} className={BTN}>Change role</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

// Team → a person → Permissions, beside the member list (the approved mockup's website panel). Switches are real
// controls only for the owner (`can_change`); anyone else who manages the team reads them.
function PermissionsPanel({ member, perms, busy, onToggle, onReset, onClose }: {
  member: { id: string; full_name: string | null; email: string | null; role: string | null };
  perms: MemberPermissions | null; busy: boolean;
  onToggle: (cap: Capability, allowed: boolean) => void; onReset: () => void; onClose: () => void;
}) {
  const role = roleLabel(perms?.role ?? member.role);
  const changed = perms?.permissions.filter(p => p.changed).length ?? 0;
  return (
    <aside aria-label={`Permissions for ${member.full_name || member.email || 'member'}`}
      className="min-w-0 flex-[1_1_360px] overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="flex flex-col gap-1.5 border-b border-hairline p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">{member.full_name || member.email || 'Member'}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-hairline px-2.5 py-1 text-xs font-semibold text-body">{role}</span>
            <button type="button" onClick={onClose} aria-label="Close permissions" className="rounded-full p-1.5 text-muted hover:bg-ink/5">✕</button>
          </div>
        </div>
        <p className="text-sm text-body">The role sets the starting point. Changes apply to this person only, on the phone and the website.</p>
      </div>
      {!perms ? (
        <div className="p-4"><Loading /></div>
      ) : (
        <ul className="divide-y divide-hairline">
          {perms.permissions.map(p => (
            <li key={p.capability} className={`flex items-center gap-3 px-4 py-2.5 ${p.changed ? 'bg-accent/5' : ''}`}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  {PERMISSION_LABEL[p.capability] ?? p.capability}
                  {p.changed && <span className="rounded bg-accent/10 px-1.5 py-px text-[11px] font-bold text-accent-ink">Changed</span>}
                </span>
                <span className="text-xs text-body">{role} default: {p.preset ? 'on' : 'off'}</span>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <span className="sr-only">{PERMISSION_LABEL[p.capability]}</span>
                <input type="checkbox" role="switch" className="peer sr-only" checked={p.allowed}
                  disabled={!perms.can_change || busy} onChange={e => onToggle(p.capability, e.target.checked)} />
                <span className="h-[26px] w-11 rounded-full bg-ink/25 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-50" />
                <span className="pointer-events-none absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[18px]" />
              </label>
            </li>
          ))}
          <li className="flex items-center gap-2 px-4 py-3 text-sm text-body">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Templates stay yours — not grantable.
          </li>
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <span className="text-sm text-body">
          {!perms ? '' : changed ? `${changed} change${changed === 1 ? '' : 's'} from ${role} defaults` : `Same as ${role} defaults`}
        </span>
        {perms?.can_change && changed > 0 && (
          <button type="button" disabled={busy} onClick={onReset}
            className="rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">
            Reset to {role} defaults
          </button>
        )}
        {perms && !perms.can_change && <span className="text-xs text-muted">Only the company owner can change these.</span>}
      </div>
    </aside>
  );
}
