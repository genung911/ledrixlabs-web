// ─── findingLocation — a finding's Location as fields (PLAN_2026-11-21_location.md, L2) ─────────────────────────────────
//
// A Location is ONE place, an optional direction (blank unless chosen) and an optional spot. On the record:
//   locationId     a standard location id (core/taxonomy/locations.ts) or CUSTOM_LOCATION_ID
//   locationLabel  the place as chosen: "Bedroom 2", "Wet Bar"
//   locationDir    N…NW, or absent
//   locationSpot   the inspector's own words, or absent
// and, composed from them for everything that still reads text:
//   location       "NE Bedroom · by the closet door"
//   room           "NE Bedroom" (the place and its direction: the room a finding is IN, which is what groups by room)
//
// Every writer goes through withLocation; every reader through locationOf / locationText. A legacy row that has only text
// gets fields when its text names a standard location WHOLE ("Bathroom", "Bedroom 2"); a photo caption names none, and the
// row keeps its text, which the report prints through placeBeyond (cardDefinition).
//
// Pure: the report bundle and the website run it.
import { matchLocation, searchLocations, locationKey, composeLocation, standardLocationById, DIRECTIONS, type Direction } from '../taxonomy/locations';

export const CUSTOM_LOCATION_ID = 'custom';
export type FindingLocation = { id: string; label: string; dir?: Direction; spot?: string };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const dirOf = (v: unknown): Direction | undefined => (DIRECTIONS as readonly string[]).includes(str(v)) ? (str(v) as Direction) : undefined;

/** The finding's Location as fields, or null when it has none: fields first, then a legacy room or location text that
 *  names a standard location whole. Never a guess. */
export function locationOf(a: any): FindingLocation | null {
  const id = str(a?.locationId), label = str(a?.locationLabel);
  if (id && label) {
    const dir = dirOf(a?.locationDir), spot = str(a?.locationSpot);
    // THE TEXT WINS WHEN IT WAS EDITED WITHOUT THE FIELDS: the website's editor and an older phone write `location`
    // alone, so a text that no longer reads as the fields is the newer word, and the fields are stale.
    const text = str(a?.location);
    if (!text || text === composeLocation({ label, direction: dir, spot })) return { id, label, ...(dir ? { dir } : {}), ...(spot ? { spot } : {}) };
  }
  // Stale fields: only the edited text speaks (the composed `room` went stale with them).
  const stale = !!(id && label);
  for (const t of stale ? [a?.location] : [a?.room, a?.location]) {
    // A composed text ("NE Bedroom · by the closet door" — the website writes it so until #137) reads back as its parts.
    const [head, ...rest] = str(t).split(' · ');
    const m = matchLocation(head);
    const spot = rest.join(' · ').trim();
    if (m) return { id: m.location.id, label: m.label, ...(m.direction ? { dir: m.direction } : {}), ...(spot ? { spot } : {}) };
  }
  return null;
}

/** The record with this Location written to every field that carries it. `null` clears it. */
export function withLocation<T extends Record<string, any>>(a: T, loc: FindingLocation | null): T {
  const out: Record<string, any> = { ...a };
  if (!loc || !str(loc.label)) {
    for (const k of ['locationId', 'locationLabel', 'locationDir', 'locationSpot', 'location', 'room']) delete out[k];
    return out as T;
  }
  const label = str(loc.label), dir = dirOf(loc.dir), spot = str(loc.spot);
  out.locationId = str(loc.id) || CUSTOM_LOCATION_ID;
  out.locationLabel = label;
  if (dir) out.locationDir = dir; else delete out.locationDir;
  if (spot) out.locationSpot = spot; else delete out.locationSpot;
  out.location = composeLocation({ label, direction: dir, spot });
  out.room = composeLocation({ label, direction: dir });
  return out as T;
}

/** How the Location reads: fields composed, else the legacy text as stored. */
export function locationText(a: any): string {
  return str(a?.location) || (locationOf(a) ? composeLocation({ label: locationOf(a)!.label, direction: locationOf(a)!.dir, spot: locationOf(a)!.spot }) : '') || str(a?.room);
}

/** The room the finding is in, for grouping ("NE Bedroom"), or '' when it names none. */
export function locationRoom(a: any): string {
  const loc = locationOf(a);
  return loc ? composeLocation({ label: loc.label, direction: loc.dir }) : '';
}

/** The picker's lists for one inspection (LocationSheet): USED IN THIS HOUSE — every place its findings use and its
 *  template's rooms, each once, most recent first — and the LAST USED place on another finding. Pure over its inputs. */
