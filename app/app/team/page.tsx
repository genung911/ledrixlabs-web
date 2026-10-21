'use client';

import { useCallback, useEffect, useState } from 'react';
import { roleLabel, useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { loadMembers, type MemberRow } from '@/lib/workspace/data';
import { createInvitation, loadPendingInvitations, revokeInvitation, setMemberRole, type InvitationRow } from '@/lib/team/api';
import { ROLE_SUMMARY, assignableRoles, canManageTeam, cleanInviteEmail, expiresLabel, roleLockReason } from '@/lib/team/model';

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
  const manages = canManageTeam(access.role);
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
    } catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : 'The team could not load.' }); }
  }, [manages, access.companyId]);
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
          <Card count={state.rows.length} title="Members">
            {state.rows.length === 0 ? <Empty>No members found.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">Email</th><th className="px-4 py-2.5 font-semibold">Phone</th></tr></thead>
                  <tbody className="divide-y divide-hairline">
                    {state.rows.map(m => {
                      const lock = roleLockReason({ userId: access.userId, role: access.role }, m);
                      return (
                        <tr key={m.id}>
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
                          <td className="px-4 py-2.5 text-body">{m.email || '—'}</td>
                          <td className="px-4 py-2.5 text-body">{m.phone || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {manages && <p className="border-t border-hairline px-4 py-3 text-xs text-muted">Removing someone from the team isn’t available yet.</p>}
          </Card>
        )}

        {manages ? (
          <Card title="What each role can do">
            <div className="p-4">
              <p className="mb-3 text-sm text-body">A role is the permission — it’s the same on the phone and here, and the server enforces it.</p>
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
            <p className="mt-4 rounded-lg border border-hairline bg-ground px-3 py-2 text-xs text-body">It takes effect the next time their phone syncs. The change shows here only after the server confirms it.</p>
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
