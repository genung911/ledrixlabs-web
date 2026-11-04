// ─── gates — one rule in the checklist itself (owner, 2026-11-03: mockup approved, "go ahead") ─────────────────────
// Mockup: https://claude.ai/artifact/86agi7ZeNTRjWiGuACkT4Y.
//
//   GATE    a checklist row (Crawlspace Access, Roof Method of Inspection, Panel Dead Front) or a utility (water, gas,
//           power) being on.
//   REASON  a value of that row ("No Access", "Viewed from Hatch", "Drone", "Not Removed"), or the utility's state
//           ("Off at meter"). `*limitation` = any limitation recorded on the row, its reason being the cause.
//   EFFECT  REMOVE — the gate's items fall off the count and the seal checks, and the report prints one line naming
//           them and why. QUALIFY — the items stay and are rated as usual; the report carries the phrase
//           ("as viewed by drone"). NONE — nothing.
//
// Crawlspace and Attic are the first two gates (their access rows, 2026-11-03 (fourteenth)); Roof method, the panel's
// dead front and the three utilities follow. A company changes Ledrix's gates per template (`template.gates`, by id)
// and "Reset to Ledrix" removes its override. An inspection keeps the gates it was created with (its snapshot).
//
// Utility gates are LEVEL (the visit's InspectionExtras state); a row gate's REMOVE is stored as a limitation when the
// row turns to it (accessAreaLimits, edge-triggered), so "Inspect one anyway", Undo and Remove keep working.
//
// ── PURE, NO IMPORTS ── loaded and executed by guards; the website carries byte-identical copies
// (lib/scope/core/taxonomy/gates.ts, lib/templateBuilder/core/gates.ts).

export type GateEffect = 'remove' | 'qualify' | 'none';
export type GateUtility = 'water' | 'gas' | 'power';
/** A spec condition on an item (the same fragment match the applicability resolver uses): the item belongs to the gate
 *  only when the job's answer holds — gas off removes a gas water heater's operation, never an electric one's. */
export type GateWhen = { specNodeId: string; includes: string[] };
export type GateItem = { node: string; when?: GateWhen };
export type GateReason = {
  /** The row's value as recorded (a limitation reason, a method pick, a spec value), or the utility state.
   *  `*limitation` matches any limitation on the row. Compared case-insensitively. */
  value: string;
  effect: GateEffect;
  /** QUALIFY: the phrase each rating in the area carries ("as viewed by drone"). */
  phrase?: string;
  /** The report's one line for this reason. Absent = composed from the label and the phrase / cause. */
  line?: string;
  /** REMOVE: the cause a row gate stores when it limits (default: the reason's own value, or for `*limitation` the
   *  limitation's reason). */
  cause?: string;
};
export type Gate = {
  id: string;
  label: string;
  /** The checklist row that holds the reason (a row gate)… */
  row?: string;
  /** …or the utility (a utility gate). Exactly one of the two. */
  utility?: GateUtility;
  /** The sections / systems whose items the gate governs (default items = their subtrees, the row itself excluded). */
  area?: string[];
  /** Explicit items, instead of (or when there is no) area. */
  items?: GateItem[];
  /** Where a row gate's REMOVE is stored (sop_limitations.systems key). Default `gate.<id>`. Crawlspace and Attic keep
   *  the area ids they have used since the area limitation shipped (2026-11-03). */
  storeKey?: string;
  reasons: GateReason[];
  /** 'company' for a gate a company added; Ledrix's are unmarked. */
  origin?: 'company';
};

type Node = { id: string; label?: string; children?: Node[] };
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const baseOf = (id: string) => String(id).split('::')[0].replace(/~i\d+$/, '');
const LIMIT_RE = /\(limitation\)/i;
const reasonOfLimitation = (v: string) => v.replace(/\s*\(limitation\)\s*/i, '').trim();

/** The gates an inspection runs: Ledrix's, each replaced by the template's own of the same id, then the template's
 *  added ones. A template entry `{ id, removed: true }` turns a Ledrix gate off for that template. */
export function effectiveGates(ledrix: readonly Gate[] | null | undefined,
  template: readonly (Gate | { id: string; removed: true })[] | null | undefined): Gate[] {
  const over = new Map((template ?? []).map(g => [g.id, g] as const));
  const out: Gate[] = [];
  for (const g of ledrix ?? []) {
    const o = over.get(g.id);
    if (o && (o as any).removed) continue;
    out.push((o as Gate) ?? g);
  }
  for (const g of template ?? []) if (!(ledrix ?? []).some(l => l.id === g.id) && !(g as any).removed) out.push(g as Gate);
  return out;
}

