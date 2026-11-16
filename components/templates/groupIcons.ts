// ─── groupIcons — the icon on a system's group tile (owner 2026-11-13: "Make all pages with tiles 4 across layout with
// name on bottom. Match what we did" — the system pages' groups; Pre-Inspect stays, Post-Inspect stays three across).
// A group is a template subsystem (Service, Panel, Covering…) and carries no icon of its own, so each Ledrix group has one
// chosen here; a company's own group falls back to the label rules every item uses (matrixScenes.iconForLabel).
// Names are MaterialCommunityIcons (@expo/vector-icons) — verify:group-tiles checks each one exists.
//
// NO IMPORTS (the guard executes it).

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const GROUP_ICONS: Readonly<Record<string, string>> = {
  // Heating
  'heating plant': 'fire', 'air handling': 'fan', 'boiler electric radiant': 'radiator', 'controls': 'thermostat',
  // Plumbing
  'supply': 'water-pump', 'drain waste vent': 'pipe', 'fixtures': 'shower-head', 'fuel gas': 'gas-cylinder',
  // Electrical
  'service': 'transmission-tower', 'panel': 'fuse', 'branch wiring': 'cable-data', 'devices protection': 'power-socket-us',
  // Roofing
  'covering': 'home-roof', 'flashing penetrations': 'pipe-valve', 'drainage': 'weather-pouring', 'structure': 'triangle-outline',
  // Foundation
  'type material': 'cube-outline', 'crawlspace': 'home-floor-negative-1', 'basement': 'stairs-down', 'framing visible': 'pillar',
  'garage slab': 'garage',
  // Exterior
  'cladding': 'wall', 'openings': 'window-closed-variant', 'grounds': 'terrain', 'decks porches': 'fence', 'penetrations': 'pipe-valve',
  // Attic
  'access structure': 'ladder', 'insulation': 'layers-outline', 'ventilation': 'fan', 'conditions': 'water-percent',
  // Interior
  'walls ceilings floors': 'wall', 'countertops cabinets': 'cupboard', 'counters cabinets': 'cupboard', 'doors windows': 'door',
  'stairs railings': 'stairs',
  // Fireplace
  'firebox': 'fireplace', 'chimney flue venting': 'smoke', 'gas': 'fire-circle', 'service safety': 'shield-check-outline',
  // Safety
  'detectors alarms': 'smoke-detector', 'fire separation': 'door-closed-lock',
  // Spaces
  'electrical': 'flash', 'garage door': 'garage-variant', 'floor walls': 'floor-plan', 'appliances': 'stove',
  'sink plumbing': 'water-outline', 'hookups': 'washing-machine', 'venting': 'weather-windy', 'ventilation electrical': 'fan',
};

/** The group's icon: Ledrix's choice for its label, else `fallback(label)` (the item label rules). */
export function groupIconFor(label: string, fallback: (label: string) => string): string {
  return GROUP_ICONS[norm(label)] ?? fallback(label);
}

// ─── ITEM ICONS (owner 2026-11-15, on the group page's grey circles: "We need some tile emojis made") — an item tile shows
// what it is; its state is the tile's border and the line under the name. First rule that matches the label wins; colorIcons
// draws each name (a name it does not draw yet stays the white glyph).
export const ITEM_ICON_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/data ?plate|make ?\/ ?model|\bmodel\b|serial|nameplate/, 'card-text-outline'],
  [/heat exchanger/, 'waves'],
  [/temp(erature)? rise|register|thermometer|temperature/, 'thermometer'],
  [/thermostat|control/, 'thermostat'],
  [/filter/, 'air-filter'],
  [/burner|flame|pilot|ignit/, 'fire'],
  [/combustion air|intake|make ?up air/, 'weather-windy'],
  [/condensate|drain line|trap/, 'water-outline'],
  [/flue|vent connector|venting|chimney|damper/, 'smoke'],
  [/blower|fan|exhaust/, 'fan'],
  [/duct|distribution|plenum/, 'hvac'],
  [/furnace|air handler|heat pump|boiler|heating system|cabinet/, 'hvac'],
  [/condenser|compressor|a ?c\b|cooling|refrigerant|line set/, 'air-conditioner'],
  [/water heater|tank|tpr|relief/, 'water-boiler'],
  [/gas|valve|shut ?off|meter/, 'pipe-valve'],
  [/disconnect|wiring|wire|conductor|bond|ground/, 'cable-data'],
  [/panel|breaker|fuse|service/, 'fuse'],
  [/outlet|receptacle|gfci|afci|switch|fixture light|light/, 'power-socket-us'],
  [/smoke|co alarm|carbon monoxide|detector/, 'smoke-detector'],
  [/sink|faucet|basin/, 'water-outline'],
  [/toilet/, 'toilet'],
  [/shower|tub/, 'shower-head'],
  [/supply|pipe|piping|plumbing|waste|drain/, 'pipe'],
  [/garage door|opener/, 'garage-variant'],
  [/door/, 'door'],
  [/window|glazing/, 'window-closed-variant'],
  [/stair|rail|guard/, 'stairs'],
  [/counter|cabinet/, 'cupboard'],
  [/floor/, 'floor-plan'],
  [/wall|ceiling|siding|cladding|trim|stucco/, 'wall'],
  [/shingle|roof|covering/, 'home-roof'],
  [/gutter|downspout/, 'weather-pouring'],
  [/flashing|penetration/, 'pipe-valve'],
  [/insulation/, 'layers-outline'],
  [/attic|hatch|access/, 'ladder'],
  [/crawl/, 'home-floor-negative-1'],
  [/foundation|slab|footing|pier/, 'cube-outline'],
  [/joist|beam|post|girder|framing|truss|rafter/, 'pillar'],
  [/deck|porch|patio|balcony/, 'fence'],
  [/grade|grading|drainage|landscap|driveway|walkway/, 'terrain'],
  [/fireplace|firebox|hearth/, 'fireplace'],
  [/range|oven|cooktop|stove|appliance/, 'stove'],
  [/dishwasher|disposal/, 'silverware-fork-knife'],
  [/washer|dryer|laundry/, 'washing-machine'],
];

/** An item tile's icon: the first ITEM_ICON_RULES match on its label, else `fallback(label)`. */
export function itemIconFor(label: string, fallback: (label: string) => string): string {
  const l = String(label ?? '').toLowerCase();
  for (const [re, icon] of ITEM_ICON_RULES) if (re.test(l)) return icon;
  return fallback(label);
}
