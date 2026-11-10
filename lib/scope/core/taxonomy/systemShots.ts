// ─── systemShots — the photos each system asks for, and how one is read (owner 2026-11-08) ────────────────────────
//
// Owner: "Can the first tile in each section be the 'photos needed' for that system… This 'suggest' the details possible
// from the photos and inspector confirms and assesses condition" · "I'm taking the photos, why do I have to do the data
// entry as well when it's right there on the photos. I should just be approving and adding findings and limitations or
// the obscure details/info." Mockup https://claude.ai/artifact/FQKuft3zPAjVMUVU55DNEq → "this was my original vision",
// then "build it all". Shot lists come from the owner's own photo test (Heating, Electrical, Water Heater ×2 houses;
// Roofing, Exterior, Plumbing, Crawlspace ×1) and Cooling (owner's typical set 2026-11-09: outdoor unit, plate, disconnect,
// return and supply readings; "drain can go with furnace since it's on that side anyway", the indoor coil is the
// company's call, the thermostat stays in Heating), Attic, Fireplace and Interior (owner's sets 2026-11-09: attic view,
// decking, insulation depth, access, bath fan duct · fireplace view, firebox / glass front, controls with the lower cover
// off, chimney or vent · room views, kitchen, bathrooms, stairs, windows), Appliances (owner 2026-11-09: range & hood,
// appliance tags — optional — and the dryer hookup, "a normal shot we try to take").
// `cooling:indoor` (the retired coil & drain shot) is not reused.
//
// PURE — no React, no store, no network. The service (services/systemPhotos.ts) takes the photo, calls the model and
// writes; everything that decides WHAT the model may answer, and whether an answer is allowed, lives here so a guard can
// run it (verify:system-photos).
//
// THE TEMPLATE DECIDES WHAT LEDRIX MAY FIND (owner's ruling). The read is handed only this inspection's OPEN Details
// questions (whatsHere — the same list Pre-Inspect asks) with their authored choices; an answer must be one of those
// choices exactly, or "can't tell". A finding Ledrix notices must be one of the item's own quick findings
// (findingIntents). A reading must name a reading slot the shot carries. Anything else is dropped here, before it is
// written — the model's words never reach a record unchecked.
//
// SHOT IDS ARE PERMANENT. `${systemBaseId}:${shot.id}` is the photo's ROLE (photoSlots.ts rule): renaming one orphans
// every photo already taken under it.

import { formatSizeEntry, parseSizeEntry } from './filterSize';
import { specPredicateHolds } from './applicability';
export type Shot = {
  /** Permanent role within its system. Never rename. */
  id: string;
  /** What to point the camera at. */
  label: string;
  /** Where to find it / how to frame it, in plain words. */
  hint: string;
  /** Also read the printed label as a DATA PLATE (DataPlateService.ingestDataPlate — make, model, serial, year). */
  plate?: string;
  /** The shot shows an instrument's display: the reading slot (measurementPoints.json) it may propose. */
  reading?: { system: string; point: string;
    /** What else counts as this reading, told to the reader and the checker (owner 2026-11-09, of a thermostat's indoor
     *  temperature placed as the return-air reading: "I would accept that for a return air reading"). */
    accepts?: string };
  /** A shot a house has SEVERAL of (owner 2026-11-08: "a way to add another bathroom and label them… when one is taken,
   *  the blank tile populates again, but says next bathroom"). Each photo is its own square, named `base n` until the
   *  inspector renames it (the name is the photo's room); `next` is the empty square that follows. */
  repeat?: { base: string; next: string };
  /** Small print — a label, a directory, a printed size — read by the strong model (photoReaderSettings.strongShots). A
   *  plate or reading shot is small print too (smallPrintShot). */
  smallPrint?: true;
  /** A shot the inspector takes when they want it (owner 2026-11-09: appliance "ID tags make those optional"). It never
   *  counts as missing: the tile's "N shots · M taken" counts only the others. */
  optional?: true;
};

