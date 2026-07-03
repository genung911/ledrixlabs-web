// ─── Ethix — the ethical, user-owned data program ───────────────────────────────
// Homeowners OPT IN (default off, revocable) to sharing anonymized, aggregate,
// NON-personal signals about their home, choose which categories, and (Phase 3) earn
// the money it makes. Ledrix takes at most a thin cost-covering cut — never a profit —
// because it's already paid by the subscription. Phase 1 = consent + control only:
// nothing is aggregated, sold, or paid out. Same env-flag dormancy as lib/entitlement.ts.

export const CONSENT_VERSION = '2026-07-ethix-v1';

// Aggregation / selling / payout stays inert until this is flipped on (Phase 2/3).
export function ethixSellingEnabled(): boolean {
  return process.env.ETHIX_ENABLED === '1';
}

export type EthixCategory = {
  key: string;
  label: string;
  blurb: string;   // one line: what this category is
  shares: string;  // exactly what leaves the home record — aggregate, non-PII
  never: string;   // what is NEVER included
};

// Canonical, non-PII categories. Each is drawn so even the eventual aggregate slice is
// inherently non-identifying. The homeowner picks any subset. This list is the single
// source of truth for both the API (validation) and the UI (rendering).
export const ETHIX_CATEGORIES: EthixCategory[] = [
  {
    key: 'property_basics',
    label: 'Property basics',
    blurb: 'The age and size of the home.',
    shares: 'Year built, square footage, and bed/bath count.',
    never: 'Never your address, or anything that names you.',
  },
  {
    key: 'systems_materials',
    label: 'Systems & materials',
    blurb: 'What your home is built and equipped with.',
    shares: 'The TYPES of systems present — e.g. roof covering, HVAC type, water-heater type.',
    never: 'Never photos, serial numbers, or where in the home they are.',
  },
  {
    key: 'condition_signals',
    label: 'Condition signals',
    blurb: 'How systems in homes hold up over time.',
    shares: 'Counts of findings by system and their severity band (safety / repair / maintenance).',
    never: 'Never the finding text, photos, or anything tying a defect to you.',
  },
  {
    key: 'maintenance_patterns',
    label: 'Maintenance patterns',
    blurb: 'What upkeep real homes get, and how often.',
    shares: 'The kind of service logged and its cadence (e.g. filter changed ~quarterly).',
    never: 'Never your notes, receipts, contractor names, costs, or photos.',
  },
  {
    key: 'regional_context',
    label: 'Regional context',
    blurb: 'Where in the country the home is — broadly.',
    shares: 'Your metro / region only, from a coarsened ZIP.',
    never: 'Never your street, full ZIP, or GPS.',
  },
];

export const ETHIX_CATEGORY_KEYS = ETHIX_CATEGORIES.map((c) => c.key);

// Keep only known category keys, de-duplicated — never trust the client's list.
export function sanitizeCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const known = new Set(ETHIX_CATEGORY_KEYS);
  return Array.from(new Set(input.filter((k) => typeof k === 'string' && known.has(k)) as string[]));
}
