// ─── houseFacts — "Before you start": what this house HAS (owner 2026-11-13, mockup 79T4PDwZHWLj9C5kE4DxQR, boards 6–7) ──
//
// Owner: "this may be the separation I've struggled with". An inspection has three layers:
//   1. HOUSE FACTS  — what EXISTS: the utilities, the equipment types, the foundation, the garage   ← this module
//   2. SPECS        — what each thing IS (materials, year, make), filled from photos in Details
//   3. CONDITION    — how it IS, rated in Inspect
// The facts were already recorded — the utilities on Details (InspectionExtras), the types as ordinary spec answers on
// their own items. "Before you start" gathers them at the top of Scope: ONE RECORD, TWO DOORS. Nothing here stores
// anything; each fact names the store it already lives in, so Details, a photo's accepted proposal and this page all
// read and write the same value.
//
// PHASE 1 (2026-11-13): gathering and the count only. Nothing hides or narrows yet — type-first and the gas narrowing
// are phase 2, and they will read these same facts.
//
// NO IMPORTS, so `verify:house-facts` can execute it.

export type HouseFactGroup = 'property' | 'utilities' | 'equipment' | 'building';
/** Where a fact already lives: a key of the job's report extras (Details), or a spec field (`node id`, `attribute id`). */
export type HouseFactSource =
  | { kind: 'extras'; key: 'gasSupply' | 'waterSource' | 'sewerType' | 'garageType' | 'frontFaces' | 'stories' }
  | { kind: 'spec'; nodeId: string; attr: string };
/** `none`: the house may have none of it (owner 2026-11-13, build 811: "Fireplace made me realize we need a 'none' option").
 *  A spec fact's None records applicability's NOT_PRESENT ('Not present'), the absence every rule already reads; the
 *  garage's None is one of its Details choices. A foundation is never none. */
/** `question` / `hint`: the wizard's page for this fact (owner 2026-11-13, mockup 79T4… boards 8–10: "a full page for each
 *  one … options larger, easy to read"). `multi`: pick every one that applies. */
export type HouseFact = { id: string; label: string; group: HouseFactGroup; source: HouseFactSource; none?: true; question?: string; hint?: string; multi?: true;
  /** ASKED ONLY WHEN another fact's answer names one of these (owner 2026-11-14: "When we select heat pump for heating,
   *  should the next question … be what the backup heat is?") — the same words the item's own rule reads. */
  askWhen?: { fact: string; includesAny: readonly string[] } };