export function locationChoicesFrom(findings: readonly any[], houseRoomLabels: readonly string[], exceptId?: string):
  { used: FindingLocation[]; lastUsed?: FindingLocation } {
  const key = (l: FindingLocation) => `${l.id}|${l.label.toLowerCase()}|${l.dir ?? ''}`;
  const seen = new Set<string>();
  const used: FindingLocation[] = [];
  const keep = (l: FindingLocation | null) => { if (!l) return; const p = { id: l.id, label: l.label, ...(l.dir ? { dir: l.dir } : {}) }; const k = key(p); if (!seen.has(k)) { seen.add(k); used.push(p); } };
  const when = (a: any) => Date.parse(a?.updatedAt ?? a?.createdAt ?? a?.timestamp ?? '') || 0;
  const live = [...findings].filter(a => a && a.status !== 'rejected').sort((x, y) => when(y) - when(x));
  let lastUsed: FindingLocation | undefined;
  for (const a of live) {
    const l = locationOf(a);
    if (l && !lastUsed && String(a.id) !== String(exceptId ?? '')) lastUsed = { id: l.id, label: l.label, ...(l.dir ? { dir: l.dir } : {}) };
    keep(l);
  }
  for (const r of houseRoomLabels) {
    const m = matchLocation(r);
    keep(m ? { id: m.location.id, label: m.label } : str(r) ? { id: CUSTOM_LOCATION_ID, label: str(r).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) } : null);
  }
  return { used, ...(lastUsed ? { lastUsed } : {}) };
}

/** The Location as an EDIT to merge onto a record ({ ...prior, ...edits }): every field named, the ones not chosen as
 *  undefined, so a direction or spot chosen earlier is cleared rather than kept by the merge. */
export function locationEdits(loc: FindingLocation): Record<string, string | undefined> {
  const w = withLocation({}, loc) as Record<string, string | undefined>;
  return { locationId: w.locationId, locationLabel: w.locationLabel, locationDir: w.locationDir, locationSpot: w.locationSpot,
    location: w.location, room: w.room };
}

/** What the Location sheet's search field offers (L3): a whole name it reads ("Bedroom 2", "NE Bedroom") first, then this
 *  house's places that match, then standard locations as you type — each once — and, when nothing is exactly what was
 *  typed, the words to "Add" as a custom location. Null when nothing is typed. */
/** A company's approved location (SQL #138): its own name, or a name that means a standard location. */
export type CompanyPlace = { key: string; label: string; group: string; mapsTo: string | null };
/** The id a company location is saved under: the standard one it means, else "company:<key>" (no longer counted as custom). */
export function companyPlace(c: CompanyPlace): { id: string; label: string } {
  const std = c.mapsTo ? standardLocationById(c.mapsTo) : undefined;
  return std ? { id: std.id, label: std.label } : { id: `company:${c.key}`, label: c.label };
}
/** The words as the server compares them (#138 location_key): letters and digits, no "the / a / an / area". */
export const serverLocationKey = (t: unknown) => locationKey(t).split(' ').filter(w => !['the', 'a', 'an', 'area'].includes(w)).join('');

export function locationSearch(query: string, used: readonly FindingLocation[], company: readonly CompanyPlace[] = []):
  { rows: { id: string; label: string; dir?: Direction }[]; addLabel: string } | null {
  const q = String(query ?? '').trim();
  if (!q) return null;
  const rows: { id: string; label: string; dir?: Direction }[] = [];
  const seen = new Set<string>();
  const add = (r: { id: string; label: string; dir?: Direction }) => {
    const k = `${r.id}|${locationKey(r.label)}|${r.dir ?? ''}`;
    if (!seen.has(k)) { seen.add(k); rows.push(r); }
  };
  const whole = matchLocation(q);
  if (whole) add({ id: whole.location.id, label: whole.label, ...(whole.direction ? { dir: whole.direction } : {}) });
  // The company's list: a name typed as approved ("wetbar" → Wet Bar; "Shop" → Workshop when it was pointed there).
  for (const c of company) if (serverLocationKey(c.label) === serverLocationKey(q) || c.key === serverLocationKey(q)) add(companyPlace(c));
  for (const u of used) if (locationKey(u.label).includes(locationKey(q))) add({ id: u.id, label: u.label });
  for (const c of company) if (locationKey(c.label).includes(locationKey(q))) add(companyPlace(c));
  for (const l of searchLocations(q)) add({ id: l.id, label: l.label });
  const exact = !!whole || rows.some(r => locationKey(r.label) === locationKey(q) || serverLocationKey(r.label) === serverLocationKey(q));
  return { rows, addLabel: exact ? '' : q.replace(/\s+/g, ' ') };
}

/** A place given as words — the room selected at the shutter, or a room the inspector named — as a Location: the
 *  standard one it names whole, else a custom place in those words. '' → null. (L4: the only place-words a capture
 *  writes as a Location; the model's words are only ever a suggestion.) */
export function placeFromText(text: unknown): FindingLocation | null {
  const t = str(text);
  if (!t) return null;
  const m = matchLocation(t);
  // The house's own words stay its words ("Hall Bath" is a template's room, and stays "Hall Bath"), linked to the standard
  // location it names; only a direction read out of them moves to the direction.
  return m ? { id: m.location.id, label: m.direction ? m.label : t, ...(m.direction ? { dir: m.direction } : {}) } : { id: CUSTOM_LOCATION_ID, label: t };
}