/** Systems by template base id. A system with no entry has no Photos tile. */
export const SYSTEM_SHOTS: Record<string, readonly Shot[]> = {
  heating: [
    { id: 'furnace_wide', label: 'Furnace wide', hint: 'The whole unit, with the pipes leaving it and the ductwork attached.' },
    { id: 'plate', label: 'Data plate', hint: 'The rating label, close enough to read every line.', plate: 'Furnace / heating unit' },
    { id: 'filter', label: 'Filter edge', hint: 'Slide the filter out: the printed rim (size, MERV) and where it goes.', smallPrint: true },
    { id: 'condensate', label: 'Condensate drain', hint: 'Where the condensate line leaves the coil or furnace: the pipe, a pump if there is one, and where it runs.' },
    { id: 'thermostat', label: 'Thermostat', hint: 'The thermostat on the wall, face on.' },
  ],
  cooling: [
    { id: 'condenser_wide', label: 'Outdoor unit', hint: 'The whole condenser or heat pump, with its disconnect if it is in view.' },
    { id: 'plate', label: 'Data plate', hint: 'The outdoor unit\'s rating label, close enough to read.', plate: 'AC condenser / heat pump' },
    { id: 'disconnect', label: 'Disconnect, cover open', hint: 'The disconnect at the outdoor unit with its cover open: the switch, any fuses or breaker, and its label.' },
    { id: 'return_air', label: 'Return air reading', hint: 'The thermometer\'s display at the return grille — or the thermostat\'s indoor temperature — with the system running in cooling.', reading: { system: 'cooling', point: 'return_air', accepts: 'a thermometer at the return grille, or the thermostat\'s indoor temperature display' } },
    { id: 'supply_air', label: 'Supply register reading', hint: 'The thermometer\'s display at a supply register, with the system running in cooling.', reading: { system: 'cooling', point: 'supply_register' } },
  ],
  water_heater: [
    { id: 'wh_wide', label: 'Water heater wide', hint: 'Top to floor, with what surrounds it: pan, expansion tank, straps.' },
    { id: 'plate', label: 'Data plate', hint: 'The rating label: fuel, gallons, BTU and the date.', plate: 'Water heater' },
    { id: 'vent_top', label: 'Vent at the top', hint: 'Close on the vent where it leaves the unit — the stamp on the pipe if there is one.' },
    { id: 'hot_water', label: 'Hot water reading', hint: 'The thermometer\'s display at a faucet, hot side, after it has run.', reading: { system: 'water_heater', point: 'hot_water_temp' } },
  ],
  electrical: [
    { id: 'service', label: 'Service drop & meter', hint: 'Where the wires reach the house, the meter, and the conduit or mast.' },
    { id: 'panel_label', label: 'Panel, door open', hint: 'The panel with its door open: the label and the circuit directory.', repeat: { base: 'Panel', next: 'Next panel' }, smallPrint: true },
    { id: 'panel_open', label: 'Panel, cover off', hint: 'The wiring with the cover off, wide enough to show the room.', repeat: { base: 'Panel, cover off', next: 'Next panel, cover off' } },
    { id: 'grounding', label: 'Grounding electrode', hint: 'The ground rod clamp, or the clamp on the water pipe.' },
  ],
  plumbing: [
    { id: 'under_sink', label: 'Under the kitchen sink', hint: 'The supply lines and the drain, with the cabinet doors open.' },
    { id: 'main_shutoff', label: 'Main shutoff', hint: 'The main water valve and the pipe it sits on.' },
    { id: 'drain_line', label: 'A drain line', hint: 'Where the printed markings show (ABS, PVC, cast iron).' },
    { id: 'gas_meter', label: 'Gas meter & piping', hint: 'The meter and the pipe or connector leaving it.' },
  ],
  roofing: [
    { id: 'roof', label: 'Roof plane', hint: 'A roof plane, from the ladder, the ground or a drone.', repeat: { base: 'Roof plane', next: 'Next roof plane' } },
    { id: 'roof_edge', label: 'Roof edge at an eave', hint: 'Close on the edge: the layers of shingle and the drip edge.' },
    { id: 'gutters', label: 'Gutter & downspout', hint: 'A gutter run and where a downspout comes down.' },
  ],
  exterior: [
    { id: 'front', label: 'Front of the house', hint: 'The whole front: siding, walkway, porch, windows.' },
    { id: 'back', label: 'Back of the house', hint: 'The whole back, with the deck or patio.' },
    { id: 'side', label: 'Side of the house', hint: 'A whole side, from the ground.', repeat: { base: 'Side', next: 'Next side' } },
    { id: 'siding_close', label: 'Siding up close', hint: 'A cut end or bottom edge of the siding — it tells the material apart.' },
  ],
  foundation: [
    { id: 'crawl_wide', label: 'Crawlspace or basement wide', hint: 'From the hatch or stairs: floor framing, walls and the ground.' },
    { id: 'wall_close', label: 'Foundation wall', hint: 'A wall up close — poured, block or stone.' },
    { id: 'insulation', label: 'Under-floor insulation', hint: 'The insulation between the floor joists.' },
  ],
  attic: [
    { id: 'attic_wide', label: 'Attic view', hint: 'Wide, from the hatch or inside: framing, sheathing, insulation, vents and any ductwork.', repeat: { base: 'Attic view', next: 'Next view' } },
    { id: 'decking', label: 'Decking close-up', hint: 'Close on the roof sheathing between the rafters: the APA stamp if one shows, or a sheet edge.' },
    { id: 'insulation_depth', label: 'Insulation depth', hint: 'A ruler standing in the insulation.' },
    { id: 'attic_access', label: 'Attic access', hint: 'The hatch or pull-down stair.' },
    { id: 'fan_duct', label: 'Bath fan duct', hint: 'A bath or kitchen fan duct, and where it ends: the roof, the soffit, or loose in the attic.' },
  ],
  interior: [
    { id: 'room_view', label: 'Room view', hint: 'Wide, from a doorway: the floor, walls, ceiling and windows.', repeat: { base: 'Room', next: 'Next room' } },
    { id: 'kitchen', label: 'Kitchen', hint: 'Close enough to read the counter surface, with the floor, cabinets and window.' },
    { id: 'bathroom', label: 'Bathroom', hint: 'Wide: the tub or shower, the counter, the floor, the fan.', repeat: { base: 'Bathroom', next: 'Next bathroom' } },
    { id: 'stairs', label: 'Stairs & railings', hint: 'The stair from the bottom: treads, the handrail, and the guard or balusters.' },
    { id: 'window_close', label: 'A window up close', hint: 'The frame and glass, where the label or spacer shows.', repeat: { base: 'Window', next: 'Next window' } },
  ],
  fireplace: [
    { id: 'fp_wide', label: 'Fireplace view', hint: 'The whole fireplace and its surround, with the hearth in front.' },
    { id: 'firebox', label: 'Firebox / glass front', hint: 'Close on the firebox: through the glass on a sealed unit, doors open on an open one.' },
    { id: 'controls', label: 'Controls, lower cover off', hint: 'With the lower louver off: the gas valve, the controls and the rating label behind it.' },
    { id: 'chimney', label: 'Chimney or vent on the roof', hint: 'The chimney or vent cap where it leaves the roof or wall.' },
  ],
  appliances: [
    { id: 'range', label: 'Range & hood', hint: 'The cooktop and the hood above it — the burners or glass top, and the hood\'s filter or vent.' },
    { id: 'tag', label: 'Appliance tag', hint: 'The rating label: inside the door, on the frame, or under the cooktop — make, model, serial and the date.', repeat: { base: 'Tag', next: 'Next tag' }, optional: true, smallPrint: true },
    { id: 'dryer', label: 'Dryer hookup', hint: 'Behind the dryer: the outlet (240V) or the gas line and its shutoff, and where the vent leaves.' },
  ],
};

