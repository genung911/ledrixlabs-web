// filterSize — the stored form of a filter size, shared by the wheels (DimensionWheels), the system-photo reader and
// anything else that reads a Filter › Size answer (owner 2026-11-08, mockup LeXpR9DGHKtZU3e5e7hjTg). PURE.
//
// One entry per size: "20x20x1" — the form Ledrix Home's filter reminder and the filter-photo reader already use
// (filterRead.normalizeFilterSize) — and "20x20x1 × 2" when the house takes more than one.
export type SizeRow = { w: number; h: number; d: number; q: number };
export const DEFAULT_ROW: SizeRow = { w: 20, h: 20, d: 1, q: 1 };
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** The wheels: width and height 8–36, depth in the sizes filters come in, a quantity 1–9. A typed size joins its wheel. */
export const WHEEL_COLUMNS = { w: range(8, 36), h: range(8, 36), d: [1, 2, 4, 5, 6], q: range(1, 9) } as const;

/** "16x25x1" / "16 X 25 X 1" / '16"x25"x1"' / "16x25x1 × 2" → a row; null when it is not a size. */
export function parseSizeEntry(v: string): SizeRow | null {
  const m = String(v ?? '').trim().match(/^(\d{1,2})\s*(?:"|”|in)?\s*[x×X]\s*(\d{1,2})\s*(?:"|”|in)?\s*[x×X]\s*(\d{1,2})\s*(?:"|”|in)?(?:\s*[×xX]\s*(\d{1,2}))?$/);
  if (!m) return null;
  const r = { w: +m[1], h: +m[2], d: +m[3], q: m[4] ? Math.max(1, +m[4]) : 1 };
  return r.w > 0 && r.h > 0 && r.d > 0 ? r : null;
}
/** A row → the stored entry: "20x20x1", or "20x20x1 × 2" for more than one. */
export function formatSizeEntry(r: SizeRow): string {
  return `${r.w}x${r.h}x${r.d}${r.q > 1 ? ` × ${r.q}` : ''}`;
}
