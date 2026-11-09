// ─── whatsHere — the answers that shape the checklist, on one page (owner 2026-11-07) ──────────────────────────────
//
// Owner: "material types, system types, maybe even components are questions that need to be answered before the template
// is written/populated for condition aspects … So inspector would have a page where they can enter 90% furnace, mini
// split, carpet, wood siding, vinyl windows, basement, crawlspace, gas fireplace … By answering those or even going back to
// enter info as found, it would then populate the template for the inspector to mark observations." Mockup
// https://claude.ai/artifact/RcdrPQUswkZgFwuoFa4EMv → "Dude this is it. Build it in the two stages." This is stage 2.
//
// NO SECOND LIST OF QUESTIONS. A question is here because a rule reads it: an item in this inspection's rule set (its
// frozen `ruleDefinitions` — Ledrix's rules and the company's — else Ledrix's pack) carries a `requires` (or
// `dependsOnSpec`) on that field — the same rules Scope applies. So the page grows by itself when Ledrix
// (or a company, through its template's own rules) makes a new answer shape the checklist, and nothing here can ask a
// question whose answer changes nothing. A host that is itself waiting on another answer (Indoor Heads waits on the AC
// type) is left to its system: it is not knowable up front.
//
// PURE — no React, no store. The screen (WhatsHereScreen) writes every answer through SpecOptionGrid → useSpecField, the
// one writer Scope uses, so the recorded-work guard and sync are identical.
import type { InspectionTemplate, TemplateNode } from '../templates/InspectionTemplate';
import { baseIdOf, instanceOrdinal } from './instances';
import { NOT_PRESENT, predicatesOf, isSpecPredicate, specPredicateHolds, type SpecPredicate } from './applicability';

// GROUPED BY SYSTEM (owner 2026-11-08, call B: "group by system since we have more now"). A section is the system's own
// label, in the template's system order; the Outside / Inside / Structure grouping was for the checklist-building
// questions alone, before Details asked every spec.
export type WhatsHereSection = string;

/** Systems whose data plate is asked for on the page (the tag tells type, make, model and year). */
export const PLATE_SYSTEMS: Record<string, string> = { heating: 'Furnace / heating unit', cooling: 'AC condenser / heat pump', water_heater: 'Water heater' };

type PackNode = { id: string; requires?: unknown; dependsOnSpec?: { nodeId?: string; includes?: readonly string[] } | null; askIn?: string; typeRow?: boolean };
export type WhatsHereQuestion = {
  section: WhatsHereSection;
  systemId: string;
  systemLabel: string;
  /** The template node holding the answer (an instance id for a second unit). */
  node: TemplateNode;
  /** The attribute asked: one the rules read (shapes), or one that only describes the house. */
  attrId: string;
  /** BUILDS THE CHECKLIST: a rule reads this answer. False = a describing spec (owner 2026-11-08, "Pre-Inspect takes care
   *  of all details, specs, material types, types. Inspect should be strictly condition checks"). */
  shapes: boolean;
  /** A FOLLOW-UP: this question waits on answers asked on this page (Furnace Efficiency waits on the heating type). It
   *  sits right after its parent and is asked only once every one of these holds (followUpApplies). */
  followUp?: { parent: string; predicates: SpecPredicate[] };
};

/** Every (host base id → attribute ids) some rule reads. `attr` absent on a bare key = the host's first field. */
export function shapingFields(packNodes: readonly PackNode[]): Map<string, Set<string | null>> {
  const out = new Map<string, Set<string | null>>();
  const add = (key: unknown, attr: unknown) => {
    if (typeof key !== 'string' || !key) return;
    const [host, keyAttr] = key.split('::');
    const a = keyAttr ?? (typeof attr === 'string' && attr ? attr : null);
    if (!out.has(host)) out.set(host, new Set());
    out.get(host)!.add(a);
  };
  for (const n of packNodes) {
    for (const p of Array.isArray(n.requires) ? n.requires as any[] : []) if (p) add(p.specNodeId, p.attr);   // Ledrix's and the company's
    if (n.dependsOnSpec?.nodeId) add(n.dependsOnSpec.nodeId, null);
  }
  return out;
}

/** The rules THIS inspection runs: its frozen rule set (`ruleDefinitions`, captured at creation — Ledrix's rules and the
 *  company's compiled ones, templateRules.captureRuleDefinitions), else Ledrix's pack (a template, or a legacy
 *  inspection without a frozen set). One translation of company rules — the compiler's — never a second one here. */
export function ruleNodesOf(tpl: InspectionTemplate | null | undefined, packNodes: readonly PackNode[]): PackNode[] {
  const defs = (tpl as { ruleDefinitions?: { nodes?: Record<string, { requires?: unknown; dependsOnSpec?: PackNode['dependsOnSpec'] }> } } | null | undefined)?.ruleDefinitions?.nodes;
  if (!defs) return [...packNodes];
  return Object.entries(defs).map(([id, d]) => ({ id, requires: d?.requires ?? undefined, dependsOnSpec: d?.dependsOnSpec ?? null }));
}

