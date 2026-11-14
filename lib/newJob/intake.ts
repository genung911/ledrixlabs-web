// The phone's New Inspection choices, for the website's form (owner 2026-11-05: office work on the website as well as the
// phone). Kept equal to ledrix-app's lists — scripts/verify-office-web.mjs compares them with
//   HOME_TYPES / DELTA_OPTIONS (src/core/taxonomy/homeProfile.ts) and
//   WATER_SOURCE_OPTIONS / SEWER_TYPE_OPTIONS / GAS_SUPPLY_OPTIONS (src/core/services/InspectionExtrasService.ts),
// so a value the website saves is one the phone and its Home Profile already know.
export const HOME_TYPES = ['Site-Built', 'Manufactured', 'Mobile', 'Multi-Unit', 'Condo/Townhome'] as const;
export const DELTA_OPTIONS = ['ADU', 'Wellhouse', 'Detached Garage', 'Guest House', 'Dual-Fuel Zones', 'Radon Mitigation', 'Crawlspace', 'Pool/Spa', 'Solar'];
export const WATER_SOURCE_OPTIONS = ['Public', 'Well', 'Shared well', 'Cistern'] as const;
export const SEWER_TYPE_OPTIONS = ['Public sewer', 'Septic', 'Shared septic', 'Lagoon'] as const;
export const GAS_SUPPLY_OPTIONS = ['Natural gas', 'Propane', 'No gas service'] as const;   // 2026-11-13 (owner): was "None — all electric"
/** SEVERAL ANSWERS (owner 2026-11-14: "a house can have multiple. This is for all of the screens") — the app's
 *  InspectionExtrasService.togglePick: picks kept in one field joined with ", " in the options' order; an absence
 *  ("No gas service") stands alone and any other pick clears it. */
const ABSENCE_PICKS = new Set(['No gas service', 'None — all electric', 'None']);
export const splitPicks = (v: string | null | undefined): string[] => String(v ?? '').split(',').map(x => x.trim()).filter(Boolean);
export function togglePick(current: string | null | undefined, opt: string, options: readonly string[]): string {
  const now = splitPicks(current);
  if (now.includes(opt)) return now.filter(x => x !== opt).join(', ');
  if (ABSENCE_PICKS.has(opt)) return opt;
  const next = [...now.filter(x => !ABSENCE_PICKS.has(x)), opt];
  return [...options.filter(o => next.includes(o)), ...next.filter(x => !options.includes(x))].join(', ');
}
/** The phone's stock fallback when a company type has no template of its own (AddInspectionScreen TYPE_DEFAULT_TEMPLATE). */
export const TYPE_DEFAULT_TEMPLATE: Record<string, string> = { 'Full Home Inspection': 'internachi', '4-Point': 'fourpoint' };
/** Dollars → invoice cents (whole cents, never negative). */
export const cents = (dollars: number) => Math.max(0, Math.round((Number(dollars) || 0) * 100));
