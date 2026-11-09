// ─── systemShots — the photos each system asks for, and how one is read (owner 2026-11-08) ────────────────────────
//
// Owner: "Can the first tile in each section be the 'photos needed' for that system… This 'suggest' the details possible
// from the photos and inspector confirms and assesses condition" · "I'm taking the photos, why do I have to do the data
// entry as well when it's right there on the photos. I should just be approving and adding findings and limitations or
// the obscure details/info." Mockup https://claude.ai/artifact/FQKuft3zPAjVMUVU55DNEq → "this was my original vision",
// then "build it all". Shot lists come from the owner's own photo test (Heating, Electrical, Water Heater ×2 houses;
// Roofing, Exterior, Plumbing, Crawlspace ×1); Attic, Cooling, Interior, Fireplace and Appliances are first drafts.
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
  reading?: { system: string; point: string };
  /** A shot a house has SEVERAL of (owner 2026-11-08: "a way to add another bathroom and label them… when one is taken,
   *  the blank tile populates again, but says next bathroom"). Each photo is its own square, named `base n` until the
   *  inspector renames it (the name is the photo's room); `next` is the empty square that follows. */
  repeat?: { base: string; next: string };
};

/** Systems by template base id. A system with no entry has no Photos tile. */
export const SYSTEM_SHOTS: Record<string, readonly Shot[]> = {
  heating: [
    { id: 'furnace_wide', label: 'Furnace wide', hint: 'The whole unit, with the pipes leaving it and the ductwork attached.' },
    { id: 'plate', label: 'Data plate', hint: 'The rating label, close enough to read every line.', plate: 'Furnace / heating unit' },
    { id: 'filter', label: 'Filter edge', hint: 'Slide the filter out: the printed rim (size, MERV) and where it goes.' },
    { id: 'thermostat', label: 'Thermostat', hint: 'The thermostat on the wall, face on.' },
  ],
  cooling: [
    { id: 'condenser_wide', label: 'Outdoor unit', hint: 'The whole condenser or heat pump, with its disconnect if it is in view.' },
    { id: 'plate', label: 'Data plate', hint: 'The outdoor unit\'s rating label, close enough to read.', plate: 'AC condenser / heat pump' },
    { id: 'indoor', label: 'Indoor coil & drain', hint: 'The coil cabinet or air handler, with the condensate line leaving it.' },
  ],
  water_heater: [
    { id: 'wh_wide', label: 'Water heater wide', hint: 'Top to floor, with what surrounds it: pan, expansion tank, straps.' },
    { id: 'plate', label: 'Data plate', hint: 'The rating label: fuel, gallons, BTU and the date.', plate: 'Water heater' },
    { id: 'vent_top', label: 'Vent at the top', hint: 'Close on the vent where it leaves the unit — the stamp on the pipe if there is one.' },
    { id: 'hot_water', label: 'Hot water reading', hint: 'The thermometer\'s display at a faucet, hot side, after it has run.', reading: { system: 'water_heater', point: 'hot_water_temp' } },
  ],
  electrical: [
    { id: 'service', label: 'Service drop & meter', hint: 'Where the wires reach the house, the meter, and the conduit or mast.' },
    { id: 'panel_label', label: 'Panel, door open', hint: 'The panel with its door open: the label and the circuit directory.', repeat: { base: 'Panel', next: 'Next panel' } },
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
    { id: 'attic_wide', label: 'Attic from the hatch', hint: 'Wide: framing, sheathing, insulation, vents.' },
    { id: 'insulation_depth', label: 'Insulation depth', hint: 'A ruler standing in the insulation.' },
    { id: 'attic_access', label: 'Attic access', hint: 'The hatch or pull-down stair.' },
  ],
  interior: [
    { id: 'kitchen', label: 'Kitchen', hint: 'Wide: counters, floor, cabinets, the window.' },
    { id: 'bathroom', label: 'Bathroom', hint: 'Wide: the tub or shower, the floor, the fan.', repeat: { base: 'Bathroom', next: 'Next bathroom' } },
    { id: 'window_close', label: 'A window up close', hint: 'The frame and glass, where the label or spacer shows.', repeat: { base: 'Window', next: 'Next window' } },
  ],
  fireplace: [
    { id: 'firebox', label: 'Firebox', hint: 'The firebox and its surround, doors open if there are doors.' },
    { id: 'chimney', label: 'Chimney from outside', hint: 'The chimney or vent where it leaves the roof.' },
  ],
  appliances: [
    { id: 'range', label: 'Range & hood', hint: 'The cooktop and the hood above it.' },
    { id: 'dryer', label: 'Dryer hookup', hint: 'The dryer outlet or gas line behind the dryer.' },
  ],
};