/** The questions for this inspection's template, system by system (template order); in each system the questions that
 *  build the checklist first, then the ones that only describe the house.
 *
 *  FOLLOW-UPS (owner 2026-11-07, "Is or can efficiency be asked in the what's here section?" → "Go ahead and build all").
 *  A host that itself waits on another answer used to be left to its system. When EVERY answer it waits on is a question
 *  on this page, it is asked here too, right after the question it waits on, once those answers call for it — Furnace
 *  Efficiency after the heating type, Indoor Heads after the AC type. A host waiting on anything else stays in its system.
 *
 *  EVERY SPEC (owner 2026-11-08, mockup https://claude.ai/artifact/1JBGc6WjSZSztpkMm3pynL → "A stays in inspect / B group
 *  by system / C yes"): Details also asks every other spec field with authored choices — flue material, thermostat, panel
 *  brand — so Inspect is condition only. Not asked here: a field with no choices (typed or a reading), an equipment type
 *  row, and an item marked `askIn: 'inspect'` (an answer given only by looking — "Visible — No Defects"). A describing
 *  field on a gated item follows the same follow-up rule; one that waits on anything else stays on its Inspect card. Scope
 *  hides a spec grid only for a field this list asks (detailsQuestionKeys), so nothing is asked in neither place. */
export function whatsHereQuestions(tpl: InspectionTemplate | null | undefined, packNodes: readonly PackNode[]): WhatsHereQuestion[] {
  if (!tpl) return [];
  const rules = ruleNodesOf(tpl, packNodes);
  const fields = shapingFields(rules);
  const ruleOf = new Map(rules.map(n => [n.id, n]));
  const packOf = new Map(packNodes.map(n => [n.id, n]));
  const gated = new Set(rules.filter(n => (Array.isArray(n.requires) && (n.requires as any[]).length > 0) || !!n.dependsOnSpec).map(n => n.id));
  const out: WhatsHereQuestion[] = [];
  const later: WhatsHereQuestion[] = [];
  const desc: WhatsHereQuestion[] = [];
  const descLater: WhatsHereQuestion[] = [];
  const specPredsOf = (base: string) => {
    const all = predicatesOf(ruleOf.get(base) as any);
    const preds = all.filter(isSpecPredicate);
    return preds.length && preds.length === all.length ? preds : null;
  };
  const walk = (n: TemplateNode, sys: TemplateNode) => {
    if (n.pointsTo) return;
    const base = baseIdOf(n.id);
    const attrs = n.attributes ?? [];
    if (n.kind === 'component' && attrs.length) {
      const want = fields.get(base);
      const picked = [...(want ?? [])].map(a => (a === null ? attrs[0]?.id : a)).filter((a, i, all): a is string => !!a && all.indexOf(a) === i && attrs.some((x: { id: string }) => x.id === a));
      const q = (attrId: string, shapes: boolean): WhatsHereQuestion => ({ section: sys.label, systemId: sys.id, systemLabel: sys.label, node: n, attrId, shapes });
      const preds = gated.has(base) ? specPredsOf(base) : null;
      for (const attrId of picked) {
        if (!gated.has(base)) out.push(q(attrId, true));
        else if (preds) later.push({ ...q(attrId, true), followUp: { parent: preds[0].specNodeId, predicates: preds } });
      }
      const pk = packOf.get(base);
      if (!pk?.askIn && !pk?.typeRow) for (const a of attrs) {
        if (picked.includes(a.id) || !(a.values ?? []).length) continue;
        if (!gated.has(base)) desc.push(q(a.id, false));
        else if (preds) descLater.push({ ...q(a.id, false), followUp: { parent: preds[0].specNodeId, predicates: preds } });
      }
    }
    (n.children ?? []).forEach(c => walk(c, sys));
  };
  for (const s of tpl.systems ?? []) walk(s, s);
  // A follow-up whose answers are all questions here goes right after the last of them; any other is dropped.
  for (const f of later) {
    const parents = f.followUp!.predicates.map(p => out.findIndex(o => isParent(o, f, p)));
    if (parents.some(i => i < 0)) continue;
    const at = Math.max(...parents);
    let i = at + 1;
    while (i < out.length && out[i].followUp) i++;
    out.splice(i, 0, { ...f, section: out[at].section, followUp: { ...f.followUp!, parent: questionKey(out[at]) } });
  }
  // A describing follow-up stays with its own system, in template order, once its parents are questions here.
  const descAll: WhatsHereQuestion[] = [];
  for (const d of [...desc, ...descLater]) {
    if (!d.followUp) { descAll.push(d); continue; }
    const parents = d.followUp.predicates.map(p => out.findIndex(o => isParent(o, d, p)));
    if (parents.some(i => i < 0)) continue;
    descAll.push({ ...d, followUp: { ...d.followUp, parent: questionKey(out[Math.max(...parents)]) } });
  }
  const order = (tpl.systems ?? []).map(s => s.label);
  const sections = [...new Set([...order, ...out.map(q => q.section), ...descAll.map(q => q.section)])];
  const pos = (q: WhatsHereQuestion) => nodeOrder.get(q.node.id) ?? 0;
  const nodeOrder = new Map<string, number>();
  let k = 0; const number = (n: TemplateNode) => { nodeOrder.set(n.id, k++); (n.children ?? []).forEach(number); };
  (tpl.systems ?? []).forEach(number);
  return sections.flatMap(sec => [
    ...out.filter(q => q.section === sec),
    ...descAll.filter(q => q.section === sec).sort((a, b) => pos(a) - pos(b)),
  ]);
}

