// ─── hvacUnits — when Heating and Cooling fold into the Mini-Split tile (owner 2026-11-13, mockups GgddZui9… and 79T4…) ──
//
// A mini-split is ONE unit: one year made, one data plate, one tile. The Heating and Cooling answers decide the tiles
// (Before you start, "What heats? What cools?"), and nothing is inferred:
//   · Heating's type is only Ductless Mini-Split (and Heating has one unit) → the Heating tile folds into Mini-Split
//   · the same for Cooling
//   · both                → one Mini-Split tile, "Heat + cool"
//   · cooling only        → a Heating tile (the furnace) and a Mini-Split tile marked "Cool only"
//   · heating only        → a Cooling tile and a Mini-Split tile marked "Heat only"
//   · a mini-split beside another type ("Gas Furnace, Ductless Mini-Split") → nothing folds; both tiles stay and the
//     Mini-Split tile shows beside them
// A folded system is never lost: its items that still apply (the type question, Backup Heat) are listed on the
// Mini-Split page, and its tile comes back the moment its answer names another type.
//
// NO IMPORTS (verify:hvac-unit-tiles executes it; the website preview copies it).

export const MINI_SPLIT = 'Ductless Mini-Split';
/** A heat pump (owner 2026-11-13, mockup boards 5–6): Heating "Heat Pump" with Cooling "Heat Pump AC" is ONE system —
 *  the outdoor unit (Cooling's record: its Age and plate) and the indoor air handler (Heating's: its own Age and plate).
 *  A furnace beside the heat pump is dual fuel: since 2026-11-18 it is its own Backup Heat tile (hvacFold → backup). */
export const HEAT_PUMP = 'Heat Pump', HEAT_PUMP_AC = 'Heat Pump AC';
/** HEATING & COOLING (owner 2026-11-14, mockup https://claude.ai/artifact/4Df15Ji47hKYYea1JDvb2h → "Approved use
 *  recommendations"): a furnace and a split / package AC share the air handler — the ducts, filter, registers, thermostat
 *  and condensate — so they are ONE system: Cooling folds into the Heating tile, which reads "Heating & Cooling", its page
 *  ordered Furnace · Cooling · Shared. Only one of each (which furnace pairs with which AC is not known for two). */
export const FURNACES = ['Gas Furnace', 'Electric Furnace', 'Propane', 'Oil Furnace'];
export const DUCTED_AC = ['Split System', 'Package Unit'];
export const COMBINED_LABEL = 'Heating & Cooling';
/** THE SHARED PARTS of a Heating & Cooling system (the approved mockup's "Shared · Air handling & controls"): the items both
 *  the furnace and the AC use — printed under Shared in the report, by their library id. Everything else of Heating is the
 *  furnace's, everything else of Cooling is the AC's. */
export const SHARED_HVAC_NODES: readonly string[] = ['hvac_distribution', 'hvac_ducts', 'hvac_filter', 'hvac_nc_registers', 'hvac_temp_rise', 'hvac_thermostat', 'hvac_condensate'];
/** Which part of a Heating & Cooling chapter an item prints under. */
export const hvacPartOf = (systemId: string, nodeLibraryId: string | null | undefined): 'Furnace' | 'Cooling' | 'Shared' =>
  nodeLibraryId && SHARED_HVAC_NODES.includes(nodeLibraryId) ? 'Shared' : systemId === 'cooling' ? 'Cooling' : 'Furnace';

const entries = (v: string | null | undefined): string[] => String(v ?? '').split(',').map(x => x.trim()).filter(Boolean);
const isMs = (e: string) => e.toLowerCase() === MINI_SPLIT.toLowerCase();

export type HvacFold = {
  /** The systems folded into the unit tile: 'heating', 'cooling', both or none. */
  folded: ('heating' | 'cooling')[];
  /** The unit system they fold into: the Mini Split, the Heat Pump, Heating (a furnace + a split AC, 2026-11-14), or none. */
  into: 'mini_split' | 'heat_pump' | 'heating' | null;
  /** What the mini-split does at this house, from the answers. */
  heat: boolean; cool: boolean;
  /** The tile's note: "Heat + cool", "Cool only", "Heat only", or null when no answer names a mini-split. */
  note: 'Heat + cool' | 'Cool only' | 'Heat only' | null;
  /** DUAL FUEL (owner 2026-11-18, mockup E1k8vtU9D4StVjM9GkLmKn approved): a heat pump with a furnace beside it — the
   *  furnace as it reads under the Backup Heat tile ("Gas furnace"), or null. Cooling folds into the Heat Pump tile; the grid
   *  shows Heat Pump · Backup Heat (Heating, the whole furnace), in that order (dualFuelOrder). */
  backup: string | null;
};

/** A UNIT TILE THAT HOLDS ANOTHER SYSTEM SAYS SO (owner 2026-11-18, mockup TMZGLWW3XcPKGgiPag2WJE: "Heat pump cooling match
 *  the Heating and Cooling … Mini split only label if it only does one"): the Heat Pump tile always holds Cooling, so it
 *  reads Heat Pump & Cooling; a mini-split that does both stays Mini Split, one that does one says which. Null = the
 *  system's own name. */
