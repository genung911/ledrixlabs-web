// ─── supplyTemp — a mini-split head's supply-air temperature (owner 2026-11-13: "each head can get a heat and cool temp in
// one spot if needed"; mockup GgddZui9XEgZBFwJFCR7Q1, no room temperature) ──────────────────────────────────────────────
// Two optional fields per head, `heat_supply` and `cool_supply`, entered on one wheel in whole °F and stored as the
// printed text ("104 °F"), or "Not tested". Pure: the wheel, the report table and the website read the same helpers.
// NO IMPORTS (verify:supply-temps executes it).

export const NOT_TESTED = 'Not tested';
export const TEMP_MIN = 40, TEMP_MAX = 140;
/** The wheel's numbers, 40–140 °F. */
export const TEMP_VALUES: readonly number[] = Array.from({ length: TEMP_MAX - TEMP_MIN + 1 }, (_, i) => TEMP_MIN + i);
/** Where the wheel starts for an unrecorded field: a working heat pump's heat ~100 °F, cooling ~55 °F. */
export const TEMP_START: Readonly<Record<string, number>> = { heat_supply: 100, cool_supply: 55, return_temp: 70 };   // return: a heat pump's return air (2026-11-13)

export const formatTemp = (n: number): string => `${Math.round(n)} °F`;
/** The degrees a stored value says, or null ("Not tested", blank, anything else). */
export function parseTemp(v: string | null | undefined): number | null {
  const m = /^\s*(\d{2,3})\s*°?\s*F?\s*$/i.exec(String(v ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= TEMP_MIN && n <= TEMP_MAX ? n : null;
}
/** How a stored value reads in a table cell: the temperature, "Not tested", or an em dash for nothing recorded. */
export function tempCell(v: string | null | undefined): string {
  const n = parseTemp(v);
  if (n != null) return formatTemp(n);
  return String(v ?? '').trim().toLowerCase() === NOT_TESTED.toLowerCase() ? NOT_TESTED : '—';
}
