// ─── answerShapes — one answer shaping how another field is offered and titled (owner 2026-11-07) ──────────────────
//
// Mockup https://claude.ai/artifact/7W41vFJnKg12JmmQWreorf → "approved yes on all 3". The furnace's efficiency class
// shapes its venting choices and its title:
//
//   offeredValues   a field's `offeredWhen` (pack): while the answer it names EQUALS a value, the field offers only the
//                   listed choices — Furnace Flue / Venting on a 90%+ furnace offers PVC (High-Eff) and Direct Vent
//                   (Sealed). NEVER a removal: a choice already picked stays offered, "+ Add" still takes anything, and a
//                   list that would come out empty (a company renamed every choice) offers them all. A rule reading an
//                   unanswered or several-valued answer does nothing.
//   titleFromType   a row titled by its picked type (`typeTitle`: the Furnace → "Gas Furnace"), with an optional class
//                   prefix from another answer ("90% Gas Furnace") — only for the types the prefix names, so a heat
//                   pump with a leftover efficiency answer never reads "90% Heat Pump". Display only.
//
// PURE — no store, no React. Scope (useSpecField, ScopeRowList) passes a reader; the website's phone preview runs a
// byte-identical copy against its own picks (verify:furnace-class).

export type OfferRule = { specNodeId: string; equals: string; values: readonly string[] };
export type TypeTitle = {
  field: string;
  map?: Record<string, string>;
  prefix?: { field: string; onlyFor?: readonly string[]; map: Record<string, string> };
};
/** Reads a stored answer by its key: a bare id (a one-field item) or `host::field`. */
export type ReadAnswer = (key: string) => string | null | undefined;

const one = (v: string | null | undefined): string | null => {
  const e = String(v ?? '').split(',').map(x => x.trim()).filter(Boolean);
  return e.length === 1 ? e[0] : null;
};

/** The choices a field offers now, in its own order. */
export function offeredValues(all: readonly string[], picked: readonly string[], rules: readonly OfferRule[] | null | undefined, read: ReadAnswer): string[] {
  if (!Array.isArray(rules) || !rules.length) return [...all];
  const hit = rules.find(r => r && typeof r.specNodeId === 'string' && one(read(r.specNodeId)) === r.equals);
  if (!hit) return [...all];
  const narrowed = all.filter(v => hit.values.includes(v));
  if (!narrowed.length) return [...all];
  return all.filter(v => narrowed.includes(v) || picked.includes(v));
}

/** A row's title: its label, or its picked type through `map`, with the class prefix when it applies. */
export function titleFromType(tt: TypeTitle | null | undefined, label: string, typeValue: string | null | undefined, read: ReadAnswer): string {
  const v = typeValue ? String(typeValue).trim() : '';
  if (!tt || !v) return label;
  const base = tt.map && typeof tt.map[v] === 'string' ? tt.map[v] : v;
  const p = tt.prefix;
  if (!p || (Array.isArray(p.onlyFor) && !p.onlyFor.includes(v))) return base;
  const cls = one(read(p.field));
  const word = cls && typeof p.map?.[cls] === 'string' ? p.map[cls] : null;
  return word ? `${word} ${base}` : base;
}
