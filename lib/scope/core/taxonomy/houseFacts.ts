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

export type HouseFactGroup = 'visit' | 'property' | 'utilities' | 'equipment' | 'building';
/** Where a fact already lives: a key of the job's report extras (Details), or a spec field (`node id`, `attribute id`). */
export type HouseFactSource =
  | { kind: 'extras'; key: 'gasSupply' | 'waterSource' | 'sewerType' | 'garageType' | 'frontFaces' | 'stories' | 'appliancesAsked' | 'weather' | 'occupancy' | 'waterState' }
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
  // THIS VISIT (owner 2026-11-18, Batch A mockup Eo3mgxTzVWDiN2J4hdQpA8: "Maybe they all need to move to the questions"):
  // the weather, who is living there, and the utilities on today were Pre-Inspect's Conditions tile. Their group follows
  // the utilities (HOUSE_FACT_GROUPS), so the pages run Front faces · Gas · Water · Sewer · Weather · Occupancy · Utilities on. Each page draws Pre-Inspect's own panel section
  // (BeforeYouStart), the same record; `utilities_on` is answered when every utility shown has an answer
  // (utilitiesOnValue) — gas only when the house has gas.
  { id: 'weather',      label: 'Weather',      group: 'visit',     source: { kind: 'extras', key: 'weather' }, question: 'What’s the weather?', hint: 'Ledrix fills this from the forecast. Change anything that’s wrong.' },
  { id: 'occupancy',    label: 'Occupancy',    group: 'visit',     source: { kind: 'extras', key: 'occupancy' }, question: 'Is anyone living there?', hint: 'And who came to the inspection, if anyone.' },
  { id: 'utilities_on', label: 'Utilities on', group: 'visit',     source: { kind: 'extras', key: 'waterState' }, question: 'Are the utilities on?', hint: 'Off takes what needs it off the checklist, marked not tested.' },
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
  // After the supplies, so "Are the utilities on?" follows "what does it have" (2026-11-18); Front faces stays first.
  { id: 'visit',     label: 'THIS VISIT' },
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

/** THE UTILITIES-ON PAGE AS ONE ANSWER (2026-11-18): water and power, and gas when the house has gas (or its gas is not
 *  answered yet) — blank until each of those is answered, so the page counts as owed until then. */
export function utilitiesOnValue(x: Readonly<Record<string, unknown>> | null | undefined): string {
  const v = (k: string) => String((x as any)?.[k] ?? '').trim();
  const gas = v('gasSupply'), hasGas = !gas || /natural gas|propane/i.test(gas);
  const rows: [string, string][] = [['Water', v('waterState')], ...(hasGas ? [['Gas', v('gasState')] as [string, string]] : []), ['Power', v('powerState')]];
  if (rows.some(([, s]) => !s)) return '';
  return rows.map(([k, s]) => `${k} ${/^off\b/i.test(s) ? 'off' : s.toLowerCase()}`).join(' · ');
}

/** The absence a None records — applicability's NOT_PRESENT, spelled here because this module imports nothing (the guard
 *  checks the two agree). */
export const NONE_ANSWER = 'Not present';
/** How a recorded answer reads on the page: None for the absence, the picks joined with + otherwise. */
export const factDisplay = (v: string): string => v.trim().toLowerCase() === NONE_ANSWER.toLowerCase() ? 'None'
  : v.split(', ').map(x => x.trim()).filter(Boolean).join(' + ');
/** A recorded answer: anything but blank. */
export const isAnswered = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0;

/** THE APPLIANCES PAGE AS AN ANSWER (owner 2026-11-18, mockup VMxF6WCSZi4Wxapz9Cyuqc approved): its tiles open blank, so
 *  the page is owed until answered. An appliance that is here leaves its row empty, so the rows cannot tell "all here"
 *  from "not answered": Continue on the page stamps `appliancesAsked` in this visit's extras (its own server column,
 *  #134 `appliances_asked`; the Not present marks on the rows sync as before). It counts in the progress, never as a page of its own —
 *  Before you start draws that page itself. */
export const APPLIANCES_FACT: HouseFact = { id: 'appliances', label: 'Appliances', group: 'equipment', source: { kind: 'extras', key: 'appliancesAsked' } };
/** The facts in the pages' order — by group, the appliances page closing the equipment group when the template has
 *  appliances — so the first one left is the page Before you start opens on. */
