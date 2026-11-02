// Team inspections on the website (increment 5c; DECISIONS "2026-10-30 (second)", SQL #81). READ ONLY: the website
// shows who is on a job, whose section is whose, and where editing is happening. It changes none of it — the lead
// does, on the phone, and editing inspections on the website comes later.
//
// Before #81 is on the server, job_team and inspection_lease_events do not exist: both loaders answer "no team"
// (null / []) and the page looks exactly as it did.
import { workspace } from './client';

// unsent / reported_at arrive with SQL #87 (each phone reports what it has not sent); before it they are absent → 0.
export type JobPerson = { user_id: string; name: string | null; is_lead: boolean; device_name: string | null; live: boolean; heartbeat_at: string | null; unsent?: number; reported_at?: string | null };
export type JobTeam = { lead: string; me: string; people: JobPerson[]; sections: Record<string, string>; lease_period_seconds: number };
export type LeaseEvent = { at: string; action: string; subject_user: string | null; actor: string | null; device_name: string | null; detail: string | null };

const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883' || /Could not find/i.test(e.message ?? ''));

export async function loadJobTeam(inspectionId: string): Promise<JobTeam | null> {
  const { data, error } = await workspace.rpc('job_team', { p_inspection: inspectionId });
  if (error) { if (missing(error)) return null; throw new Error(error.message || 'The team could not be loaded'); }
  return (data as JobTeam | null) ?? null;
}

export async function loadLeaseEvents(inspectionId: string): Promise<LeaseEvent[]> {
  const { data, error } = await workspace.from('inspection_lease_events')
    .select('at, action, subject_user, actor, device_name, detail')
    .eq('inspection_id', inspectionId).order('at', { ascending: false }).limit(30);
  if (error) { if (missing(error)) return []; throw new Error(error.message || 'The editing history could not be loaded'); }
  return (data ?? []) as LeaseEvent[];
}

const first = (n: string | null | undefined) => (n ?? 'Someone').split(/\s+/)[0];
const titled = (k: string) => k.replace(/[_.:-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export type TeamChip = { user_id: string; initials: string; first: string; is_lead: boolean; detail: string; live: boolean };
export type TeamStrip = { live: number; chips: TeamChip[]; unsent: { user_id: string; first: string; count: number }[] };

/** The team strip (owner pick B, 2026-11-02): one chip per person and a NOT SENT warning per phone holding work.
 *  "Kelly · LEAD · the rest · editing", "Sam · Roof, Exterior". Sections nobody was given are the lead's. */
export function teamStrip(team: JobTeam, labels: Record<string, string>): TeamStrip {
  const bySection = new Map<string, string[]>();
  for (const [k, u] of Object.entries(team.sections)) bySection.set(u, [...(bySection.get(u) ?? []), labels[k] ?? titled(k)]);
  const initials = (n: string | null) => (n ?? '?').split(/[\s@]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
  const chips = team.people.map(p => {
    const mine = bySection.get(p.user_id) ?? [];
    const secs = p.is_lead ? (mine.length ? [...mine, 'the rest'] : ['the rest']) : mine;
    return { user_id: p.user_id, initials: initials(p.name), first: first(p.name), is_lead: p.is_lead, live: p.live,
      detail: [secs.join(', ') || 'no sections yet', p.live ? 'editing' : ''].filter(Boolean).join(' · ') };
  });
  return {
    live: team.people.filter(p => p.live).length,
    chips,
    unsent: team.people.filter(p => (p.unsent ?? 0) > 0).map(p => ({ user_id: p.user_id, first: first(p.name), count: p.unsent! })),
  };
}

/** One history line, in words. Never content: a section key at most. */
export function eventLine(e: LeaseEvent, names: Record<string, string>, labels: Record<string, string>): string {
  const who = first(names[e.actor ?? ''] ?? names[e.subject_user ?? '']);
  const subject = first(names[e.subject_user ?? '']);
  const dev = e.device_name ? ` on ${e.device_name}` : '';
  switch (e.action) {
    case 'acquire':          return `${subject} started editing${dev}`;
    case 'release':          return `${subject} finished editing${dev}`;
    case 'expired':          return `${subject}’s editing${dev} lapsed`;
    case 'take_over':        return `${subject} took over editing${dev}`;
    case 'lead_handoff':     return `${who} handed lead to ${subject}`;
    case 'lead_take_over':   return `${subject} took over as lead`;
    case 'member_added':     return `${who} added ${subject} to the team`;
    case 'member_removed':   return `${who} took ${subject} off the team`;
    case 'section_assigned': return `${who} assigned ${e.detail ? (labels[e.detail] ?? titled(e.detail)) : 'a section'} to ${subject}`;
    default:                 return e.action;
  }
}