/** The facts, in the page's order (board 6). */
export const HOUSE_FACTS: readonly HouseFact[] = [
  // ORIENTATION FIRST (owner 2026-11-14: "Before you start needs a front facing direction or however internachi says we
  // state the orientation of home"): InterNACHI practice — the report states which way the front faces; left, right and
  // rear are read standing in front of the home, facing it. The same eight directions Ledrix Home records.
  { id: 'front',        label: 'Front faces',  group: 'property',  source: { kind: 'extras', key: 'frontFaces' }, question: 'Which way does the front of the home face?', hint: 'The side with the front door, by compass. Left, right and rear in the report are read standing in front, facing the home.' },
  { id: 'gas',          label: 'Gas',          group: 'utilities', source: { kind: 'extras', key: 'gasSupply' }, multi: true, question: 'What gas does the house have?', hint: 'Pick every one. Look for a meter at the side of the house, or a tank in the yard.' },
  { id: 'water',        label: 'Water',        group: 'utilities', source: { kind: 'extras', key: 'waterSource' }, multi: true, question: 'Where does the water come from?', hint: 'Pick every one. A well has a well head and a pressure tank.' },
  { id: 'sewer',        label: 'Sewer',        group: 'utilities', source: { kind: 'extras', key: 'sewerType' }, multi: true, question: 'Where does the sewer go?', hint: 'Pick every one. Septic shows a tank lid or cleanouts in the yard.' },
  { id: 'heats',        label: 'What heats',   group: 'equipment', source: { kind: 'spec', nodeId: 'hvac_heating', attr: 'fuel_source' }, none: true, question: 'What heats the house?', hint: 'Pick every one.', multi: true },
  { id: 'backup_heat',  label: 'Backup heat',  group: 'equipment', source: { kind: 'spec', nodeId: 'hvac_backup_heat', attr: 'spec' }, question: 'What is the backup heat?', hint: 'A heat pump or mini-split usually has one: heat strips in the air handler, or a gas furnace (dual fuel).', askWhen: { fact: 'heats', includesAny: ['heat pump', 'mini-split'] } },
  { id: 'cools',        label: 'What cools',   group: 'equipment', source: { kind: 'spec', nodeId: 'hvac_cooling', attr: 'spec' }, none: true, question: 'What cools the house?', hint: 'Pick every one.', multi: true },
  { id: 'water_heater', label: 'Water heater', group: 'equipment', source: { kind: 'spec', nodeId: 'plumb_wh_type', attr: 'type' }, none: true, question: 'What kind of water heater?', hint: 'The data plate on its side says.' },
  { id: 'laundry',      label: 'Laundry',      group: 'equipment', source: { kind: 'spec', nodeId: 'laundry_dryer', attr: 'spec' }, none: true, question: 'Are there laundry hookups?', hint: 'The dryer hookup: electric, gas or both — or None.' },
  { id: 'fireplace',    label: 'Fireplace',    group: 'equipment', source: { kind: 'spec', nodeId: 'fp_type', attr: 'spec' }, none: true, question: 'Is there a fireplace?', hint: 'Pick its type, or None.' },
  { id: 'foundation',   label: 'Foundation',   group: 'building',  source: { kind: 'spec', nodeId: 'found_type', attr: 'type' }, question: 'What does the house sit on?', hint: 'Pick every one: a basement with a crawlspace addition is two.', multi: true },
  // WHAT IS THERE AT ALL (owner 2026-11-14, coverage review → "Use suggestion and recommendations"): None takes the
  // items that need it off the checklist (scripts/add-presence-rules.mjs) — an unanswered question hides nothing.
  { id: 'attic',        label: 'Attic',        group: 'building',  source: { kind: 'spec', nodeId: 'attic_access', attr: 'spec' }, none: true, question: 'Is there an attic? How do you get in?', hint: 'None for a flat or cathedral roof with no attic space.' },
  // STORIES, NOT STAIRS (owner 2026-11-15: "Should this question actually be home levels or stories?" → "Go ahead"): how
  // many stories is what the report states, and the stairs follow from it — one story with no basement takes the interior
  // stairs off the checklist (the pack's rule on int_stairs, its handrails and headroom). The stair finish is a detail
  // photos fill in Details, not a question to answer first.
  { id: 'stories',      label: 'Stories',      group: 'building',  source: { kind: 'extras', key: 'stories' }, question: 'How many stories?', hint: 'Above grade. A basement is not a story: the foundation question records it.' },
  { id: 'deck',         label: 'Deck / porch', group: 'building',  source: { kind: 'spec', nodeId: 'ext_deck', attr: 'spec' }, none: true, question: 'Is there a deck or porch?', hint: 'Pick what it is built of, or None.' },
  { id: 'gutters',      label: 'Gutters',      group: 'building',  source: { kind: 'spec', nodeId: 'roof_gutters', attr: 'material' }, none: true, question: 'Are there gutters?', hint: 'Pick the material, or None.' },
  { id: 'garage',       label: 'Garage',       group: 'building',  source: { kind: 'extras', key: 'garageType' }, multi: true, question: 'What garage does the house have?', hint: 'Pick every one. Detached adds a Detached Garage building.' },
];

export const HOUSE_FACT_GROUPS: readonly { id: HouseFactGroup; label: string }[] = [
  { id: 'property',  label: 'THE PROPERTY' },
  { id: 'utilities', label: 'UTILITIES' },
  { id: 'equipment', label: 'EQUIPMENT TYPES' },
  { id: 'building',  label: 'THE BUILDING' },
];

/** The facts this inspection asks: a spec fact only when its item is in the template (a company that removed its
 *  Fireplace system is never asked what the fireplace is). The extras facts are always asked. */
export function factsFor(hasNode: (nodeId: string, attr: string) => boolean): HouseFact[] {
  // A PAGE ONLY WITH SOMETHING TO ANSWER (owner 2026-11-15, build 854: "This template has no stairs field to answer" on a
  // page with nothing to tap): a spec fact is asked only when the job's item has that field, not merely the item.
  return HOUSE_FACTS.filter(f => f.source.kind === 'extras' || hasNode(f.source.nodeId, f.source.attr));
}

