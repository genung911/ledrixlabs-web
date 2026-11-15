// ─── eraItems — the Template Builder's "Era items in this template" (x2 phase 2, owner 2026-11-14) ──────────────────
//
// Approved mockup https://claude.ai/artifact/V5QHLXYzFcCuFF4RduCqb7 (x2): "'Older homes' and its year box go. Each era item
// says when it shows; the year built at intake decides, per job. No year built = all show." Each item that carries an
// era — Ledrix's (a `house::built` bound in the pack) or the company's own (`node.era`) — is one row: when it shows,
// Change, and whether this template has it. The company's year REPLACES Ledrix's when the template's rules are captured
// (templateRules.definitionFor); clearing it returns to Ledrix's.
//
// PURE and import-free (types only): byte-copied to the website (scripts/web-preview-sync.json).
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';
import type { TemplateOp } from './templateOps';

export type Era = { before?: number; from?: number; through?: number };
export type EraRow = {
  id: string; label: string; systemId: string; systemLabel: string;
  /** What the template uses: the company's year when set, else Ledrix's. */
  era: Era;
  /** Ledrix's own years for the item (null for a company's own item). */
  ledrix: Era | null;
  /** The company changed the years. */
  own: boolean;
  /** Where it is: in the checklist, set aside, or not in this template (Ledrix offers it). */
  state: 'active' | 'set_aside' | 'missing';
};
type PackNode = { id: string; label?: string; requires?: unknown };

const isEraKey = (p: any) => !!p && p.specNodeId === 'house::built';
/** Ledrix's era for an item: its `house::built` bound in the pack. */
export function ledrixEraOf(pack: PackNode | undefined): Era | null {
  const p = (Array.isArray(pack?.requires) ? pack!.requires as any[] : []).find(isEraKey);
  if (!p) return null;
  const e: Era = {};
  for (const k of ['before', 'from', 'through'] as const) if (Number.isInteger(p[k])) e[k] = p[k];
  return Object.keys(e).length ? e : null;
}
/** A company's own era on a node (`node.era`), when it is well formed. */
export function ownEraOf(node: TemplateNode | undefined | null): Era | null {
  const e = (node as any)?.era;
  if (!e || typeof e !== 'object') return null;
  const out: Era = {};
  for (const k of ['before', 'from', 'through'] as const) if (Number.isInteger(e[k])) out[k] = e[k];
  return Object.keys(out).length ? out : null;
}

/** "built before 1950" · "built 1978–1995" · "built 1965 or later" · "built through 1990". */
export function eraWords(e: Era | null | undefined): string {
  if (!e) return 'every year';
  if (e.from !== undefined && e.through !== undefined) return `built ${e.from}–${e.through}`;
  const parts = [e.from !== undefined ? `${e.from} or later` : '', e.through !== undefined ? `through ${e.through}` : '', e.before !== undefined ? `before ${e.before}` : ''].filter(Boolean);
  return parts.length ? `built ${parts.join(', ')}` : 'every year';
}

type Found = { node: TemplateNode; system: TemplateNode; setAside: boolean };
function findIn(tpl: InspectionTemplate, id: string): Found | null {
  let out: Found | null = null;
  const walk = (n: TemplateNode, system: TemplateNode, setAside: boolean) => {
    if (out) return;
    if (n.id === id) { out = { node: n, system, setAside }; return; }
    for (const c of n.children ?? []) walk(c, system, setAside);
    for (const c of n.trimmed ?? []) walk(c, system, true);
  };
  for (const s of tpl.systems ?? []) walk(s, s, false);
  for (const s of tpl.trimmedSystems ?? []) walk(s, s, true);
  return out;
}

/** Every era item, for this template: Ledrix's (whether or not the template has them) and the company's own. */
export function eraRows(tpl: InspectionTemplate, packNodes: Iterable<PackNode>, packSystemOf: (id: string) => { id: string; label: string } | undefined): EraRow[] {
  const rows: EraRow[] = [];
  const seen = new Set<string>();
  for (const p of packNodes) {
    const ledrix = ledrixEraOf(p);
    if (!ledrix) continue;
    const f = findIn(tpl, p.id);
    const own = ownEraOf(f?.node);
    const sys = f ? { id: f.system.id, label: f.system.label } : packSystemOf(p.id) ?? { id: '', label: '' };
    rows.push({ id: p.id, label: f?.node.label ?? p.label ?? p.id, systemId: sys.id, systemLabel: sys.label, era: own ?? ledrix, ledrix, own: !!own,
      state: !f ? 'missing' : f.setAside ? 'set_aside' : 'active' });
    seen.add(p.id);
  }
  const walk = (n: TemplateNode, system: TemplateNode, setAside: boolean) => {
    const own = ownEraOf(n);
    if (own && !seen.has(n.id)) { rows.push({ id: n.id, label: n.label, systemId: system.id, systemLabel: system.label, era: own, ledrix: null, own: true, state: setAside ? 'set_aside' : 'active' }); seen.add(n.id); }
    for (const c of n.children ?? []) walk(c, system, setAside);
    for (const c of n.trimmed ?? []) walk(c, system, true);
  };
  for (const s of tpl.systems ?? []) walk(s, s, false);
  return rows;
}

/** Change an item's years (null = back to Ledrix's). */
export const setEraOps = (id: string, era: Era | null): TemplateOp[] => [{ op: 'setNodeField', nodeId: id, field: 'era', value: era } as TemplateOp];

/** Add one of Ledrix's era items to this template: restore it when set aside; else copy it from Ledrix's template into
 *  the same group there (by the group's id, else its name), else under its system. Never carries `requires` (the rules are
 *  the pack's). Null when it cannot be placed. */
export function addEraItemOps(tpl: InspectionTemplate, id: string, ledrixDefault: InspectionTemplate): TemplateOp[] | null {
  const here = findIn(tpl, id);
  if (here) return here.setAside ? [{ op: 'restoreNode', nodeId: id } as TemplateOp] : [];
  const src = findIn(ledrixDefault, id);
  if (!src) return null;
  const parentInSource = (() => { let p: TemplateNode | null = null; const w = (n: TemplateNode) => { if (p) return; if ((n.children ?? []).some(c => c.id === id)) { p = n; return; } (n.children ?? []).forEach(w); }; w(src.system); return p as TemplateNode | null; })();
  const sys = (tpl.systems ?? []).find(s => s.id === src.system.id);
  if (!sys) return null;
  const group = parentInSource && parentInSource !== src.system
    ? (sys.children ?? []).find(c => c.id === parentInSource.id) ?? (sys.children ?? []).find(c => c.kind === 'subsystem' && c.label === parentInSource.label)
    : null;
  const { requires: _r, ...node } = src.node as TemplateNode & { requires?: unknown };
  return [{ op: 'addNode', parentId: (group ?? sys).id, node: node as TemplateNode } as TemplateOp];
}
