// ─── locations — Ledrix's standard locations (PLAN_2026-11-21_location.md, L1) ──────────────────────────────────────
//
// Owner 2026-11-21: "a room list is something Ledrix has already in the software. Standard rooms and places like living
// room, dining room, bathrooms, kitchen, laundry, garage, pantry, hall closet, hallway, mudroom..... also a set of
// directions that can be chosen as well if needed. They may want to say NE bedroom or South Hall Bathroom."
//
// A finding's Location is ONE place (a standard location below, or a custom one the inspector adds), an optional
// DIRECTION (blank unless chosen), and an optional SPOT in the inspector's words. It is never the component or system, a
// photo caption, "Current view", or a comma list. Ledrix owns this list (structure); a company's approved custom
// locations join it (L6).
//
// Pure and dependency-free: the website runs a byte-identical copy (scripts/web-preview-sync.json).

export type LocationGroup = 'inside' | 'below_above' | 'outside';
/** The legacy floor axis (core/types/location.ts Floor): the old routing drawer still groups by it. */
type LegacyFloor = 'B' | '1' | '2' | 'A' | 'R' | 'C' | 'E' | 'L';

export type StandardLocation = {
  id: string;
  label: string;
  group: LocationGroup;
  /** Other words people use for it ("lounge", "master bedroom"). Matched whole, never fuzzily. */
  aliases?: readonly string[];
  /** There can be several ("Bedroom 2", "Bathroom 3"): a trailing number names which one. */
  numbered?: boolean;
  /** Where the old routing drawer listed it. */
  floor: LegacyFloor;
};

export const LOCATION_GROUPS: readonly { id: LocationGroup; label: string }[] = [
  { id: 'inside', label: 'Inside' },
  { id: 'below_above', label: 'Below & above' },
  { id: 'outside', label: 'Outside' },
];

export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Direction = typeof DIRECTIONS[number];
const DIRECTION_WORDS: Record<string, Direction> = {
  n: 'N', north: 'N', ne: 'NE', northeast: 'NE', e: 'E', east: 'E', se: 'SE', southeast: 'SE',
  s: 'S', south: 'S', sw: 'SW', southwest: 'SW', w: 'W', west: 'W', nw: 'NW', northwest: 'NW',
};

const L = (id: string, label: string, group: LocationGroup, floor: LegacyFloor, extra: Partial<StandardLocation> = {}): StandardLocation =>
  ({ id: `loc_${id}`, label, group, floor, ...extra });