const baseOf = (id: string) => String(id).split('~')[0];
export const shotsFor = (systemId: string): readonly Shot[] => SYSTEM_SHOTS[baseOf(systemId)] ?? [];
/** The photo's role, stored on the evidence item: `heating:plate`. */
export const shotRole = (systemId: string, shotId: string) => `${baseOf(systemId)}:${shotId}`;

// ── THE READ ────────────────────────────────────────────────────────────────────────────────────────────────────

/** An open Details question offered to the read: `node|attr`, its words, its authored choices. */
/** `dimensions` (Filter › Size): any size read off the photo is a proposal, in the stored "20x20x1" form — not only the
 *  listed common sizes. */
export type ShotQuestion = { key: string; system: string; label: string; choices: readonly string[]; dimensions?: boolean };
/** A condition item of the shot's system and its own quick findings (findingIntents with a controlled id). */
export type ShotItem = { nodeId: string; label: string; intents: readonly { id: string; label: string }[] };
export type ShotContext = {
  systemLabel: string;
  shot: Shot;
  /** This system's open questions first; then other systems' (a photo can show them too). */
  questions: readonly ShotQuestion[];
  systemId: string;
  items: readonly ShotItem[];
  /** The reading slot this shot carries, with the units it may be in. */
  reading?: { point: string; label: string; units: readonly string[] } | null;
  /** What the inspector named this photo (a repeating shot's room: "Hall bath"), if anything. */
  place?: string | null;
};

export const MAX_NOTICED = 2;

export function buildShotPrompt(ctx: ShotContext): { system: string; user: string } {
  const own = ctx.questions.filter(q => q.system === ctx.systemId);
  const other = ctx.questions.filter(q => q.system !== ctx.systemId);
  const q = (x: ShotQuestion) => x.dimensions
    ? `- ${x.key} — ${x.label}: the size printed on it, as WIDTHxHEIGHTxDEPTH in inches (e.g. "16x25x1")`
    : `- ${x.key} — ${x.label}: ${x.choices.map(c => JSON.stringify(c)).join(' | ')}`;
  const system =
    'You read ONE photo a licensed home inspector took, and fill in a form from what the photo SHOWS. You never guess.\n' +
    'Rules:\n' +
    '1. For each question, answer ONLY with one of its listed choices, copied exactly, and only when the photo shows it ' +
    'plainly — printed text (a data plate, a pipe stamp, a label) or an unmistakable look. Otherwise leave it out, or put it ' +
    'in cant_tell with the photo that WOULD settle it (under 60 characters).\n' +
    '2. Never answer an age from how something looks. Only from a printed date.\n' +
    '3. "noticed": at most ' + MAX_NOTICED + ' problems that are CLEARLY visible, each one of the listed quick findings for ' +
    'one listed item, with a short plain note of what is seen. Most photos have none — return an empty list.\n' +
    '4. "reading": only if a reading slot is listed and an instrument\'s display is legible: the number and unit shown.\n' +
    'Return JSON: {"answers":[{"key":"…","value":"…"}],"cant_tell":[{"key":"…","need":"…"}],' +
    '"noticed":[{"node":"…","finding":"…","note":"…"}],"reading":{"value":0,"unit":"…"}|null}';
  const user =
    `Photo: "${ctx.shot.label}" for ${ctx.systemLabel}${ctx.place ? ` — the inspector named it "${ctx.place}"` : ''}. ${ctx.shot.hint}\n\n` +
    `Questions for ${ctx.systemLabel}:\n${own.length ? own.map(q).join('\n') : '(none open)'}\n` +
    (other.length ? `\nOther systems' questions — answer only if this photo plainly shows them:\n${other.map(q).join('\n')}\n` : '') +
    (ctx.items.length ? `\nItems and their quick findings (for "noticed"):\n${ctx.items.map(i => `- ${i.nodeId} — ${i.label}: ${i.intents.map(t => `${t.id} (${t.label})`).join(', ')}`).join('\n')}\n` : '') +
    (ctx.reading ? `\nReading slot: ${ctx.reading.label}, in ${ctx.reading.units.join(' or ')}.\n` : '');
  return { system, user };
}

