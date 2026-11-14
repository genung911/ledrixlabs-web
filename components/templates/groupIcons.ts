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
