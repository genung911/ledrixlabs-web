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

export type HouseFactGroup = 'utilities' | 'equipment' | 'building';
/** Where a fact already lives: a key of the job's report extras (Details), or a spec field (`node id`, `attribute id`). */
export type HouseFactSource =
  | { kind: 'extras'; key: 'gasSupply' | 'waterSource' | 'sewerType' | 'garageType' }
  | { kind: 'spec'; nodeId: string; attr: string };
/** `none`: the house may have none of it (owner 2026-11-13, build 811: "Fireplace made me realize we need a 'none' option").
 *  A spec fact's None records applicability's NOT_PRESENT ('Not present'), the absence every rule already reads; the
 *  garage's None is one of its Details choices. A foundation is never none. */
/** `question` / `hint`: the wizard's page for this fact (owner 2026-11-13, mockup 79T4… boards 8–10: "a full page for each
 *  one … options larger, easy to read"). `multi`: pick every one that applies. */
export type HouseFact = { id: string; label: string; group: HouseFactGroup; source: HouseFactSource; none?: true; question?: string; hint?: string; multi?: true };

/** The facts, in the page's order (board 6). */
export const HOUSE_FACTS: readonly HouseFact[] = [
  { id: 'gas',          label: 'Gas',          group: 'utilities', source: { kind: 'extras', key: 'gasSupply' }, multi: true, question: 'What gas does the house have?', hint: 'Pick every one. Look for a meter at the side of the house, or a tank in the yard.' },
  { id: 'water',        label: 'Water',        group: 'utilities', source: { kind: 'extras', key: 'waterSource' }, multi: true, question: 'Where does the water come from?', hint: 'Pick every one. A well has a well head and a pressure tank.' },
  { id: 'sewer',        label: 'Sewer',        group: 'utilities', source: { kind: 'extras', key: 'sewerType' }, multi: true, question: 'Where does the sewer go?', hint: 'Pick every one. Septic shows a tank lid or cleanouts in the yard.' },
  { id: 'heats',        label: 'What heats',   group: 'equipment', source: { kind: 'spec', nodeId: 'hvac_heating', attr: 'fuel_source' }, none: true, question: 'What heats the house?', hint: 'Pick every one.', multi: true },
  { id: 'cools',        label: 'What cools',   group: 'equipment', source: { kind: 'spec', nodeId: 'hvac_cooling', attr: 'spec' }, none: true, question: 'What cools the house?', hint: 'Pick every one.', multi: true },
  { id: 'water_heater', label: 'Water heater', group: 'equipment', source: { kind: 'spec', nodeId: 'plumb_wh_type', attr: 'type' }, none: true, question: 'What kind of water heater?', hint: 'The data plate on its side says.' },
  { id: 'fireplace',    label: 'Fireplace',    group: 'equipment', source: { kind: 'spec', nodeId: 'fp_type', attr: 'spec' }, none: true, question: 'Is there a fireplace?', hint: 'Pick its type, or None.' },
  { id: 'foundation',   label: 'Foundation',   group: 'building',  source: { kind: 'spec', nodeId: 'found_type', attr: 'type' }, question: 'What does the house sit on?', hint: 'Pick every one: a basement with a crawlspace addition is two.', multi: true },
  { id: 'garage',       label: 'Garage',       group: 'building',  source: { kind: 'extras', key: 'garageType' }, multi: true, question: 'What garage does the house have?', hint: 'Pick every one. Detached adds a Detached Garage building.' },
];

export const HOUSE_FACT_GROUPS: readonly { id: HouseFactGroup; label: string }[] = [
  { id: 'utilities', label: 'UTILITIES' },
  { id: 'equipment', label: 'EQUIPMENT TYPES' },
  { id: 'building',  label: 'THE BUILDING' },
];

/** The facts this inspection asks: a spec fact only when its item is in the template (a company that removed its
 *  Fireplace system is never asked what the fireplace is). The extras facts are always asked. */
export function factsFor(hasNode: (nodeId: string) => boolean): HouseFact[] {
  return HOUSE_FACTS.filter(f => f.source.kind === 'extras' || hasNode(f.source.nodeId));
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
export const HOUSE_SPEC_KEYS: Readonly<Record<string, 'gasSupply' | 'waterSource' | 'sewerType' | 'garageType'>> = {
  'house::gas': 'gasSupply', 'house::water': 'waterSource', 'house::sewer': 'sewerType', 'house::garage': 'garageType',
};
export const isHouseKey = (key: string): boolean => typeof key === 'string' && key.startsWith('house::');
/** A `house::` key's answer: the extras field it names, only in the main building. Undefined for any other key. */
export function houseSpecValue(extras: Readonly<Record<string, unknown>> | null | undefined, key: string, inMain: boolean): string | undefined {
  const field = HOUSE_SPEC_KEYS[key];
  if (!field || !inMain || !extras) return undefined;
  const v = extras[field];
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** The type questions every other item of their system waits for (type first, phase 2): host id → its field. Read by the
 *  report's verdict — a system whose type is unanswered is never Satisfactory (verify:system-verdict). */
export const TYPE_HOST_FIELDS: Readonly<Record<string, string>> = Object.fromEntries(
  HOUSE_FACTS.flatMap(f => (f.source.kind === 'spec' ? [[f.source.nodeId, f.source.attr]] : [])),
);