/** Does question `o` hold the answer predicate `p` of follow-up `f` reads? Same host (same unit), the predicate's field
 *  — `host::attr`, a bare key with `attr`, or a bare key meaning the host's first field. */
function isParent(o: WhatsHereQuestion, f: WhatsHereQuestion, p: SpecPredicate): boolean {
  const [host, a] = p.specNodeId.split('::');
  const attr = a ?? (typeof p.attr === 'string' && p.attr ? p.attr : undefined);
  return !o.followUp && baseIdOf(o.node.id) === host && instanceOrdinal(o.node.id) === instanceOrdinal(f.node.id)
    && o.attrId === (attr ?? o.node.attributes?.[0]?.id);
}

/** Is a follow-up asked now? Every answer it waits on holds — each read from its parent question on this page, by the
 *  same predicate rule Scope applies. An unanswered parent asks nothing yet. */
export function followUpApplies<Q extends WhatsHereQuestion>(q: Q, all: readonly Q[], valueOf: (q: Q) => string | null | undefined): boolean {
  if (!q.followUp) return true;
  return q.followUp.predicates.every(p => {
    const parent = all.find(o => isParent(o, q, p));
    const v = String((parent ? valueOf(parent) : '') ?? '').trim();
    return !!v && specPredicateHolds(v, p);
  });
}

// ── DONE AND NONE (owner 2026-11-07, mockup https://claude.ai/artifact/XD8fbDLbZVqmAtxocSNNqK → "approved") ─────────
// "Can we get a done button and a none button … when the inspector is done, it moves to the bottom or if they hit none
// it moves to another section even farther below … still visible in case they are needed. This way … only relevant /
// needed answers are at the top." Report: "not present is good" — one line per None.
//
//   open         still to answer (the top, in section order)
//   done         the inspector tapped Done on an answered card → folded into one row under Done
//   notPresent   the answer IS "Not present" (None) → the last section. Read from the ANSWER, never from a mark: it
//                syncs with the answer, every rule reads it (applicability.NOT_PRESENT — never an Other material), and
//                the report prints it as that field's one line.
// Done is only a mark on this page (the phone keeps it per inspection, state/whatsHereMarks): Inspect already follows
// the answer, so Done changes nothing but where the card sits. A Done mark on a card with no answer (cleared elsewhere)
// is not honoured — the card is open again.
export { NOT_PRESENT };

/** A question’s id on this page (never a spec key — `|`, not `::`): the field it answers. */
export const questionKey = (q: Pick<WhatsHereQuestion, 'node' | 'attrId'>): string => `${q.node.id}|${q.attrId}`;

/** The picked entries of a stored value (SPEC_DELIM ', '). */
export const entriesOf = (value: string | null | undefined): string[] => String(value ?? '').split(',').map(v => v.trim()).filter(Boolean);

/** None: the whole answer is Not present. A Not present beside a real pick is a pick (the card is answered). */
export const isNotPresent = (value: string | null | undefined): boolean => {
  const e = entriesOf(value);
  return e.length === 1 && e[0].toLowerCase() === NOT_PRESENT.toLowerCase();
};

export type WhatsHereState = 'open' | 'done' | 'notPresent';
export function stateOf(value: string | null | undefined, marked: boolean): WhatsHereState {
  if (isNotPresent(value)) return 'notPresent';
  return marked && entriesOf(value).length > 0 ? 'done' : 'open';
}

/** The page's three lists, each in the questions' own order (section, then template) — a card brought back returns to
 *  its own place, never to the top. */
export function partitionQuestions<Q extends WhatsHereQuestion>(qs: readonly Q[], valueOf: (q: Q) => string | null | undefined, done: ReadonlySet<string>) {
  const out = { open: [] as Q[], done: [] as Q[], notPresent: [] as Q[] };
  for (const q of qs) out[stateOf(valueOf(q), done.has(questionKey(q)))].push(q);
  return out;
}
