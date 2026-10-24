// ─── guidedOrder — Guided Coverage's step list (first production increment, 2026-10-24) ──────────
//
// Guided Coverage walks the inspector through Scope one item at a time, in template order, with an
// explicit Back / Next. It is a NEW ARRANGEMENT of Scope, not a second checklist: the steps are
// exactly the rows Scope's own system page would draw, in the order it draws them.
//
// ── WHAT THIS DECIDES, AND WHAT IT IS HANDED ──────────────────────────────────────────────────
// It decides only ORDER and GROUPING. Everything that says what a row is comes from the caller,
// which passes production's own functions:
//   · tilesOf   — the system's component cards (ScopeScreen's tileNodesOf)
//   · rowsOf    — a card's rows: Scope's row source, scopeRowsFor — the leaf filter, the legacy
//                 pairing and applicability (isSpecNodeActive, which keeps recorded work: Rule 0).
//                 Because this is Scope's own source, a spec answer that adds or removes an item
//                 (a gas furnace adds the Flue) changes the steps the same way it changes the page.
//   · drawnInside — a row ScopeRowList draws INSIDE another (a per-type condition card inside its
//                 host, a method row inside a covering host) joins that row's step, never its own.
//   · kindOf    — DESCRIPTION / EQUIPMENT / COMPONENT, from data the caller reads.
// Nothing here reads a store, scores progress, or writes anything. Completion stays
// subtreeProgress's (the one progress model); the position is derived, never stored.
//
// IMPORT-FREE, so `verify:guided-order` executes this file under plain Node against the real pack
// and the real resolver. The first import someone adds ends that.

export type GuidedNodeLike = { id: string; label?: string };

export type GuidedStepKind = 'description' | 'equipment' | 'component';

export type GuidedStep = {
  /** The step's identity: its head row's id. Stable while that row is applicable. */
  key:         string;
  label:       string;
  /** The head row first, then every row drawn inside it, in the order Scope lists them. */
  rowIds:      string[];
  systemId:    string;
  systemLabel: string;
  tileId:      string;
  tileLabel:   string;
  kind:        GuidedStepKind;
};

export type GuidedOrderDeps<N extends GuidedNodeLike> = {
  tilesOf:     (system: N) => readonly N[];
  rowsOf:      (tile: N) => readonly N[];
  /** The row (among `rows`) that `row` is drawn inside, or undefined when it is drawn on its own. */
  drawnInside: (row: N, rows: readonly N[]) => N | undefined;
  kindOf:      (row: N) => GuidedStepKind;
};

/** Every step for the given systems, in the order given (the caller passes Scope's section order). */
export function guidedSteps<N extends GuidedNodeLike>(systems: readonly N[], deps: GuidedOrderDeps<N>): GuidedStep[] {
  const out: GuidedStep[] = [];
  const seen = new Set<string>();
  for (const sys of systems) {
    for (const tile of deps.tilesOf(sys)) {
      const rows = deps.rowsOf(tile);
      const byHead = new Map<string, GuidedStep>();
      for (const row of rows) {
        if (seen.has(row.id)) continue;   // a row reachable twice is one step, at its first place
        const host = deps.drawnInside(row, rows);
        if (host && host.id !== row.id) continue;   // joins its host's step below
        const step: GuidedStep = {
          key: row.id, label: row.label ?? row.id, rowIds: [row.id],
          systemId: sys.id, systemLabel: sys.label ?? sys.id,
          tileId: tile.id, tileLabel: tile.label ?? tile.id,
          kind: deps.kindOf(row),
        };
        byHead.set(row.id, step);
        seen.add(row.id);
        out.push(step);
      }
      for (const row of rows) {
        const host = deps.drawnInside(row, rows);
        if (!host || host.id === row.id || seen.has(row.id)) continue;
        const step = byHead.get(host.id);
        if (!step) continue;   // a host that is not itself a step draws nothing: nor does this
        step.rowIds.push(row.id);
        seen.add(row.id);
      }
    }
  }
  return out;
}

/** The step holding `nodeId` (its head or a row drawn inside it), or -1. */
export function stepIndexOf(steps: readonly GuidedStep[], nodeId: string | null | undefined): number {
  if (!nodeId) return -1;
  return steps.findIndex(s => s.rowIds.includes(nodeId));
}

/** Where to resume: the first step not complete at or after `from`, then from the top, else `from`
 *  clamped. Read from saved data by the caller's `isComplete` — nothing about the walk is stored. */
export function resumeIndex(steps: readonly GuidedStep[], isComplete: (s: GuidedStep) => boolean, from = 0): number {
  if (!steps.length) return -1;
  const start = Math.min(Math.max(from, 0), steps.length - 1);
  for (let i = start; i < steps.length; i++) if (!isComplete(steps[i])) return i;
  for (let i = 0; i < start; i++) if (!isComplete(steps[i])) return i;
  return start;
}

/** After the list is recomputed (a spec answer added or removed items), where the walk stands:
 *  the same step when it still exists; otherwise the step that now follows its old place — the
 *  nearest LATER step of the old list that survived — so the inspector is never thrown backwards. */
export function reconcileIndex(prev: readonly GuidedStep[], next: readonly GuidedStep[], key: string | null | undefined): number {
  if (!next.length) return -1;
  if (!key) return 0;
  const same = next.findIndex(s => s.key === key);
  if (same >= 0) return same;
  const at = prev.findIndex(s => s.key === key);
  if (at >= 0) {
    for (let i = at + 1; i < prev.length; i++) {
      const j = next.findIndex(s => s.key === prev[i].key);
      if (j >= 0) return j;
    }
  }
  return next.length - 1;
}

/** The step's place within its own system: 1-based position and the system's step count. */
export function positionInSystem(steps: readonly GuidedStep[], index: number): { n: number; of: number } {
  const cur = steps[index];
  if (!cur) return { n: 0, of: 0 };
  const sys = steps.filter(s => s.systemId === cur.systemId);
  return { n: sys.findIndex(s => s.key === cur.key) + 1, of: sys.length };
}

/** Does a move from step `from` to step `to` cross into another system? Both must exist. A
 *  system-boundary transition is shown only for these moves (2026-10-24 UX refinement). */
export function crossesSystem(steps: readonly GuidedStep[], from: number, to: number): boolean {
  const a = steps[from], b = steps[to];
  return !!a && !!b && a.systemId !== b.systemId;
}

/** A system's place in the walk and its own progress, for the step at `index`: which system of the
 *  walk it is (1-based, in walk order), how many steps it has, and how many of those are complete. */
export function systemSummary(
  steps: readonly GuidedStep[], index: number, isComplete: (s: GuidedStep) => boolean,
): { systemId: string; systemLabel: string; n: number; of: number; steps: number; done: number } | null {
  const cur = steps[index];
  if (!cur) return null;
  const order: string[] = [];
  for (const s of steps) if (!order.includes(s.systemId)) order.push(s.systemId);
  const mine = steps.filter(s => s.systemId === cur.systemId);
  return {
    systemId: cur.systemId, systemLabel: cur.systemLabel,
    n: order.indexOf(cur.systemId) + 1, of: order.length,
    steps: mine.length, done: mine.filter(isComplete).length,
  };
}

export const GUIDED_KIND_LABEL: Readonly<Record<GuidedStepKind, string>> = {
  description: 'DESCRIPTION',
  equipment:   'EQUIPMENT CONDITION',
  component:   'COMPONENT',
};