export type ShotRead = {
  answers: { key: string; value: string }[];
  cantTell: { key: string; need: string }[];
  noticed: { nodeId: string; intentId: string; intentLabel: string; note: string }[];
  reading: { point: string; value: number; unit: string } | null;
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Keep only what the template allows. The model's answer is a proposal; this decides whether it may even be one. */
export function validateShotRead(raw: any, ctx: ShotContext): ShotRead {
  const byKey = new Map(ctx.questions.map(q => [q.key, q]));
  const answers: ShotRead['answers'] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(raw?.answers) ? raw.answers : []) {
    const q = byKey.get(String(a?.key ?? ''));
    if (!q || seen.has(q.key)) continue;
    const size = q.dimensions ? parseSizeEntry(String(a?.value ?? '')) : null;
    const hit = size ? formatSizeEntry(size) : q.choices.find(c => norm(c) === norm(a?.value));
    if (!hit) continue;   // never a value the template does not offer (a size field takes any real size)
    seen.add(q.key);
    answers.push({ key: q.key, value: hit });
  }
  const cantTell: ShotRead['cantTell'] = [];
  for (const c of Array.isArray(raw?.cant_tell) ? raw.cant_tell : []) {
    const q = byKey.get(String(c?.key ?? ''));
    if (!q || q.system !== ctx.systemId || seen.has(q.key) || cantTell.some(x => x.key === q.key)) continue;
    const need = String(c?.need ?? '').trim().slice(0, 80);
    cantTell.push({ key: q.key, need });
  }
  const noticed: ShotRead['noticed'] = [];
  for (const n of Array.isArray(raw?.noticed) ? raw.noticed : []) {
    if (noticed.length >= MAX_NOTICED) break;
    const item = ctx.items.find(i => i.nodeId === String(n?.node ?? ''));
    const intent = item?.intents.find(t => t.id === String(n?.finding ?? '') || norm(t.label) === norm(n?.finding));
    const note = String(n?.note ?? '').trim().slice(0, 160);
    if (!item || !intent || !note || noticed.some(x => x.nodeId === item.nodeId && x.intentId === intent.id)) continue;
    noticed.push({ nodeId: item.nodeId, intentId: intent.id, intentLabel: intent.label, note });
  }
  let reading: ShotRead['reading'] = null;
  const rv = raw?.reading;
  if (ctx.reading && rv && Number.isFinite(Number(rv.value))) {
    const unit = ctx.reading.units.find(u => norm(u) === norm(rv.unit) || norm(u).replace('°', '') === norm(rv.unit).replace('°', '').replace('deg', '').trim());
    if (unit) reading = { point: ctx.reading.point, value: Math.round(Number(rv.value) * 10) / 10, unit };
  }
  return { answers, cantTell, noticed, reading };
}
