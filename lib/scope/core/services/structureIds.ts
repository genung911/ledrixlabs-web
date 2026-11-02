// ─── structureIds — the two things both the service and the store need ───────────────
//
// Split out to break a require cycle, not because structures needed another file.
// `structuresStore` needs `MAIN_STRUCTURE_ID` to resolve the legacy sentinel; `StructureService`
// needs `structuresStore` to dual-write. Each importing the other is the same cycle A1 hit, and
// the fix is the same: the shared VALUE moves somewhere neither owns.
//
// `StructureService` re-exports both, so its nineteen importers are untouched.

/**
 * The primary dwelling's sentinel — NOT an id.
 *
 * `MAIN_STRUCTURE` is synthesized and never stored, `scopedNodeKey` leaves the primary's keys
 * unprefixed, and `specsStore` writes `undefined` rather than 'main'. It appears in no stored key
 * and on no stored row, which is exactly what made giving the primary building a real per-home id
 * (B3, owner's option 2) cost nothing in stored data.
 */
export const MAIN_STRUCTURE_ID = 'main';

export type StructureKind =
  'primary' | 'adu' | 'shop' | 'guest_house' | 'outbuilding' | 'garage' | 'other';
