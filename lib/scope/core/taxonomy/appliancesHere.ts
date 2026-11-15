// ─── appliancesHere — "Which appliances are here?" in Before you start (owner 2026-11-15) ───────────────────────────────
//
// Mockup https://claude.ai/artifact/T3Vyt8FwMq4tKCTck6Eao7 (board 4, "Approved"), built as OPTION A (owner 2026-11-15,
// "Option a"): no new house fact and no server column. Each appliance the inspector does NOT pick is marked on its own
// row with the limitation every row already offers — "Not Present" (ScopeRowList's LIMIT tap, stored "Not Present
// (Limitation)" in the condition-state store, synced like any row). The row is answered, and the report prints it.
//
//   · The list is THIS TEMPLATE'S appliance items: every item of the Appliances system, so a company's own "Trash
//     Compactor" is listed too. Set-aside items (`trimmed`) and links (`pointsTo`) are not.
//   · A tile reads its row: off when the row holds exactly the Not Present mark, on otherwise.
//   · RECORDED WORK STAYS: a row holding anything else (OK, another limitation, a finding) is never marked Not present —
//     the tile stays on and says why. Turning a tile back on clears only the Not Present mark this page wrote.
//   · Not counted in Before you start's "answers left": every tile starts on (here), so nothing is owed.
//
// NO IMPORTS, so `verify:appliances-here` can execute it; byte-copied to the website (scripts/web-preview-sync.json).

type Node = { id: string; label?: string; children?: Node[]; pointsTo?: unknown; condition?: boolean };

/** The row's stored mark — scopeRules.limitationValue('Not Present'), spelled here (the guard checks they agree). */
export const APPLIANCE_NOT_PRESENT = 'Not Present (Limitation)';
/** The Appliances system's base id (a second copy is `appliances~i2`). */
export const APPLIANCES_SYSTEM = 'appliances';

/** Shorter tile names for Ledrix's own items (the item labels name the field: "Range / Cooktop Fuel"). */
const TILE_NAME: Readonly<Record<string, string>> = {
  kit_range: 'Range / cooktop', kit_oven: 'Oven', kit_fridge: 'Refrigerator', kit_dishwasher: 'Dishwasher',
  kit_disposal: 'Disposal', kit_hood: 'Range hood', kit_microwave: 'Microwave',
};

export type ApplianceItem = { id: string; label: string };

/** The appliance items this template has, in its order: the leaf items under the Appliances system. */
export function applianceItems(systems: readonly Node[] | null | undefined): ApplianceItem[] {
  const out: ApplianceItem[] = [];
  const walk = (n: Node) => {
    if (n.pointsTo) return;
    const kids = n.children ?? [];
    if (!kids.length) { if (n.condition !== false) out.push({ id: n.id, label: TILE_NAME[n.id] ?? String(n.label ?? n.id) }); return; }
    kids.forEach(walk);
  };
  for (const s of systems ?? []) if (String(s.id).split('~i')[0] === APPLIANCES_SYSTEM) (s.children ?? []).forEach(walk);
  return out;
}

export type ApplianceState = {
  item: ApplianceItem;
  /** On the page: here (on) or not (off). */
  here: boolean;
  /** Why the tile cannot be turned off (the row holds recorded work); null when it can. */
  locked: string | null;
};

/** Each appliance's tile, read from its row: its condition values and how many findings it has. */
export function applianceStates(items: readonly ApplianceItem[], conditionOf: (nodeId: string) => readonly string[],
  findingsOf: (nodeId: string) => number): ApplianceState[] {
  return items.map(item => {
    const vals = conditionOf(item.id);
    const notHere = vals.length === 1 && vals[0] === APPLIANCE_NOT_PRESENT;
    const f = findingsOf(item.id);
    const locked = notHere ? null
      : f > 0 ? `${f} finding${f === 1 ? '' : 's'}`
      : vals.length ? (vals.some(v => /\(limitation\)\s*$/i.test(v)) ? 'a limitation' : 'a Satisfactory mark')
      : null;
    return { item, here: !notHere, locked };
  });
}

/** The row's values after a tap, or null when the tap must not write (recorded work stays, or nothing changes). */
export function applianceTap(state: ApplianceState, current: readonly string[]): string[] | null {
  if (state.here) return state.locked || current.length ? null : [APPLIANCE_NOT_PRESENT];   // mark it not here
  return current.length === 1 && current[0] === APPLIANCE_NOT_PRESENT ? [] : null;            // bring it back
}

/** The summary line ("This house has"): All here · None · Not here: Disposal and Trash compactor. */
export function appliancesDisplay(states: readonly ApplianceState[]): string {
  const off = states.filter(s => !s.here).map(s => s.item.label);
  if (!off.length) return 'All here';
  if (off.length === states.length) return 'None';
  return `Not here: ${off.length === 1 ? off[0] : `${off.slice(0, -1).join(', ')} and ${off[off.length - 1]}`}`;
}
