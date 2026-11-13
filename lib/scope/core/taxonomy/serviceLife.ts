// ── EXPECTED SERVICE LIFE (owner 2026-11-12: "Add expected life ranges to template builder for companies to set and use
// those ages you gave as defaults. I think those are accurate.") ──────────────────────────────────────────────────────
// The typical life of each kind of equipment, in years. Ledrix drafts a "past its typical service life" finding for a
// unit OLDER than `high` — a draft in Findings, which the inspector keeps or rejects (LifeExpectancyService).
//
// LEDRIX'S DEFAULTS are the owner's table of 2026-11-12. A COMPANY template may change any of them (`serviceLives`, by
// id — "Reset to Ledrix" removes the entry); an INSPECTION captures the effective list when it is created
// (`serviceLifeDefinitions`), like the count rules, so a later template change cannot change what it already drafted.
// Boiler and roof were not in the owner's table and keep the earlier InterNACHI-based numbers.

export interface ServiceLife {
  id: string;
  /** What the report and the builder call it. */
  label: string;
  /** The start of the typical replacement window, in years. */
  low: number;
  /** The end of it: a unit older than this is past its typical service life. */
  high: number;
}

export const LEDRIX_SERVICE_LIVES: readonly ServiceLife[] = [
  { id: 'water_heater_tank',     label: 'Tank water heater',     low: 8,  high: 12 },
  { id: 'water_heater_tankless', label: 'Tankless water heater', low: 15, high: 20 },
  { id: 'furnace',               label: 'Gas furnace',           low: 15, high: 20 },
  { id: 'boiler',                label: 'Boiler',                low: 20, high: 35 },
  { id: 'heat_pump',             label: 'Heat pump',             low: 10, high: 15 },
  { id: 'ac',                    label: 'A/C condenser',         low: 10, high: 15 },
  { id: 'roof',                  label: 'Roof covering',         low: 17, high: 20 },
];

const clean = (n: unknown): number | null => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 1 && v <= 100 ? v : null;
};

/** The effective list: an inspection's captured definitions; else Ledrix's with the company's changes (by id). */
export function serviceLivesOf(tpl: { serviceLifeDefinitions?: ServiceLife[]; serviceLives?: Array<Partial<ServiceLife> & { id: string }> } | null | undefined): ServiceLife[] {
  if (tpl && Array.isArray(tpl.serviceLifeDefinitions) && tpl.serviceLifeDefinitions.length) return tpl.serviceLifeDefinitions.map(x => ({ ...x }));
  const changes = new Map((tpl?.serviceLives ?? []).filter(c => c && typeof c.id === 'string').map(c => [c.id, c]));
  return LEDRIX_SERVICE_LIVES.map(d => {
    const c = changes.get(d.id);
    if (!c) return { ...d };
    const low = clean(c.low) ?? d.low;
    const high = clean(c.high) ?? d.high;
    return { ...d, low: Math.min(low, high), high: Math.max(low, high) };
  });
}

/** Which kind of equipment a unit is, from its words (category, type, material). Tankless before tank. */
export function serviceLifeKindOf(text: string): string | null {
  const t = String(text ?? '');
  if (/water.?heater|\bwh\b/i.test(t)) return /tankless|on.?demand|instant/i.test(t) ? 'water_heater_tankless' : 'water_heater_tank';
  if (/boiler/i.test(t)) return 'boiler';
  if (/heat.?pump/i.test(t)) return 'heat_pump';
  if (/(central )?air.?cond|a\/?c\b|condenser|cooling/i.test(t)) return 'ac';
  if (/furnace|heating/i.test(t)) return 'furnace';
  if (/roof|shingle/i.test(t)) return 'roof';
  return null;
}

/** The life for a unit's words, from a list (the inspection's, else Ledrix's). */
export function serviceLifeFor(text: string, lives: readonly ServiceLife[] = LEDRIX_SERVICE_LIVES): ServiceLife | null {
  const kind = serviceLifeKindOf(text);
  return kind ? lives.find(l => l.id === kind) ?? LEDRIX_SERVICE_LIVES.find(l => l.id === kind) ?? null : null;
}

/** Past its typical service life: strictly older than the window's end. */
export const isPastServiceLife = (age: number, life: ServiceLife): boolean => age > life.high;
