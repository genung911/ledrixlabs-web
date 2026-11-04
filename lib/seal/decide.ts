// What stands between a job and a website seal — the decision, pure (10c of ledrix-app "Seal and send on the website",
// DECISIONS 2026-11-03 (fourth); mockup https://claude.ai/artifact/6Yz1LwcKpti2PwgGcGUupa screens 1–2, approved).
//
// Inputs are already gathered (lib/seal/check.ts); nothing here reads or writes. The rules, from the approved decision:
//   · the release gates are the phone's own (decided by the phone's code on the assembled record): hard locks, soft informs
//   · PHONE-ONLY PARTS LOCK: while any phone says a part of this job is only on it, the website does not seal. A job no
//     phone has reported on is treated the same way — the website cannot know, so it does not assume (decision, 10b)
//   · UNSENT WORK LOCKS: a phone that says it still holds unsent work on this job (#87) — that work is part of the job
//     the server does not have yet
// 10d adds the seal itself; this only says whether it would be allowed and why not.

export type Gate = { key: string; hard: boolean; title: string; detail?: string;
  /** The phone's per-item list (releaseGates `items`): one row per thing to fix, with the Scope item it opens. */
  items?: { label: string; sub?: string; fix?: { route?: { params?: Record<string, string> } } }[] };
export type PhoneReport = { user_id: string; name: string | null; device: string; parts: string[]; reported_at: string };
export type TeamPerson = { user_id: string; name: string | null; unsent?: number; reported_at?: string | null };

/** `items` (owner 2026-11-04, testing a seal: "For the required facts, we should be able to click on those and go straight
 *  to the section to fix"): each row of a gate that has them, with the Scope item (`nodeId`) it opens, when it has one. */
export type LockItem = { label: string; sub?: string; nodeId?: string };
export type Lock = { key: string; title: string; detail: string; items?: LockItem[] };

/** A gate's rows as the website shows them: the phone's `fix.route.params.nodeId` becomes the item to open. */
export function lockItemsOf(g: Gate): LockItem[] | undefined {
  if (!Array.isArray(g.items) || !g.items.length) return undefined;
  return g.items.map(it => {
    const nodeId = it.fix?.route?.params?.nodeId;
    return { label: String(it.label ?? ''), ...(it.sub ? { sub: String(it.sub) } : {}), ...(typeof nodeId === 'string' && nodeId ? { nodeId } : {}) };
  });
}
export type SealDecision = {
  /** Hard gates and the website's own locks; empty = the seal would be allowed (10d). */
  locks: Lock[];
  /** Soft gates: shown, never blocking. */
  notes: Gate[];
  phoneOnly: { state: 'clear' | 'parts' | 'unreported'; phones: { name: string; device: string; parts: string[]; reportedAt: string }[] };
  sealable: boolean;
};

/** Labels for the part keys (ledrix-app serverCoverage RECORD_PARTS + the three it adds). */
export function partLabel(key: string, labels: Record<string, string>): string {
  return labels[key] ?? key;
}

export function decideSeal(i: {
  gates: Gate[] | null;
  reports: PhoneReport[];
  team: TeamPerson[];
  labels: Record<string, string>;
}): SealDecision {
  const locks: Lock[] = [];
  const notes: Gate[] = [];
  if (i.gates === null) {
    locks.push({ key: 'gates', title: 'The report checks could not run', detail: 'Reload to try again. Nothing is sealed while they cannot be checked.' });
  } else {
    for (const g of i.gates) {
      if (g.hard) { const items = lockItemsOf(g); locks.push({ key: `gate:${g.key}`, title: g.title, detail: g.detail ?? '', ...(items ? { items } : {}) }); }
      else notes.push(g);
    }
  }

  const holding = i.reports.filter(r => r.parts.length > 0);
  const state: SealDecision['phoneOnly']['state'] = i.reports.length === 0 ? 'unreported' : holding.length ? 'parts' : 'clear';
  const nameOf = (r: { name: string | null }) => r.name?.trim() || 'A phone';
  if (state === 'unreported') {
    locks.push({ key: 'phone-only', title: 'No phone has reported on this job yet',
      detail: 'Phones say which parts of a job only they hold after they sync (Ledrix 685 or later). Until one has, seal from the phone.' });
  }
  for (const r of holding) {
    locks.push({ key: `phone-only:${r.user_id}:${r.device}`, title: `Part of this job is only on ${nameOf(r)}'s phone`,
      detail: `${r.parts.map(k => partLabel(k, i.labels)).join(' · ')}. The website seals only what the server holds, so seal this report from that phone until these move to the server.` });
  }

  for (const p of i.team) {
    const n = Number(p.unsent ?? 0);
    if (n > 0) locks.push({ key: `unsent:${p.user_id}`, title: `${p.name?.trim() || 'A teammate'}'s phone has ${n} change${n === 1 ? '' : 's'} not sent`,
      detail: 'They reach the server when that phone syncs. Sealing now would leave them out.' });
  }

  return {
    locks, notes,
    phoneOnly: { state, phones: i.reports.map(r => ({ name: nameOf(r), device: r.device, parts: r.parts.map(k => partLabel(k, i.labels)), reportedAt: r.reported_at })) },
    sealable: locks.length === 0,
  };
}