export const STANDARD_LOCATIONS: readonly StandardLocation[] = [
  // Inside
  L('living_room', 'Living Room', 'inside', '1', { aliases: ['lounge', 'front room', 'great room'] }),
  L('family_room', 'Family Room', 'inside', '1'),
  L('dining_room', 'Dining Room', 'inside', '1'),
  L('kitchen', 'Kitchen', 'inside', '1'),
  L('pantry', 'Pantry', 'inside', '1'),
  L('breakfast_nook', 'Breakfast Nook', 'inside', '1', { aliases: ['nook'] }),
  L('entry', 'Entry', 'inside', '1', { aliases: ['foyer', 'entryway'] }),
  L('hallway', 'Hallway', 'inside', '1', { aliases: ['hall'] }),
  L('hall_closet', 'Hall Closet', 'inside', '1'),
  L('coat_closet', 'Coat Closet', 'inside', '1'),
  L('linen_closet', 'Linen Closet', 'inside', '2'),
  L('stairway', 'Stairway', 'inside', '1', { aliases: ['stairs', 'staircase', 'stairwell'] }),
  L('primary_bedroom', 'Primary Bedroom', 'inside', '2', { aliases: ['master bedroom', 'master', 'owners bedroom', "owner's bedroom"] }),
  L('bedroom', 'Bedroom', 'inside', '2', { numbered: true, aliases: ['bed room'] }),
  L('primary_closet', 'Primary Closet', 'inside', '2', { aliases: ['master closet', 'walk in closet', 'walk-in closet'] }),
  L('bedroom_closet', 'Bedroom Closet', 'inside', '2'),
  L('primary_bathroom', 'Primary Bathroom', 'inside', '2', { aliases: ['master bathroom', 'master bath', 'primary bath', 'ensuite', 'en suite'] }),
  L('bathroom', 'Bathroom', 'inside', '1', { numbered: true, aliases: ['bath', 'full bath', 'full bathroom'] }),
  L('hall_bathroom', 'Hall Bathroom', 'inside', '2', { aliases: ['hall bath', 'guest bathroom', 'guest bath'] }),
  L('half_bathroom', 'Half Bathroom', 'inside', '1', { aliases: ['half bath', 'powder room', 'guest toilet'] }),
  L('laundry_room', 'Laundry Room', 'inside', '1', { aliases: ['laundry'] }),
  L('mudroom', 'Mudroom', 'inside', '1', { aliases: ['mud room'] }),
  L('utility_room', 'Utility Room', 'inside', 'B', { aliases: ['utility'] }),
  L('mechanical_room', 'Mechanical Room', 'inside', 'B', { aliases: ['furnace room', 'boiler room'] }),
  L('office', 'Office', 'inside', '1', { aliases: ['study'] }),
  L('den', 'Den', 'inside', '1'),
  L('bonus_room', 'Bonus Room', 'inside', '2'),
  L('loft', 'Loft', 'inside', '2'),
  L('sunroom', 'Sunroom', 'inside', '1', { aliases: ['sun room', 'florida room'] }),
  L('game_room', 'Game Room', 'inside', '1', { aliases: ['rec room', 'recreation room'] }),
  L('media_room', 'Media Room', 'inside', '1', { aliases: ['theater room', 'theatre room'] }),
  L('storage_room', 'Storage Room', 'inside', 'B', { aliases: ['storage'] }),
  L('workshop', 'Workshop', 'inside', 'B'),
  L('garage', 'Garage', 'inside', '1', { aliases: ['attached garage'] }),
  // Below & above
  L('basement', 'Basement', 'below_above', 'B'),
  L('crawlspace', 'Crawlspace', 'below_above', 'C', { aliases: ['crawl space', 'crawl'] }),
  L('attic', 'Attic', 'below_above', 'A'),
  L('attic_storage', 'Attic Storage', 'below_above', 'A'),
  // Outside
  L('exterior', 'Exterior', 'outside', 'E', { aliases: ['outside'] }),
  L('front_elevation', 'Front', 'outside', 'E', { aliases: ['front elevation', 'front of house', 'front side'] }),
  L('rear_elevation', 'Rear', 'outside', 'E', { aliases: ['rear elevation', 'back of house', 'back side', 'back'] }),
  L('left_side', 'Left Side', 'outside', 'E', { aliases: ['left elevation'] }),
  L('right_side', 'Right Side', 'outside', 'E', { aliases: ['right elevation'] }),
  L('roof', 'Roof', 'outside', 'R'),
  L('front_yard', 'Front Yard', 'outside', 'L'),
  L('backyard', 'Backyard', 'outside', 'L', { aliases: ['back yard', 'rear yard'] }),
  L('side_yard', 'Side Yard', 'outside', 'L'),
  L('driveway', 'Driveway', 'outside', 'L'),
  L('walkway', 'Walkway', 'outside', 'L', { aliases: ['sidewalk', 'path'] }),
  L('patio', 'Patio', 'outside', 'E'),
  L('deck', 'Deck', 'outside', 'E'),
  L('porch', 'Porch', 'outside', 'E', { aliases: ['front porch', 'back porch'] }),
  L('balcony', 'Balcony', 'outside', 'E'),
  L('pool', 'Pool', 'outside', 'L'),
  L('spa', 'Spa', 'outside', 'L', { aliases: ['hot tub'] }),
  L('shed', 'Shed', 'outside', 'L'),
  L('detached_garage', 'Detached Garage', 'outside', 'L'),
  L('carport', 'Carport', 'outside', 'L'),
  L('fence_line', 'Fence Line', 'outside', 'L', { aliases: ['fence'] }),
  L('retaining_wall', 'Retaining Wall', 'outside', 'L'),
  L('electric_meter', 'Electric Meter', 'outside', 'E'),
  L('gas_meter', 'Gas Meter', 'outside', 'L'),
  L('water_meter', 'Water Meter', 'outside', 'L'),
  L('well_head', 'Well Head', 'outside', 'L', { aliases: ['well'] }),
  L('septic', 'Septic', 'outside', 'L', { aliases: ['septic tank'] }),
  L('irrigation', 'Irrigation', 'outside', 'L', { aliases: ['sprinklers', 'irrigation zone'] }),
];