export function unitTileLabel(fold: HvacFold): string | null {
  if (fold.into === 'heat_pump') return 'Heat Pump & Cooling';
  if (fold.into === 'mini_split' && fold.heat !== fold.cool) return fold.cool ? 'Mini Split/Cooling' : 'Mini Split/Heating';
  return null;
}

/** The Heating tile's name at a dual-fuel house. */
export const BACKUP_LABEL = 'Backup Heat';
/** How a furnace type reads under the Backup Heat tile. */
const BACKUP_WORD: Readonly<Record<string, string>> = { 'gas furnace': 'Gas furnace', 'propane': 'Propane furnace', 'electric furnace': 'Electric furnace', 'oil furnace': 'Oil furnace' };
/** THE DUAL-FUEL ORDER: Heat Pump, then Backup Heat (heating), then Cooling, together where the first of them stood;
 *  every other system keeps its place. */
export function dualFuelOrder<T extends { id: string }>(systems: readonly T[], baseOf: (id: string) => string = id => id): T[] {
  const ORDER = ['heat_pump', 'heating', 'cooling'];
  const trio = ORDER.flatMap(id => systems.filter(s => baseOf(s.id) === id));
  const at = systems.findIndex(s => ORDER.includes(baseOf(s.id)));
  if (at < 0) return [...systems];
  const rest = systems.filter(s => !ORDER.includes(baseOf(s.id)));
  const before = systems.slice(0, at).filter(s => !ORDER.includes(baseOf(s.id))).length;
  return [...rest.slice(0, before), ...trio, ...rest.slice(before)];
}

/** The fold for one building. `heatingUnits` / `coolingUnits`: how many units the system has there (a Heating #2 means
 *  Heating is not only the mini-split, so it never folds). */
export function hvacFold(x: { heating: string | null | undefined; cooling: string | null | undefined; heatingUnits?: number; coolingUnits?: number }): HvacFold {
  const h = entries(x.heating), c = entries(x.cooling);
  const heat = h.some(isMs), cool = c.some(isMs);
  const folded: ('heating' | 'cooling')[] = [];
  if (heat && h.every(isMs) && (x.heatingUnits ?? 1) <= 1) folded.push('heating');
  if (cool && c.every(isMs) && (x.coolingUnits ?? 1) <= 1) folded.push('cooling');
  if (heat || cool) return { folded, into: folded.length ? 'mini_split' : null, heat, cool, note: heat && cool ? 'Heat + cool' : cool ? 'Cool only' : heat ? 'Heat only' : null, backup: null };
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  // DUAL FUEL (owner 2026-11-18, mockup E1k8vtU9D4StVjM9GkLmKn: "the systems should be heat pump, backup heat (gas furnace),
  // cooling … back up heat needs an entire gas furnace or electric or whatever that system is"): a heat pump with a furnace
  // beside it folds nothing — Heating is the Backup Heat tile, the whole furnace's checklist. Reverses 2026-11-13's "a
  // dual-fuel furnace stays on the Heat Pump page".
  // REVISED THE SAME DAY (owner on 912, mockup 877UdvYiZLdUhgkB2EXuXi approved: "Heat pump always combines heat and cool and
  // needs a backup heat"): Cooling — the heat pump's outdoor unit — folds into the Heat Pump tile when it is the heat pump
  // (Heat Pump AC, or not answered yet) with one unit; Heating stays its own tile, the Backup Heat.
  const furnaces = h.filter(e => FURNACES.some(f => eq(e, f)));
  if (h.some(e => eq(e, HEAT_PUMP)) && furnaces.length) {
    const coolIsHp = c.every(e => eq(e, HEAT_PUMP_AC)) && (x.coolingUnits ?? 1) <= 1;
    return { folded: coolIsHp ? ['cooling'] : [], into: coolIsHp ? 'heat_pump' : null, heat: false, cool: false, note: null,
      backup: furnaces.map(e => BACKUP_WORD[e.toLowerCase()] ?? e).join(' + ') };
  }
  // A HEAT PUMP folds only whole: its heating is the heat pump alone AND its cooling is the heat pump, each with one unit.
  // Anything else keeps Heating and Cooling as they are.
  const hp = h.some(e => eq(e, HEAT_PUMP)) && h.every(e => eq(e, HEAT_PUMP))
    && c.length > 0 && c.every(e => eq(e, HEAT_PUMP_AC)) && (x.heatingUnits ?? 1) <= 1 && (x.coolingUnits ?? 1) <= 1;
  if (hp) return { folded: ['heating', 'cooling'], into: 'heat_pump', heat: false, cool: false, note: null, backup: null };
  // A FURNACE + A DUCTED AC: one air handler, one system — Cooling folds into Heating (Heating & Cooling).
  const combined = h.length > 0 && h.every(e => FURNACES.some(f => eq(e, f))) && c.length > 0 && c.every(e => DUCTED_AC.some(d => eq(e, d)))
    && (x.heatingUnits ?? 1) <= 1 && (x.coolingUnits ?? 1) <= 1;
  if (combined) return { folded: ['cooling'], into: 'heating', heat: false, cool: false, note: null, backup: null };
  return { folded: [], into: null, heat, cool, note: null, backup: null };
}