/** The facts asked NOW, with the answers so far: a fact with `askWhen` only while the fact it follows names one of its
 *  words (Backup heat while What heats includes Heat Pump or a Mini-Split). The wizard's pages and the count read this. */
export function factsAsked(facts: readonly HouseFact[], valueOf: (f: HouseFact) => string | null | undefined): HouseFact[] {
  return facts.filter(f => {
    if (!f.askWhen) return true;
    const dep = facts.find(x => x.id === f.askWhen!.fact);
    const v = String((dep ? valueOf(dep) : '') ?? '').toLowerCase();
    return f.askWhen.includesAny.some(w => v.includes(w.toLowerCase()));
  });
}

/** The absence a None records — applicability's NOT_PRESENT, spelled here because this module imports nothing (the guard
 *  checks the two agree). */
export const NONE_ANSWER = 'Not present';
/** How a recorded answer reads on the page: None for the absence, the picks joined with + otherwise. */
export const factDisplay = (v: string): string => v.trim().toLowerCase() === NONE_ANSWER.toLowerCase() ? 'None'
  : v.split(', ').map(x => x.trim()).filter(Boolean).join(' + ');
/** A recorded answer: anything but blank. */
export const isAnswered = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0;

/** How far "Before you start" is: the facts asked, how many are answered, and which are left (in page order). */
export function houseFactsProgress(facts: readonly HouseFact[], valueOf: (f: HouseFact) => string | null | undefined): {
  answered: number; total: number; left: HouseFact[];
} {
  const left = facts.filter(f => !isAnswered(valueOf(f)));
  return { answered: facts.length - left.length, total: facts.length, left };
}

/** The status line under the facts (board 6): what is still to answer, by name. */
export function houseFactsStatus(p: { answered: number; total: number; left: readonly HouseFact[] }): string {
  if (p.total === 0) return 'Nothing to answer for this building.';
  if (p.left.length === 0) return 'All answered. The rest of Scope follows these.';
  if (p.left.length === 1) return `One answer left: ${p.left[0].label}.`;
  const names = p.left.map(f => f.label);
  return `${p.left.length} answers left: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

// ── THE HOUSE FACTS AS RULE INPUTS (phase 2, 2026-11-13) ──────────────────────────────────────────────────────────────
// A rule reads an answer by key. The type facts already ARE spec keys; the Details facts get one each, `house::<fact>`,
// answered from the job's report extras — the same record, never copied into the spec store. A house fact is about the
// main building: in any other building (a Detached Garage, an ADU) these keys are unanswered, so a rule that reads one
// never hides that building's own items.
export const HOUSE_SPEC_KEYS: Readonly<Record<string, 'gasSupply' | 'waterSource' | 'sewerType' | 'garageType' | 'stories' | 'yearBuilt'>> = {
  'house::gas': 'gasSupply', 'house::water': 'waterSource', 'house::sewer': 'sewerType', 'house::garage': 'garageType',
  // 2026-11-15 (#128): how many stories — read by the interior stairs' rule.
  'house::stories': 'stories',
  // x2 (2026-11-14): the job's YEAR BUILT, which the era rules compare (applicability `before` / `from` / `through`). The
  // caller supplies it beside the extras (the inspection record holds it, not the extras).
  'house::built': 'yearBuilt',
};
export const isHouseKey = (key: string): boolean => typeof key === 'string' && key.startsWith('house::');
/** A `house::` key's answer: the extras field it names, only in the main building. Undefined for any other key. */
export function houseSpecValue(extras: Readonly<Record<string, unknown>> | null | undefined, key: string, inMain: boolean): string | undefined {
  const field = HOUSE_SPEC_KEYS[key];
  if (!field || !inMain || !extras) return undefined;
  const v = extras[field];
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);   // the year built
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** The type questions every other item of their system waits for (type first, phase 2): host id → its field. Read by the
 *  report's verdict — a system whose type is unanswered is never Satisfactory (verify:system-verdict). */
export const TYPE_HOST_FIELDS: Readonly<Record<string, string>> = Object.fromEntries(
  // A follow-up (Backup heat) is not a type its system waits for (2026-11-14).
  HOUSE_FACTS.flatMap(f => (f.source.kind === 'spec' && !f.askWhen ? [[f.source.nodeId, f.source.attr]] : [])),
);
