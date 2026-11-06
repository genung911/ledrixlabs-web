// Where the builder left off in a template (owner 2026-11-05: "When i go back to Templates will it take me back to where
// I left off editing?" → "yes build it"). Remembered on THIS computer only, per company and per template: the selected
// system / item, the Builder section, the item tab and the type chip of each typed system. It is a convenience, never
// data: the edits themselves are the server draft (useDraft), and nothing here is sent anywhere. Storage can be missing
// or refuse (private window, blocked site data) — every read and write is guarded and a miss simply opens at the start.

export type PlaceSel = { systemId: string | null; nodeId: string | null };
export type Place = {
  sel: PlaceSel;
  section: string;
  ctab: string;
  typePick: Record<string, string>;
  /** Where the editor lives, to go straight back (`/app/templates/<id>` or `/app/templates/new?draft=<id>`). */
  href: string;
  /** What the list's "Continue editing" line says: the template's name, then the system and item. */
  title: string;
  where: string[];
  at: number;
};
type Store = { last: string | null; places: Record<string, Place> };

const KEY = (companyId: string) => `ledrix.templateBuilder.place.${companyId}`;
const MAX_PLACES = 30;

/** The key one template's place is kept under: its id, or its draft for a template that isn't published yet. */
export const placeKey = (templateId: string, draftId: string | null) => (templateId === 'new' && draftId ? `draft:${draftId}` : templateId);

function readStore(companyId: string): Store {
  try {
    const raw = window.localStorage.getItem(KEY(companyId));
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s === 'object' && s.places && typeof s.places === 'object') return { last: typeof s.last === 'string' ? s.last : null, places: s.places };
  } catch { /* no storage, or not ours */ }
  return { last: null, places: {} };
}

export function readPlace(companyId: string, key: string): Place | null {
  const p = readStore(companyId).places[key];
  return p && p.sel && typeof p.section === 'string' ? p : null;
}

/** The template edited most recently on this computer, if any. */
export function readLastPlace(companyId: string): (Place & { key: string }) | null {
  const s = readStore(companyId);
  const p = s.last ? s.places[s.last] : null;
  return p && s.last ? { ...p, key: s.last } : null;
}

export function writePlace(companyId: string, key: string, place: Place): void {
  try {
    const s = readStore(companyId);
    s.places[key] = place;
    s.last = key;
    const keys = Object.keys(s.places).sort((a, b) => (s.places[b].at ?? 0) - (s.places[a].at ?? 0));
    for (const k of keys.slice(MAX_PLACES)) delete s.places[k];
    window.localStorage.setItem(KEY(companyId), JSON.stringify(s));
  } catch { /* storage refused: the place just isn't remembered */ }
}

/** Forget one template's place (a discarded draft, a deleted template). */
export function forgetPlace(companyId: string, key: string): void {
  try {
    const s = readStore(companyId);
    delete s.places[key];
    if (s.last === key) s.last = null;
    window.localStorage.setItem(KEY(companyId), JSON.stringify(s));
  } catch { /* nothing to forget */ }
}