const baseOf = (id: string) => String(id).split('~')[0];
export const shotsFor = (systemId: string): readonly Shot[] => SYSTEM_SHOTS[baseOf(systemId)] ?? [];
/** A shot whose value is in small print — a plate, a display, a printed size or label. */
export const smallPrintShot = (s: Shot | undefined): boolean => !!s && !!(s.plate || s.reading || s.smallPrint);

// ── A SECTION'S OWN PHOTOS (owner 2026-11-09, mockup 4Xkqk9mTKEPu7dJd5Wf8ZA approved) ─────────────────────────────────
// "I'd be going inside there, and I'd start taking my general photos throughout there, and all those would be stored inside
// that attic section, and Ledrix would pull all that kind of general information." A general photo has the role
// `${system}:general` — never a square — and is read like a shot. It is not counted in "N shots · M taken".
export const GENERAL_SHOT_ID = 'general';
export const generalShot = (systemLabel: string): Shot => ({
  id: GENERAL_SHOT_ID, label: `${systemLabel} photo`,
  hint: 'A photo taken in this section — read for this section, and for anything else it plainly shows.',
});
/** The shot a role names: a listed shot, or the section's general photo. */
export const shotOf = (systemId: string, shotId: string, systemLabel = 'Section'): Shot | undefined =>
  shotsFor(systemId).find(s => s.id === shotId) ?? (shotId === GENERAL_SHOT_ID && SYSTEM_SHOTS[baseOf(systemId)] ? generalShot(systemLabel) : undefined);
