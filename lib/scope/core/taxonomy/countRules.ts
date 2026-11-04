// ─── countRules — "How many …?" as a rule in the template (owner 2026-11-03: "Yes finish the leftovers") ───────────────
// Mockup (approved): https://claude.ai/artifact/XU9cYn2ufZgGxxG7LPzaW4 — panel (e) "a company sets which items it shows,
// whether it asks for a count, the question, what each unit is called and what each unit asks for, the range, and
// whether a data plate may suggest a count. Ledrix ships the default, and a company can reset to it."
//
//   UNITS   a system whose equipment is a physical unit (Water Heater, Heating, Cooling). The count is the number of
//           units; + / "Add another" / voice add one (unitCount.ts decides how − takes one away).
//   SLOTS   a count field that shows that many fixed rows (mini-split Indoor Head 1..8). Head N shows while the count
//           reaches N (its pack `requires`); each row asks its location (optional, "Unknown" when empty).
//
// Ledrix's rules ship in the pack (`counts`); a company template carries only its changes (`template.counts`, by id —
// "Reset to Ledrix" removes the entry); an inspection snapshot keeps the effective set it was created with
// (`template.countDefinitions`) and its checklist is shaped by them once, at creation (applyCountRules).
//
// ── PURE, NO IMPORTS ── executed by verify:count-rules; the website carries a byte-identical copy
// (lib/scope/core/taxonomy/countRules.ts).

export type CountRule = {
  id: string;
  /** What the template editor calls it ("Water heaters", "Mini-split indoor heads"). */
  label: string;
  kind: 'units' | 'slots';
  /** UNITS: the physical unit node (plumb_wh_type). SLOTS: the count field's node (hvac_ms_heads). */
  node: string;
  /** Ask the question at all. Off: no "How many?" (UNITS), or no count field and no slot rows (SLOTS). */
  asks: boolean;
  /** The question ("How many water heaters?"). */
  question: string;
  /** One unit's name ("Water Heater", "Indoor Head"). SLOTS: the rows are named "<unitName> N". */
  unitName: string;
  /** The plural, for the report ("indoor heads"). */
  noun: string;
  /** SLOTS: the report line's lead ("Ductless mini-split"). */
  lead?: string;
  /** SLOTS: the rows, in order (Head 1 first). */
  slots?: string[];
  /** SLOTS: the field each row asks for its location. */
  locationAttr?: string;
  /** SLOTS: ask each row's location. Off: the rows carry no location field. */
  askLocation?: boolean;
  min: number;
  max: number;
  /** A data-plate read may SUGGEST the count (the inspector taps to accept; it never sets it). */
  plateSuggest: boolean;
  /** SLOTS: the plate rows a suggestion is read from (the outdoor unit and the type field). */
  plateNodes?: string[];
};

type Node = { id: string; label?: string; attributes?: { id: string; label?: string; values?: string[]; [k: string]: unknown }[]; children?: Node[]; [k: string]: unknown };
const baseOf = (id: string) => String(id).split('::')[0].replace(/~i\d+$/, '');
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The rules a template runs: Ledrix's, each replaced by the template's own of the same id. A company cannot add a
 *  count rule (it needs checklist rows Ledrix defines); an entry for an id Ledrix does not ship is ignored. */
export function effectiveCounts(ledrix: readonly CountRule[] | null | undefined, template: readonly Partial<CountRule>[] | null | undefined): CountRule[] {
  const over = new Map((template ?? []).filter(t => t && typeof t.id === 'string').map(t => [t.id!, t] as const));
  return (ledrix ?? []).map(l => {
    const o = over.get(l.id);
    if (!o) return l;
    // Identity fields stay Ledrix's: a company changes what the rule asks, never which rows it drives.
    const r: CountRule = { ...l, ...o, id: l.id, kind: l.kind, node: l.node, slots: l.slots, locationAttr: l.locationAttr, plateNodes: l.plateNodes } as CountRule;
    const cap = l.kind === 'slots' ? (l.slots?.length ?? l.max) : 99;
    r.min = clamp(Math.round(Number(r.min) || 1), 1, cap);
    r.max = clamp(Math.round(Number(r.max) || r.min), r.min, cap);
    return r;
  });
}

/** The UNITS rule for a unit node (instance-aware), or null. */
export function unitsRuleOf(rules: readonly CountRule[] | null | undefined, nodeId: string | null | undefined): CountRule | null {
  if (!nodeId) return null;
  const b = baseOf(nodeId);
  return (rules ?? []).find(r => r.kind === 'units' && baseOf(r.node) === b) ?? null;
}

/** Shape a NEW inspection's checklist by its count rules, once, at creation (the snapshot is the authority after):
 *  SLOTS — the count field offers min..max; rows past max are not in the checklist; each row is named "<unitName> N";
 *  a row's location field is dropped when the rule does not ask it; a rule that does not ask drops the field and rows.
 *  UNITS need no shaping (the question is read at the top of the system). Returns a new tree; the input is untouched. */