export const gateStoreKey = (g: Gate): string => g.storeKey ?? `gate.${g.id}`;

/** The gate whose row this node is (base id; `~iN` and `::attr` resolve), or null. */
export function gateOfRow(gates: readonly Gate[] | null | undefined, nodeId: string): Gate | null {
  const b = baseOf(nodeId);
  return (gates ?? []).find(g => g.row && baseOf(g.row) === b) ?? null;
}
/** The gate a stored limitation key belongs to, or null. */
export function gateOfStoreKey(gates: readonly Gate[] | null | undefined, key: string): Gate | null {
  return (gates ?? []).find(g => g.row && gateStoreKey(g) === key) ?? null;
}

/** The reason a row's recorded values select, and its cause. REMOVE outranks QUALIFY (an area not entered is not
 *  "viewed from the hatch"); among the same effect, the gate's own order. `values` = every value recorded on the row
 *  (condition and spec stores, limitations as "<reason> (Limitation)", method picks plain). */
export function rowReason(g: Gate, values: readonly (string | null | undefined)[]): { reason: GateReason; cause: string } | null {
  const vals = values.filter((v): v is string => typeof v === 'string' && !!v.trim())
    .flatMap(v => v.split(/\s*,\s*/)).map(v => v.trim()).filter(Boolean);
  const lims = vals.filter(v => LIMIT_RE.test(v)).map(reasonOfLimitation);
  const plain = vals.filter(v => !LIMIT_RE.test(v));
  const order: GateEffect[] = ['remove', 'qualify'];
  for (const eff of order) {
    for (const r of g.reasons.filter(x => x.effect === eff)) {
      if (r.value === '*limitation') { if (lims.length) return { reason: r, cause: r.cause ?? lims[0] }; continue; }
      const want = norm(r.value);
      if (lims.some(l => norm(l) === want) || plain.some(p => norm(p) === want)) return { reason: r, cause: r.cause ?? r.value };
    }
  }
  return null;
}
/** The reason a utility's state selects (none for On / Not determined / unanswered — "Not determined changes nothing"). */
export function utilityReason(g: Gate, state: string | null | undefined): { reason: GateReason; cause: string } | null {
  if (!g.utility || !state) return null;
  const r = g.reasons.find(x => x.effect !== 'none' && norm(x.value) === norm(state));
  return r ? { reason: r, cause: r.cause ?? r.value } : null;
}

function findNode(systems: readonly Node[], id: string): Node | null {
  const walk = (n: Node): Node | null => { if (n.id === id) return n; for (const c of n.children ?? []) { const f = walk(c); if (f) return f; } return null; };
  for (const s of systems) { const f = walk(s); if (f) return f; }
  return null;
}
const whenHolds = (w: GateWhen | undefined, specValue?: (k: string) => string | undefined): boolean => {
  if (!w) return true;
  const v = norm(specValue?.(w.specNodeId));
  if (!v) return false;                               // unanswered: the item is not this utility's — nothing removed on a guess
  return w.includes.some(f => v.includes(norm(f)));
};

/** Every node a gate governs on this job: explicit items whose `when` holds, else the area subtrees — the gate's own
 *  row (and its subtree) never. Instances (`~iN`) of a listed item count. */
export function gateNodes(g: Gate, systems: readonly Node[] | null | undefined, specValue?: (k: string) => string | undefined): Set<string> {
  const out = new Set<string>();
  const sys = systems ?? [];
  const rowBase = g.row ? baseOf(g.row) : null;
  const add = (n: Node) => { if (rowBase && baseOf(n.id) === rowBase) return; out.add(n.id); (n.children ?? []).forEach(add); };
  if (g.items?.length) {
    const want = new Set(g.items.filter(i => whenHolds(i.when, specValue)).map(i => baseOf(i.node)));
    const walk = (n: Node) => { if (want.has(baseOf(n.id))) add(n); else (n.children ?? []).forEach(walk); };
    sys.forEach(walk);
    return out;
  }
  for (const a of g.area ?? []) { const n = findNode(sys, a); if (n) add(n); }
  return out;
}