const BY_ID = new Map(STANDARD_LOCATIONS.map(l => [l.id, l]));
export function standardLocationById(id: string | null | undefined): StandardLocation | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Words as compared: lower case, letters and digits, single spaces. "Hall  Bath." → "hall bath". */
export function locationKey(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const KEYED = (() => {
  const m = new Map<string, StandardLocation>();
  for (const l of STANDARD_LOCATIONS) for (const w of [l.label, ...(l.aliases ?? [])]) m.set(locationKey(w), l);
  return m;
})();

export type LocationMatch = { location: StandardLocation; label: string; number?: number; direction?: Direction };

/** The standard location `text` names, whole: "Bedroom 2", "NE Bedroom", "master bath", "LAUNDRY ROOM". A leading or
 *  trailing direction word is read as the direction. Never fuzzy: "Carpeted floor area shown" names no location. */
export function matchLocation(text: unknown): LocationMatch | undefined {
  let words = locationKey(text).split(' ').filter(Boolean);
  if (!words.length) return undefined;
  let direction: Direction | undefined;
  const first = DIRECTION_WORDS[words[0]], last = DIRECTION_WORDS[words[words.length - 1]];
  if (words.length > 1 && first) { direction = first; words = words.slice(1); }
  else if (words.length > 1 && last) { direction = last; words = words.slice(0, -1); }
  let number: number | undefined;
  const tail = words[words.length - 1];
  if (words.length > 1 && /^\d{1,2}$/.test(tail)) { number = Number(tail); words = words.slice(0, -1); }
  if (words[0] === 'the' && words.length > 1) words = words.slice(1);
  const loc = KEYED.get(words.join(' '));
  if (!loc || (number !== undefined && !loc.numbered)) return undefined;
  const label = number !== undefined ? `${loc.label} ${number}` : loc.label;
  return { location: loc, label, ...(number !== undefined ? { number } : {}), ...(direction ? { direction } : {}) };
}

/** Standard locations for the search field, best first: a label or alias that starts with what was typed, then one
 *  with a word that does. An empty query lists none (the picker shows its groups instead). */
export function searchLocations(query: unknown, limit = 8): StandardLocation[] {
  const q = locationKey(query);
  if (!q) return [];
  const starts: StandardLocation[] = [], words: StandardLocation[] = [];
  for (const l of STANDARD_LOCATIONS) {
    const names = [l.label, ...(l.aliases ?? [])].map(locationKey);
    if (names.some(n => n.startsWith(q))) starts.push(l);
    else if (names.some(n => n.split(' ').some(w => w.startsWith(q)))) words.push(l);
  }
  return [...starts, ...words].slice(0, limit);
}

/** How a Location reads: "NE Bedroom · by the closet door". Direction and spot only when chosen. */
export function composeLocation(p: { label?: string | null; direction?: string | null; spot?: string | null }): string {
  const label = String(p.label ?? '').trim();
  const dir = DIRECTIONS.includes(p.direction as Direction) ? (p.direction as Direction) : '';
  const spot = String(p.spot ?? '').trim();
  return [[dir, label].filter(Boolean).join(' '), spot].filter(Boolean).join(' · ');
}