/** Every role a photo holds — its own and the others it was used for (one photo can fill several shots). */
export const rolesOf = (e: { shot?: string; alsoShots?: readonly string[] } | null | undefined): string[] =>
  [...(e?.shot ? [e.shot] : []), ...(e?.alsoShots ?? [])];

// ── ANOTHER TRADE'S ITEMS A SPACE'S PHOTOS MAY SHOW (owner 2026-11-09) ──────────────────────────────────────────────────
// "It goes in electrical. That's how a homeowner would think about it… It's an electrician repair." A photo taken in the
// attic may notice one of THESE items' quick findings too, and the finding files under that item's own system, observed in
// the space. Closed lists, so the read stays closed: `x_*` is every condition card whose id starts `x_`.
export const CROSS_TRADE: Readonly<Record<string, readonly string[]>> = {
  attic: ['elec_wir_*', 'hvac_distribution', 'hvac_flue', 'plumb_vent', 'plumb_wh_flue', 'roof_sheath'],
  foundation: ['elec_wir_*', 'plumb_sup_*', 'plumb_dwv_*', 'plumb_gas', 'hvac_distribution'],
};
export const crossTradeMatch = (systemId: string, nodeId: string): boolean =>
  (CROSS_TRADE[baseOf(systemId)] ?? []).some(p => (p.endsWith('*') ? baseOf(nodeId).startsWith(p.slice(0, -1)) : baseOf(nodeId) === p));
/** The photo's role, stored on the evidence item: `heating:plate`. */
export const shotRole = (systemId: string, shotId: string) => `${baseOf(systemId)}:${shotId}`;

// ── THE READ ────────────────────────────────────────────────────────────────────────────────────────────────────

/** An open Details question offered to the read: `node|attr`, its words, its authored choices. */
/** `dimensions` (Filter › Size): any size read off the photo is a proposal, in the stored "20x20x1" form — not only the
 *  listed common sizes. */
/** `when` (2026-11-09): a FOLLOW-UP asked in the same read as the question it waits on — Refrigerant waits on the AC
 *  type, and the outdoor unit and its plate are read before anyone confirms that. Its answer is kept only when THIS read
 *  answers each parent so that the follow-up's own predicate holds (the one predicate rule, specPredicateHolds). */
export type ShotCondition = { key: string; includes?: readonly string[]; unlisted?: readonly string[]; exact?: true };
/** `collects` (2026-11-09): a WHOLE-HOUSE field one house holds several values of — carpet in the bedrooms, tile in the
 *  bath, hardwood in the living room. It stays asked after its first answer; `have` is what it already holds (confirmed,
 *  or proposed by an earlier photo), and the read may only ADD a value not in it, one answer per value. */
export type ShotQuestion = { key: string; system: string; label: string; choices: readonly string[]; dimensions?: boolean; when?: readonly ShotCondition[]; collects?: { have: readonly string[] } };

/** The whole-house fields (`node|attr`). Owner 2026-11-09, on the interior set: one bedroom photo must not close Floors
 *  for the living room's hardwood. Insulation is here for the attic (blown fill on the floor, foam on the kneewalls). */
export const COLLECTING_FIELDS: ReadonlySet<string> = new Set([
  'int_flooring|spec', 'int_walls|spec', 'kit_counter|spec', 'attic_instype|type', 'ext_siding|spec',
  // A house with two returns has two filter sizes (owner's test 2026-11-09: 20x20x1 and 14x14x1).
  'hvac_filter|size',
]);
/** A condition item of the shot's system and its own quick findings (findingIntents with a controlled id). */
export type ShotItem = { nodeId: string; label: string; intents: readonly { id: string; label: string }[];
  /** Another trade's item (CROSS_TRADE): the system it files under. */
  systemId?: string; systemLabel?: string };
export type ShotContext = {
  systemLabel: string;
  shot: Shot;
  /** This system's open questions first; then other systems' (a photo can show them too). */
  questions: readonly ShotQuestion[];
  systemId: string;
  items: readonly ShotItem[];
  /** Another trade's items this space's photo may show (CROSS_TRADE) — noticed only when plainly visible. */
  otherItems?: readonly ShotItem[];
  /** THE HELPFUL SHOTS a section photo may BE (owner 2026-11-09: "Ledrix should place those photos in the proper spot if
   *  it can, high confidence"). Only on a section photo; the read names one only when the photo plainly IS that shot. */
  placeable?: readonly { id: string; label: string; hint: string }[];
  /** The reading slot this shot carries, with the units it may be in. */
  reading?: { point: string; label: string; units: readonly string[]; accepts?: string } | null;
  /** What the inspector named this photo (a repeating shot's room: "Hall bath"), if anything. */
  place?: string | null;
};