export function applyCountRules<T extends Node>(systems: readonly T[], rules: readonly CountRule[] | null | undefined): T[] {
  const drop = new Set<string>();
  const rename = new Map<string, string>();
  const noLocation = new Map<string, string>();   // slot id → attribute dropped
  const range = new Map<string, { min: number; max: number }>();
  for (const r of rules ?? []) {
    if (r.kind !== 'slots') continue;
    const slots = r.slots ?? [];
    if (!r.asks) { drop.add(r.node); slots.forEach(s => drop.add(s)); continue; }
    range.set(r.node, { min: r.min, max: r.max });
    slots.forEach((s, i) => {
      if (i + 1 > r.max) { drop.add(s); return; }
      rename.set(s, `${r.unitName} ${i + 1}`);
      if (r.askLocation === false && r.locationAttr) noLocation.set(s, r.locationAttr);
    });
  }
  const shape = (n: Node): Node | null => {
    if (drop.has(baseOf(n.id))) return null;
    let out: Node = n;
    const b = baseOf(n.id);
    const rg = range.get(b);
    if (rg && Array.isArray(n.attributes)) {
      out = { ...out, attributes: n.attributes.map(a => ({ ...a, values: (a.values ?? []).filter(v => { const k = Number(v); return !Number.isFinite(k) || (k >= rg.min && k <= rg.max); }) })) };
    }
    const nm = rename.get(b);
    if (nm && !/~i\d+$/.test(n.id)) out = { ...out, label: nm };
    const la = noLocation.get(b);
    if (la && Array.isArray(out.attributes)) out = { ...out, attributes: out.attributes.filter(a => a.id !== la) };
    if (Array.isArray(n.children)) out = { ...out, children: n.children.map(shape).filter((c): c is Node => !!c) };
    return out;
  };
  return systems.map(s => shape(s) as T).filter(Boolean);
}

/** The report's one line for each SLOTS rule that holds a count ("Ductless mini-split, 3 indoor heads: Primary
 *  Bedroom, Living Room, Unknown"). `fieldValue(nodeId, attrId)` reads a field's stored answer (the caller resolves the
 *  store key — conditionMatch.specStoreKey; attrId undefined = the count field's own single attribute);
 *  `applies` says whether the count field is in play for this job (its type rule), so a count left behind by a
 *  changed type never prints. Rows of the line's units are listed so the caller can stop printing them one by one. */
export function countSummaries(rules: readonly CountRule[] | null | undefined, read: {
  fieldValue: (nodeId: string, attrId?: string) => string | undefined | null;
  applies: (nodeId: string) => boolean;
}): { rule: CountRule; text: string; count: number; covers: string[] }[] {
  const out: { rule: CountRule; text: string; count: number; covers: string[] }[] = [];
  for (const r of rules ?? []) {
    if (r.kind !== 'slots' || !r.asks || !read.applies(r.node)) continue;
    const raw = String(read.fieldValue(r.node) ?? '').trim();
    const count = Number.parseInt(raw, 10);
    if (!Number.isFinite(count) || count < 1) continue;
    const slots = (r.slots ?? []).slice(0, Math.min(count, r.max));
    const singular = r.unitName.trim().toLowerCase();
    const head = `${r.lead ?? r.label}, ${count} ${count === 1 ? singular : r.noun}`;
    let text = head;
    if (r.askLocation !== false && r.locationAttr) {
      const locs = slots.map(s => String(read.fieldValue(s, r.locationAttr) ?? '').trim() || 'Unknown');
      text = `${head}: ${locs.join(', ')}`;
    }
    out.push({ rule: r, text, count, covers: [r.node, ...slots] });
  }
  return out;
}

/** What a data-plate read SUGGESTS for a SLOTS count, or null. Read from the plate rows on the rule's plate nodes: a
 *  fact named for zones / indoor units / heads / ports with a number, or the same said in the row's text ("3-zone",
 *  "4 indoor units"). Proposals that disagree suggest nothing; a number outside the rule's range suggests nothing.
 *  It is only ever offered — the inspector's tap sets the count. */
export function plateCountSuggestion(rule: CountRule | null | undefined, rows: readonly {
  nodeId?: string | null; status?: string | null; material?: string | null; category?: string | null;
  attributes?: { key?: string; value?: unknown }[] | null;
}[] | null | undefined): number | null {
  if (!rule || rule.kind !== 'slots' || !rule.asks || !rule.plateSuggest) return null;
  const nodes = new Set((rule.plateNodes ?? []).map(baseOf));
  const KEY = /\b(zones?|indoor\s*units?|indoor\s*heads?|heads?|ports?|air\s*handlers?)\b/i;
  const TEXT = /\b(\d{1,2})\s*[- ]?\s*(?:zones?|indoor\s*units?|indoor\s*heads?|heads?|ports?)\b/i;
  const seen = new Set<number>();
  for (const r of rows ?? []) {
    if (!r || r.status === 'rejected' || !nodes.has(baseOf(String(r.nodeId ?? '')))) continue;
    for (const a of r.attributes ?? []) {
      if (!a?.key || !KEY.test(String(a.key))) continue;
      const m = String(a.value ?? '').match(/\d{1,2}/);
      if (m) seen.add(Number(m[0]));
    }
    for (const t of [r.material, r.category]) { const m = String(t ?? '').match(TEXT); if (m) seen.add(Number(m[1])); }
  }
  if (seen.size !== 1) return null;
  const n = [...seen][0];
  return n >= rule.min && n <= rule.max ? n : null;
}
