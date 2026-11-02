// Shared "does this footprint room's freeform AI-generated text refer to this Scope room
// node?" matcher. Was previously duplicated in ScopeSuggestionService.ts (with a whole-word
// token-overlap fallback) and independently reinvented, WEAKER, in FloorPlanService.ts (phrase
// containment only) — the two silently drifted, and the floor plan's stricter version was
// failing to match real VLM phrasing ("open concept living space" vs. a Scope room labeled
// "Living Room": no contiguous substring in either direction, but they share the word "living").
// One matcher, used everywhere this problem comes up.
const STOP = new Set(['the', 'and', 'for', 'with', 'unit', 'system', 'type', 'home', 'house', 'a', 'an', 'of']);

export function norm(s?: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(s?: string): string[] {
  return norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w));
}

/** Clean a freeform room label from speech/VLM before it becomes footprint/plan truth:
 *  strip punctuation ("Stairs." → "Stairs"), collapse immediate repeats ("Loft. Loft." →
 *  "Loft"), Title Case, cap at 4 words. Raw transcripts and model replies both leak
 *  artifacts — labels are DATA here, so they get normalized at the door. */
export function cleanRoomLabel(raw?: string): string {
  const words = (raw ?? '')
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (out.length && out[out.length - 1].toLowerCase() === w.toLowerCase()) continue;
    out.push(w);
  }
  return out.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** Does an existing template room node already cover this footprint room name? */
export function roomCovered(footprintRoom?: string, nodeLabel?: string): boolean {
  const hay = norm(nodeLabel);
  const needle = norm(footprintRoom);
  if (!hay || !needle) return false;
  if (hay.includes(needle) || needle.includes(hay)) return true;   // phrase containment either way
  const a = new Set(tokenize(footprintRoom));
  return tokenize(nodeLabel).some(t => a.has(t));                  // whole-word overlap ("bathroom")
}