export const MAX_NOTICED = 2;

/** A quick finding a still photo can show (owner's test 2026-11-09: "Not cooling — low temperature split" noticed on a
 *  photo of an outdoor unit). An `inoperable` finding — not cooling, a pilot that does not light, an alarm that did not
 *  sound — is found by running the equipment, never in a photo. */
export const seenInAPhoto = (intentId: string): boolean => intentId !== 'inoperable';
/** A notice must say what it sees: a note that only restates the finding's name (or is too short to describe anything)
 *  is no observation (the same test: both notes were the finding's own title, word for word). */
export const describesSomething = (note: string, intentLabel: string): boolean => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return n(note).length >= 12 && n(note) !== n(intentLabel) && !n(intentLabel).includes(n(note));
};

/** THE GUARDS (owner 2026-11-09: "Are we able to prevent those made up answers?… Let's run that test"). Off unless the
 *  photo reader's `guards` switch is on (services/photoReaderSettings): every answer carries what was SEEN and where, the
 *  choices come in a shuffled order (gpt-4o-mini gave the first listed size, 16x25x1, on three photos), a check pass keeps
 *  only what it confirms, and the quick look narrows the questions. */
export type ReadGuards = { guards?: boolean; rand?: () => number };
const shuffled = <T,>(xs: readonly T[], rand: () => number): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export function buildShotPrompt(ctx: ShotContext, g: ReadGuards = {}): { system: string; user: string } {
  const order = (cs: readonly string[]) => (g.guards ? shuffled(cs, g.rand ?? Math.random) : cs);
  const own = ctx.questions.filter(q => q.system === ctx.systemId);
  const other = ctx.questions.filter(q => q.system !== ctx.systemId);
  const cond = (x: ShotQuestion) => (x.when?.length
    ? ` (only if you answer ${x.when.map(w => `${w.key} as ${(w.includes ?? []).map(c => JSON.stringify(c)).join(' or ')}`).join(' and ')})`
    : '');
  const gather = (x: ShotQuestion) => (x.collects
    ? ` (a house has several — one answer for EACH one this photo shows${x.collects.have.length ? `; already recorded: ${x.collects.have.map(h => JSON.stringify(h)).join(', ')} — answer only others` : ''})`
    : '');
  const q = (x: ShotQuestion) => x.dimensions
    ? `- ${x.key} — ${x.label}${gather(x)}: the size printed on it — often along the frame, sideways or upside down — as WIDTHxHEIGHTxDEPTH in inches (e.g. "16x25x1")`
    : `- ${x.key} — ${x.label}${cond(x)}${gather(x)}: ${order(x.choices).map(c => JSON.stringify(c)).join(' | ')}`;
  const system =
    'You read ONE photo a licensed home inspector took, and fill in a form from what the photo SHOWS. You never guess.\n' +
    'Rules:\n' +
    '1. For each question, answer ONLY with one of its listed choices, copied exactly, and only when the photo shows it ' +
    'plainly — printed text (a data plate, a pipe stamp, a label; read it in any orientation, sideways or upside down) or an ' +
    'unmistakable look. Otherwise leave it out, or put it ' +
    'in cant_tell with the photo that WOULD settle it (under 60 characters).\n' +
    '2. Never answer an age from how something looks. Only from a printed date.\n' +
    '3. "noticed": at most ' + MAX_NOTICED + ' problems that are CLEARLY visible, each one of the listed quick findings for ' +
    'one listed item, with a short plain note of WHAT you see and WHERE (not the finding\'s name again). Most photos have ' +
    'none — return an empty list.\n' +
    '4. "reading": only if a reading slot is listed and an instrument\'s display is legible: the number and unit shown.\n' +
    '5. "shot": only if helpful shots are listed — the one this photo plainly IS (a legible data plate is the "plate"), ' +
    'else null. Never a shot it merely shows part of.\n' +
    (g.guards
      ? '6. EVERY answer needs "seen": the exact text you read, or what you see and WHERE in the photo (e.g. "20X20X1 printed ' +
        'on the filter frame, top edge"). No "seen", no answer. The order of the choices means nothing.\n' +
        'Return JSON: {"answers":[{"key":"…","value":"…","seen":"…"}],"cant_tell":[{"key":"…","need":"…"}],'
      : 'Return JSON: {"answers":[{"key":"…","value":"…"}],"cant_tell":[{"key":"…","need":"…"}],') +
    '"noticed":[{"node":"…","finding":"…","note":"…"}],"reading":{"value":0,"unit":"…"}|null,"shot":"…"|null}';
  const user =
    `Photo: "${ctx.shot.label}" for ${ctx.systemLabel}${ctx.place ? ` — the inspector named it "${ctx.place}"` : ''}. ${ctx.shot.hint}\n\n` +
    `Questions for ${ctx.systemLabel}:\n${own.length ? own.map(q).join('\n') : '(none open)'}\n` +
    (other.length ? `\nOther systems' questions — answer only if this photo plainly shows them:\n${other.map(q).join('\n')}\n` : '') +
    (ctx.items.length ? `\nItems and their quick findings (for "noticed"):\n${ctx.items.map(i => `- ${i.nodeId} — ${i.label}: ${i.intents.map(t => `${t.id} (${t.label})`).join(', ')}`).join('\n')}\n` : '') +
    (ctx.otherItems?.length ? `\nOther trades' items this space can show (for "noticed" too, only if plainly visible):\n${ctx.otherItems.map(i => `- ${i.nodeId} — ${i.systemLabel ?? ''} › ${i.label}: ${i.intents.map(t => `${t.id} (${t.label})`).join(', ')}`).join('\n')}\n` : '') +
    (ctx.reading ? `\nReading slot: ${ctx.reading.label}, in ${ctx.reading.units.join(' or ')}${ctx.reading.accepts ? ` — ${ctx.reading.accepts}` : ''}.\n` : '') +
    (ctx.placeable?.length ? `\nHelpful shots (for "shot"):\n${ctx.placeable.map(p => `- ${p.id} — ${p.label}: ${p.hint}`).join('\n')}\n` : '');
  return { system, user };
}

