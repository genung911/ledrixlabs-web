// ─── houseRuleFields — the house facts a COMPANY rule may read (owner 2026-11-14) ────────────────────────────────────
//
// Approved mockup https://claude.ai/artifact/T3Vyt8FwMq4tKCTck6Eao7 ("Approved"): one "Shows when…" picker, and the house
// facts are just more fields in it — "Well Pump Pressure Switch shows when Water is Well". A house fact is the job's own
// answer (Before you start), read by the rules as a `house::` key (houseFacts.HOUSE_SPEC_KEYS); a company rule names it as
// its field (`house::water`) and templateRules compiles it to that key. The presence questions (Attic, Stairs, Deck,
// Gutters, Laundry) are ordinary item fields already; the year built is the era (`era`), not a rule field.
//
// The choices are the job's own lists (InspectionExtrasService) — verify:shows-when checks they stay equal.
// PURE and import-free: byte-copied to the website (scripts/web-preview-sync.json).

export type HouseRuleField = { field: string; label: string; options: readonly string[] };

export const HOUSE_RULE_FIELDS: readonly HouseRuleField[] = [
  { field: 'house::gas', label: 'Gas', options: ['Natural gas', 'Propane', 'No gas service'] },
  { field: 'house::water', label: 'Water', options: ['Public', 'Well', 'Shared well', 'Cistern'] },
  { field: 'house::sewer', label: 'Sewer', options: ['Public sewer', 'Septic', 'Shared septic', 'Lagoon'] },
  { field: 'house::garage', label: 'Garage', options: ['None', 'Attached', 'Detached', 'Carport'] },
];

export const isHouseRuleField = (field: unknown): boolean => typeof field === 'string' && HOUSE_RULE_FIELDS.some(h => h.field === field);
export const houseRuleField = (field: unknown): HouseRuleField | undefined => HOUSE_RULE_FIELDS.find(h => h.field === field);
