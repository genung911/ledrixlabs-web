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
import { baseIdOf, instanceOrdinal, libraryIdOf } from './instances';
import { isHouseKey } from './houseFacts';
import { NOT_PRESENT, predicatesOf, isSpecPredicate, isUtilityPredicate, specPredicateHolds, type SpecPredicate } from './applicability';

// GROUPED BY SYSTEM (owner 2026-11-08, call B: "group by system since we have more now"). A section is the system's own
// label, in the template's system order; the Outside / Inside / Structure grouping was for the checklist-building
// questions alone, before Details asked every spec.
export type WhatsHereSection = string;

/** Systems whose data plate is asked for on the page (the tag tells type, make, model and year). */
export const PLATE_SYSTEMS: Record<string, string> = { heating: 'Furnace / heating unit', cooling: 'AC condenser / heat pump', mini_split: 'Mini-split outdoor unit', water_heater: 'Water heater' };

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
  // A HOUSE FACT IS ANSWERED ELSEWHERE (2026-11-13): a rule on `house::gas` / `house::garage` … reads Before you start and
  // Details, never a question on this page, so it neither makes an item a follow-up nor drops it — the item's own
  // applicability already takes it away when the house fact rules it out.
  const ownPreds = (base: string) => predicatesOf(ruleOf.get(base) as any).filter(p => !(isSpecPredicate(p) && isHouseKey(p.specNodeId)));
  const gated = new Set(rules.filter(n => ownPreds(n.id).length > 0).map(n => n.id));
  const out: WhatsHereQuestion[] = [];
  const later: WhatsHereQuestion[] = [];
  const desc: WhatsHereQuestion[] = [];
  const descLater: WhatsHereQuestion[] = [];
  const specPredsOf = (base: string) => {
    const all = ownPreds(base);
    const preds = all.filter(isSpecPredicate);
    return preds.length && preds.length === all.length ? preds : null;
  };
  /** A DESCRIBING question may also wait on a UTILITY (Gas Venting: gas on) — the item's applicability removes it when the
   *  utility is off. Only its spec gates place it here (owner 2026-11-11, build 792: the seven look-to-answer items asked
   *  in Details "like all the others"). A host that BUILDS the checklist keeps the strict rule above. */
  const describingPredsOf = (base: string) => {
    const all = ownPreds(base);
    const preds = all.filter(isSpecPredicate);
    return preds.length && preds.length === all.filter(p => !isUtilityPredicate(p)).length ? preds : null;
  };
  const walk = (n: TemplateNode, sys: TemplateNode) => {
    if (n.pointsTo) return;
    const base = libraryIdOf(n);   // a room's own copy asks its item's questions (2026-11-12)
    const attrs = n.attributes ?? [];
    if (n.kind === 'component' && attrs.length) {
      const want = fields.get(base);
      const picked = [...(want ?? [])].map(a => (a === null ? attrs[0]?.id : a)).filter((a, i, all): a is string => !!a && all.indexOf(a) === i && attrs.some((x: { id: string }) => x.id === a));
      const q = (attrId: string, shapes: boolean): WhatsHereQuestion => ({ section: sys.label, systemId: sys.id, systemLabel: sys.label, node: n, attrId, shapes });
      const preds = gated.has(base) ? specPredsOf(base) : null;
      for (const attrId of picked) {
        if (!gated.has(base)) out.push(q(attrId, true));
        else if (preds) later.push({ ...q(attrId, true), followUp: { parent: preds[0].specNodeId, predicates: preds } });
        else {
          // A rule reads it but it waits on a utility too: not a checklist-building question, still asked as a describing one.
          const dp = describingPredsOf(base);
          if (dp) descLater.push({ ...q(attrId, false), followUp: { parent: dp[0].specNodeId, predicates: dp } });
        }
      }
      const pk = packOf.get(base);
      if (!pk?.askIn && !pk?.typeRow) for (const a of attrs) {
        if (picked.includes(a.id) || !(a.values ?? []).length) continue;
        if (!gated.has(base)) desc.push(q(a.id, false));
        else { const dp = preds ?? describingPredsOf(base); if (dp) descLater.push({ ...q(a.id, false), followUp: { parent: dp[0].specNodeId, predicates: dp } }); }
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
  return followUpParents(q, all).every(({ predicate, parent }) => {
    const v = String((parent ? valueOf(parent) : '') ?? '').trim();
    return !!v && specPredicateHolds(v, predicate);
  });
}

/** A PHOTO READ's view of a follow-up (2026-11-09, systemPhotos): asked plainly once it applies; asked in the SAME read
 *  when each answer it still waits on is either an earlier photo's open proposal that holds its predicate, or a parent
 *  question this read also asks (`when` — the read must answer that parent so the predicate holds, systemShots); else
 *  not asked (null). A confirmed value always wins over a proposal. */
export function followUpInRead<Q extends WhatsHereQuestion>(q: Q, all: readonly Q[], valueOf: (q: Q) => string | null | undefined,
  proposed: (q: Q) => string | undefined, asked: (q: Q) => boolean): { when: { parent: Q; predicate: SpecPredicate }[] } | null {
  if (followUpApplies(q, all, valueOf)) return { when: [] };
  const when: { parent: Q; predicate: SpecPredicate }[] = [];
  for (const { predicate, parent } of followUpParents(q, all)) {
    const v = String((parent ? valueOf(parent) : '') ?? '').trim() || (parent ? proposed(parent) ?? '' : '');
    if (v) { if (!specPredicateHolds(v, predicate)) return null; continue; }
    if (!parent || !asked(parent)) return null;
    when.push({ parent, predicate });
  }
  return { when };
}

/** Each answer a follow-up waits on, with the question on this page that holds it (none → undefined). */
export function followUpParents<Q extends WhatsHereQuestion>(q: Q, all: readonly Q[]): { predicate: SpecPredicate; parent: Q | undefined }[] {
  return (q.followUp?.predicates ?? []).map(p => ({ predicate: p, parent: all.find(o => isParent(o, q, p)) }));
}

// ── NONE: NOT PRESENT ───────────────────────────────────────────────────────────────────────────────────────────
// A question answered "None" holds NOT_PRESENT (applicability — never an Other material; every rule reads it, the report
// prints it as that field's one line). The page's Done marks and its open / done / not-present lists went with the page
// (2026-11-08: Details lives in each system's Photos & details tile, which folds answered questions itself).
export { NOT_PRESENT };

/** A question's id (never a spec key — `|`, not `::`): the field it answers. */
export const questionKey = (q: Pick<WhatsHereQuestion, 'node' | 'attrId'>): string => `${q.node.id}|${q.attrId}`;