export function withAppliancesFact(facts: readonly HouseFact[], hasAppliances: boolean): HouseFact[] {
  return HOUSE_FACT_GROUPS.flatMap(g => [...facts.filter(f => f.group === g.id), ...(g.id === 'equipment' && hasAppliances ? [APPLIANCES_FACT] : [])]);
}

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

/** THE GARAGE SPACE FOLLOWS THE GARAGE ANSWER (owner 2026-11-14, test run x15: "the Main Structure still shows the Garage
 *  space tile though the garage is a Detached Garage building"). The main building's Garage space is for a garage AT the
 *  house — Attached, or a Carport (its slab still applies). Answered with neither (Detached only, None), it is not shown;
 *  unanswered, it shows (Rule 2). Its outlets, lighting and walls rows carry no garage rule, so counting its items could
 *  never hide it. */
export const GARAGE_SPACE_ID = 'space_garage';
export function garageSpaceHere(garage: string | null | undefined): boolean {
  const picks = String(garage ?? '').split(',').map(x => x.trim()).filter(Boolean);
  return picks.length === 0 || picks.some(p => p === 'Attached' || p === 'Carport');
}

/** The type questions every other item of their system waits for (type first, phase 2): host id → its field. Read by the
 *  report's verdict — a system whose type is unanswered is never Satisfactory (verify:system-verdict). */
export const TYPE_HOST_FIELDS: Readonly<Record<string, string>> = Object.fromEntries(
  // A follow-up (Backup heat) is not a type its system waits for (2026-11-14).
  HOUSE_FACTS.flatMap(f => (f.source.kind === 'spec' && !f.askWhen ? [[f.source.nodeId, f.source.attr]] : [])),
);

// ── REOPENING BEFORE YOU START (owner 2026-11-19, mockup PcYvQNowcapaYVAuuAyUED: "When I reopen a report to work on, I
// shouldn't get the questions I already answered… if they are unanswered, we should get those cards and answer later
// if needed"; all answered → "a list like the review page… if something needs to be updated, they click on that line").
// Pure: which page comes next. Pages are 0..total-1; `total` is the list ("This house has").
export type SetupNav = {
  /** The open pages to walk (indices, in order) — a reopen; null walks every page in order (the first time through). */
  queue: number[] | null;
  /** One page, opened from the list (or a page already answered): Continue and Back return to the list. */
  single: boolean;
  /** The list is home: Back on it closes. */
  list: boolean;
};
/** Where Before you start opens. `owed[i]` — page i still needs an answer; `firstWalk` — nothing much answered yet. */
export function setupOpen(owed: readonly boolean[], startIdx: number, atFinish: boolean, firstWalk: boolean): { step: number; nav: SetupNav } {
  const total = owed.length;
  const open = owed.map((o, i) => (o ? i : -1)).filter(i => i >= 0);
  // Nothing open → the list. Asked for the list with a page still open (the appliances page, Ledrix's weather — the
  // tile's count leaves them out) → that page's card first.
  if (!open.length && (atFinish || startIdx < 0)) return { step: total, nav: { queue: null, single: false, list: true } };
  const at = startIdx >= 0 && !atFinish ? startIdx : open[0];
  if (!owed[at]) return { step: at, nav: { queue: null, single: true, list: true } };
  if (firstWalk) return { step: at, nav: { queue: null, single: false, list: false } };
  return { step: at, nav: { queue: open, single: false, list: false } };
}
export function setupNext(nav: SetupNav, step: number, total: number): number {
  if (nav.single) return total;
  if (nav.queue) return nav.queue.find(i => i > step) ?? total;
  return Math.min(total, step + 1);
}
/** Back: a page index, or 'close'. */
export function setupBack(nav: SetupNav, step: number, total: number): number | 'close' {
  if (step >= total) return nav.list || nav.queue ? 'close' : Math.max(0, total - 1);
  if (nav.single) return total;
  if (nav.queue) { const prev = [...nav.queue].reverse().find(i => i < step); return prev ?? 'close'; }
  return step === 0 ? 'close' : step - 1;
}