export type ShotRead = {
  /** The helpful shot this photo plainly is (a section photo only; one of ctx.placeable), else null. */
  shot?: string | null;
  /** `seen` — with the guards, what in the photo shows it and where. */
  answers: { key: string; value: string; seen?: string }[];
  cantTell: { key: string; need: string }[];
  noticed: { nodeId: string; intentId: string; intentLabel: string; note: string; systemId?: string }[];
  reading: { point: string; value: number; unit: string } | null;
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Keep only what the template allows. The model's answer is a proposal; this decides whether it may even be one. */
/** Evidence that says something: a few words, and not just the answer again. */
export const seenSays = (seen: unknown, value: string): boolean => {
  const n = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return n(seen).length >= 12 && n(seen) !== n(value);
};
export function validateShotRead(raw: any, ctx: ShotContext, g: ReadGuards = {}): ShotRead {
  const byKey = new Map(ctx.questions.map(q => [q.key, q]));
  const answers: ShotRead['answers'] = [];
  const seen = new Set<string>();
  const slot = (q: ShotQuestion, v: string) => (q.collects ? `${q.key}=${norm(v)}` : q.key);
  for (const a of Array.isArray(raw?.answers) ? raw.answers : []) {
    const q = byKey.get(String(a?.key ?? ''));
    if (!q) continue;
    const size = q.dimensions ? parseSizeEntry(String(a?.value ?? '')) : null;
    const hit = size ? formatSizeEntry(size) : q.choices.find(c => norm(c) === norm(a?.value));
    if (!hit) continue;   // never a value the template does not offer (a size field takes any real size)
    if (g.guards && !seenSays(a?.seen, hit)) continue;   // the guards: no evidence, no answer
    // One answer per question — or, on a whole-house field, one per value it does not already hold.
    if (seen.has(slot(q, hit)) || q.collects?.have.some(h => norm(h) === norm(hit))) continue;
    seen.add(slot(q, hit));
    answers.push({ key: q.key, value: hit, ...(g.guards ? { seen: String(a.seen).trim().slice(0, 160) } : {}) });
  }
  // A same-read follow-up stands only on this read's own answer to what it waits on (a whole-house field's values together).
  const got = new Map<string, string>();
  for (const a of answers) got.set(a.key, got.has(a.key) ? `${got.get(a.key)}, ${a.value}` : a.value);
  // UNANSWERED IS IGNORED (2026-11-09, the owner's guarded runs: both filter sizes dropped because the filter photo could
  // not also say "forced air", and the furnace photos had not finished reading). A follow-up falls only when THIS read
  // answers its parent with a value that rules it out — the applicability engine's own Rule 2.
  const stands = (q: ShotQuestion | undefined) => !!q && (q.when ?? []).every(w => { const v = got.get(w.key); return !v || specPredicateHolds(v, w); });
  for (let i = answers.length - 1; i >= 0; i--) if (!stands(byKey.get(answers[i].key))) answers.splice(i, 1);
  const answeredKeys = new Set(answers.map(a => a.key));
  const cantTell: ShotRead['cantTell'] = [];
  for (const c of Array.isArray(raw?.cant_tell) ? raw.cant_tell : []) {
    const q = byKey.get(String(c?.key ?? ''));
    if (!q || q.system !== ctx.systemId || answeredKeys.has(q.key) || q.collects?.have.length || !stands(q) || cantTell.some(x => x.key === q.key)) continue;
    const need = String(c?.need ?? '').trim().slice(0, 80);
    cantTell.push({ key: q.key, need });
  }
  const noticed: ShotRead['noticed'] = [];
  for (const n of Array.isArray(raw?.noticed) ? raw.noticed : []) {
    if (noticed.length >= MAX_NOTICED) break;
    const item = ctx.items.find(i => i.nodeId === String(n?.node ?? '')) ?? ctx.otherItems?.find(i => i.nodeId === String(n?.node ?? ''));
    const intent = item?.intents.find(t => t.id === String(n?.finding ?? '') || norm(t.label) === norm(n?.finding));
    const note = String(n?.note ?? '').trim().slice(0, 160);
    if (!item || !intent || !note || !seenInAPhoto(intent.id) || !describesSomething(note, intent.label)
      || noticed.some(x => x.nodeId === item.nodeId && x.intentId === intent.id)) continue;
    noticed.push({ nodeId: item.nodeId, intentId: intent.id, intentLabel: intent.label, note, ...(item.systemId ? { systemId: item.systemId } : {}) });
  }
  let reading: ShotRead['reading'] = null;
  const rv = raw?.reading;
  if (ctx.reading && rv && Number.isFinite(Number(rv.value))) {
    const unit = ctx.reading.units.find(u => norm(u) === norm(rv.unit) || norm(u).replace('°', '') === norm(rv.unit).replace('°', '').replace('deg', '').trim());
    if (unit) reading = { point: ctx.reading.point, value: Math.round(Number(rv.value) * 10) / 10, unit };
  }
  const placed = String(raw?.shot ?? '').trim();
  const shot = ctx.placeable?.some(p => p.id === placed) ? placed : null;
  return { answers, cantTell, noticed, reading, shot };
}

// ── THE CHECK PASS (the guards) ── a second look at the same photo with what the read proposed: is each one PLAINLY
// visible? Only a "yes" survives — an answer, a notice or a reading the check does not confirm is dropped.
export function buildCheckPrompt(read: ShotRead, ctx: ShotContext): { system: string; user: string } | null {
  const lines = [
    ...read.answers.map((a, i) => `a${i} — ${ctx.questions.find(q => q.key === a.key)?.label ?? a.key}: "${a.value}"${a.seen ? ` (seen: ${a.seen})` : ''}`),
    ...read.noticed.map((n, i) => `n${i} — a problem: ${n.intentLabel} (${n.note})`),
    ...(read.reading ? [`r0 — ${ctx.reading ? `the ${ctx.reading.label} reading` : 'an instrument display reading'}: ${read.reading.value} ${read.reading.unit}${ctx.reading?.accepts ? ` (counts: ${ctx.reading.accepts})` : ''}`] : []),
    // THE PLACEMENT IS CHECKED TOO (2026-11-09: a placement was the one thing the checker never saw).
    ...(read.shot ? (() => { const p = ctx.placeable?.find(x => x.id === read.shot); return p ? [`s0 — this photo IS the "${p.label}" shot: ${p.hint}`] : []; })() : []),
  ];
  if (!lines.length) return null;
  return {
    system: 'You check a form someone filled in from ONE photo. For each line, answer true only if the photo PLAINLY shows ' +
      'it — the printed text is legible, or the thing is unmistakably there. A guess, an assumption or "probably" is false.\n' +
      'Return JSON: {"<id>": true|false, …} for every id.',
    user: `Photo: ${ctx.shot.label} (${ctx.systemLabel}).\nLines:\n${lines.join('\n')}`,
  };
}
export function applyCheck(read: ShotRead, raw: any): ShotRead {
  const yes = (id: string) => raw?.[id] === true;
  return {
    ...read,
    answers: read.answers.filter((_, i) => yes(`a${i}`)),
    noticed: read.noticed.filter((_, i) => yes(`n${i}`)),
    reading: read.reading && yes('r0') ? read.reading : null,
    shot: read.shot && yes('s0') ? read.shot : null,
  };
}

// ── THE QUICK LOOK (owner 2026-11-09: "do they all need to go through AI or do we have something… to lower the amount")
// A section photo is first looked at small and cheap: which helpful shot it is, whether it can answer anything still
// open, whether it shows a problem, or whether it is unusable. Only a photo worth it gets the full read. Closed, like the
// read: a shot must be one listed; the rest are yes / no.
export type ShotSort = { shot: string | null; useful: boolean; issue: boolean; unusable: boolean;
  /** With the guards: the open questions (keys) this photo could plausibly answer — the full read asks only these. */
  relevant?: string[] };
export function buildSortPrompt(ctx: ShotContext, g: ReadGuards = {}): { system: string; user: string } {
  const own = ctx.questions.filter(q => q.system === ctx.systemId).map(q => q.label);
  // Other systems' open questions too, by name (owner's test 2026-11-09: an attic ductwork photo taken in Cooling, and a
  // thermostat photo, were sorted as "nothing new" — their questions live in Heating).
  const others = ctx.questions.filter(q => q.system !== ctx.systemId).map(q => q.label);
  const system =
    'You sort ONE photo a home inspector took. Answer only what the photo plainly shows; never guess.\n' +
    'Return JSON: {"shot":"<id>"|null,"useful":true|false,"issue":true|false,"unusable":true|false}\n' +
    '- shot: the listed helpful shot this photo plainly IS, else null.\n' +
    '- useful: true if the photo could answer one of the open questions (a material, a type, printed text, a label).\n' +
    '- issue: true if a defect or safety concern is visible (damage, leak, rust, missing part, open wiring…).\n' +
    '- unusable: true if it is too blurry or dark to tell anything.' +
    (g.guards ? '\n- relevant: the keys of the questions this photo could plausibly answer (only listed keys; [] if none).' : '');
  const user =
    `Section: ${ctx.systemLabel}.\n` +
    (ctx.placeable?.length ? `Helpful shots:\n${ctx.placeable.map(p => `- ${p.id} — ${p.label}`).join('\n')}\n` : 'Helpful shots: none\n') +
    (g.guards
      ? `Open questions (key — question):\n${ctx.questions.map(q => `- ${q.key} — ${q.label}`).join('\n') || '(none)'}`
      : `Open questions: ${own.length ? own.join('; ') : 'none'}.` +
        (others.length ? `\nOther systems' open questions (useful too, if the photo plainly shows one): ${others.join('; ')}.` : ''));
  return { system, user };
}
export function validateSort(raw: any, ctx: ShotContext): ShotSort {
  const id = String(raw?.shot ?? '').trim();
  return {
    shot: ctx.placeable?.some(p => p.id === id) ? id : null,
    useful: raw?.useful === true, issue: raw?.issue === true, unusable: raw?.unusable === true,
    ...(Array.isArray(raw?.relevant) ? { relevant: raw.relevant.map(String).filter((k: string) => ctx.questions.some(q => q.key === k)) } : {}),
  };
}
/** The full read's questions, narrowed to what the quick look picked — with each follow-up's parent, so its condition can
 *  stand. No pick at all keeps every question (the narrowing never empties a read the look found worth doing). */
export function narrowQuestions(ctx: ShotContext, relevant: readonly string[] | undefined): ShotContext {
  if (!relevant?.length) return ctx;
  const keep = new Set(relevant);
  for (const q of ctx.questions) if (keep.has(q.key)) for (const w of q.when ?? []) keep.add(w.key);
  return { ...ctx, questions: ctx.questions.filter(q => keep.has(q.key)) };
}
/** Whether a sorted photo gets the full read: it is a helpful shot, can answer something, or shows a problem — never when
 *  it is unusable (unless it is a helpful shot: the inspector can still see it was found). */
export const worthFullRead = (s: ShotSort): boolean => !!s.shot || s.issue || (s.useful && !s.unusable);