export type GateEvaluation = {
  /** Nodes off the count, with the gate and cause that removed them. */
  removed: Map<string, { gateId: string; cause: string }>;
  /** Nodes rated with a phrase. */
  qualified: Map<string, { gateId: string; phrase: string }>;
  /** Every gate in effect on this job, for banners and the report. */
  active: { gate: Gate; reason: GateReason; cause: string; nodes: string[] }[];
};
/** What the gates do on this job. Row gates' REMOVE comes from the stored limitations (`stored`: sop_limitations.systems,
 *  key → { cause, except }); their QUALIFY, and utility gates, from what is recorded now. */
export function evaluateGates(gates: readonly Gate[] | null | undefined, systems: readonly Node[] | null | undefined, read: {
  rowValues?: (nodeId: string) => readonly string[];
  utility?: (u: GateUtility) => string | undefined;
  specValue?: (k: string) => string | undefined;
  stored?: Record<string, { cause?: string; except?: readonly unknown[] | null } | null | undefined> | null;
}): GateEvaluation {
  const removed = new Map<string, { gateId: string; cause: string }>();
  const qualified = new Map<string, { gateId: string; phrase: string }>();
  const active: GateEvaluation['active'] = [];
  for (const g of gates ?? []) {
    let hit: { reason: GateReason; cause: string } | null = null;
    let except = new Set<string>();
    if (g.utility) hit = utilityReason(g, read.utility?.(g.utility));
    else if (g.row) {
      const st = read.stored?.[gateStoreKey(g)];
      const now = rowReason(g, read.rowValues?.(g.row) ?? []);
      if (st) {
        // A stored REMOVE stands as recorded (the inspector may have set or kept it themselves).
        const r = g.reasons.find(x => x.effect === 'remove') ?? { value: '*limitation', effect: 'remove' as const };
        hit = { reason: r, cause: String(st.cause ?? r.cause ?? r.value) };
        except = new Set((Array.isArray(st.except) ? st.except : []).map(String));
      } else if (now && now.reason.effect === 'qualify') hit = now;
    }
    if (!hit || hit.reason.effect === 'none') continue;
    const nodes = [...gateNodes(g, systems, read.specValue)].filter(id => !except.has(id) && !except.has(baseOf(id)));
    active.push({ gate: g, reason: hit.reason, cause: hit.cause, nodes });
    for (const id of nodes) {
      if (hit.reason.effect === 'remove') { if (!removed.has(id)) removed.set(id, { gateId: g.id, cause: hit.cause }); }
      else if (hit.reason.phrase && !qualified.has(id)) qualified.set(id, { gateId: g.id, phrase: hit.reason.phrase });
    }
  }
  for (const id of removed.keys()) qualified.delete(id);   // a removed item is not rated, so carries no phrase
  return { removed, qualified, active };
}

/** The report's line for a gate in effect. */
export function gateLine(a: { gate: Gate; reason: GateReason; cause: string }, labels: readonly string[]): string {
  if (a.reason.line) return a.reason.line;
  if (a.reason.effect === 'qualify') return `${a.gate.label}: ${a.cause}: ratings are ${a.reason.phrase ?? 'qualified'}.`;
  const list = labels.length ? ` (${a.gate.utility ? 'not tested' : 'not inspected'}: ${labels.join(', ')})` : '';
  return `${a.gate.label}: ${a.cause}${list}`;
}

/** What a change on a gate's row does to its stored REMOVE. Only the EDGE acts: the row turning to a remove reason
 *  stores it (unless a limitation is already stored — the inspector's own reason is kept), changing remove reasons
 *  updates a cause this gate stored, and leaving it takes back only a cause this gate would have stored. */
export function gateRowAction(g: Gate, before: readonly string[], after: readonly string[],
  stored: { cause?: string } | null | undefined): { act: 'set'; cause: string } | { act: 'remove' } | null {
  const b = rowReason(g, before), a = rowReason(g, after);
  const bRem = b?.reason.effect === 'remove' ? b : null, aRem = a?.reason.effect === 'remove' ? a : null;
  const mine = (c: string | undefined) => !!stored && norm(stored.cause) === norm(c);
  if (aRem && !bRem) return stored ? null : { act: 'set', cause: aRem.cause };
  if (aRem && bRem && norm(aRem.cause) !== norm(bRem.cause)) return !stored || mine(bRem.cause) ? { act: 'set', cause: aRem.cause } : null;
  if (bRem && !aRem) return mine(bRem.cause) ? { act: 'remove' } : null;
  return null;
}
