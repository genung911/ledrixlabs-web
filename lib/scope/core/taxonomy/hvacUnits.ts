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
 *  A gas or propane furnace beside the heat pump is dual fuel: it stays on the Heat Pump page, as its backup heat. */
export const HEAT_PUMP = 'Heat Pump', HEAT_PUMP_AC = 'Heat Pump AC';
const DUAL_FUEL = ['Gas Furnace', 'Propane'];

const entries = (v: string | null | undefined): string[] => String(v ?? '').split(',').map(x => x.trim()).filter(Boolean);
const isMs = (e: string) => e.toLowerCase() === MINI_SPLIT.toLowerCase();

export type HvacFold = {
  /** The systems folded into the unit tile: 'heating', 'cooling', both or none. */
  folded: ('heating' | 'cooling')[];
  /** The unit system they fold into: the Mini Split, the Heat Pump, or none. */
  into: 'mini_split' | 'heat_pump' | null;
  /** What the mini-split does at this house, from the answers. */
  heat: boolean; cool: boolean;
  /** The tile's note: "Heat + cool", "Cool only", "Heat only", or null when no answer names a mini-split. */
  note: 'Heat + cool' | 'Cool only' | 'Heat only' | null;
};

/** The fold for one building. `heatingUnits` / `coolingUnits`: how many units the system has there (a Heating #2 means
 *  Heating is not only the mini-split, so it never folds). */
export function hvacFold(x: { heating: string | null | undefined; cooling: string | null | undefined; heatingUnits?: number; coolingUnits?: number }): HvacFold {
  const h = entries(x.heating), c = entries(x.cooling);
  const heat = h.some(isMs), cool = c.some(isMs);
  const folded: ('heating' | 'cooling')[] = [];
  if (heat && h.every(isMs) && (x.heatingUnits ?? 1) <= 1) folded.push('heating');
  if (cool && c.every(isMs) && (x.coolingUnits ?? 1) <= 1) folded.push('cooling');
  if (heat || cool) return { folded, into: folded.length ? 'mini_split' : null, heat, cool, note: heat && cool ? 'Heat + cool' : cool ? 'Cool only' : heat ? 'Heat only' : null };
  // A HEAT PUMP folds only whole: its heating is the heat pump (plus, at most, a dual-fuel furnace) AND its cooling is
  // the heat pump, each with one unit. Anything else keeps Heating and Cooling as they are.
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const hp = h.some(e => eq(e, HEAT_PUMP)) && h.every(e => eq(e, HEAT_PUMP) || DUAL_FUEL.some(d => eq(e, d)))
    && c.length > 0 && c.every(e => eq(e, HEAT_PUMP_AC)) && (x.heatingUnits ?? 1) <= 1 && (x.coolingUnits ?? 1) <= 1;
  if (hp) return { folded: ['heating', 'cooling'], into: 'heat_pump', heat: false, cool: false, note: null };
  return { folded: [], into: null, heat, cool, note: null };
}
