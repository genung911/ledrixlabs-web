// ─── specialHomes — checkpoints for manufactured, older, multi-unit and log homes and new construction (2026-11-05) ─
//
// Ledrix's pack carries 32 checkpoints that only some homes have (gravity furnace, steam boiler, tie-downs, a shared
// water heater …), tagged `appliesTo` in ledrix.core.json. The shipped default template keeps them SET ASIDE, in one
// group per system ("Special Homes"). The phone's Template Editor was the only place a company could take them one at a
// time; it was deleted 2026-11-05 and the website Template Builder offers them instead, on each system's panel
// (components/templates/SpecialHomesPanel.tsx). Rulings, 2026-11-05 (mockup NZmjwWXEdjvDRYs8ehFiun):
//   1. On each system's panel, under the component catalog.
//   2. The 42 were cleaned to 32 — one copy each, in the system an inspector looks for it.
//   3. An added checkpoint shows on EVERY job using the template; no home-type rule. A company that inspects
//      manufactured homes makes a manufactured template ("we should be making a base template for manufactured homes").
//      The inspector marks it Not present where a house does not have it.
// Starting points by kind of home, the same day (mockup ED2sZJDGCViLHGs1wXjiDg; owner: "use all recommendations, but on
// 3, make the premark association, not inspected an option for the company to check or not"):
//   1. Picking a kind on Templates › New template ticks all its checkpoints; the company unticks (starterOps).
//   2. "Older home" and "Log home" sit under "Also", apart from property type (ALSO_KINDS). Older asks the company's
//      cutoff year — stored on the template (olderCutoffYear), read later only as a scheduling hint.
//   3. Condo / Townhome adds no checkpoints. The company MAY tick "pre-mark roof, foundation and exterior as Not
//      inspected — association responsibility" (associationNotInspected); every NEW job from that template then starts
//      with those systems limited (associationPremarks), which the inspector clears to inspect anyway.
//   4. "Ledrix New Construction" is its own starting point: the base plus the ten new-construction checkpoints.
//   5. The Log home (10) and New construction (10) lists are the owner-approved drafts.
//
// THE LIST below is the company-facing copy (the one-line "why"); the checkpoint itself — id, label, kind — is the
// pack's and the shipped template's. verify:reachable §3b holds the two together: this list is exactly the pack's
// archetype-only coverage nodes, each in the system the pack puts it in, with the tag the pack gives it.
//
// HOW AN ADD LANDS (specialHomeOps): ordinary template operations, applied by the caller as ONE change set (applyManual
// on the website) — validated, all-or-nothing, one undo. The checkpoint keeps the pack id, so findings, Ledrix's
// routing and the report all know what it is.
//   · The template still holds the shipped group, set aside → restore the group, then set aside again every checkpoint
//     in it that was not picked (they stay one click away, under the group).
//   · The group is in the template → restore a picked checkpoint set aside under it, or add it from the shipped template.
//   · Neither → add the group with just the picks; a system that has items but no groups gets the items directly
//     (a group there would hide every existing item from inspectors — EditorParts homesFor).
//   · A group still carrying a label the default shipped before 2026-11-05 ("PLUMBING", "attic" …) is renamed
//     "Special Homes" in the same change set.
//
// PURE: type-only imports, no store, no clock. Copied byte-for-byte to ledrixlabs-web lib/templateBuilder/core
// (scripts/web-preview-sync.json).
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';
import type { TemplateOp } from './templateOps';

export type SpecialKind = 'manufactured' | 'older' | 'multi_unit' | 'log' | 'new_construction';

/** The kinds, with the template property types (propertyTypes.ts) that say a template is for that kind. */
export const SPECIAL_KINDS: ReadonlyArray<{ id: SpecialKind; label: string; propertyTypes: readonly string[] }> = [
  { id: 'manufactured', label: 'Manufactured', propertyTypes: ['manufactured'] },
  { id: 'older',        label: 'Older homes',  propertyTypes: [] },
  { id: 'multi_unit',   label: 'Multi-unit',   propertyTypes: ['multi_unit_one', 'multi_unit_many'] },
  { id: 'log',          label: 'Log home',     propertyTypes: [] },
  { id: 'new_construction', label: 'New construction', propertyTypes: [] },
];

export type SpecialCheckpoint = { id: string; system: string; kind: SpecialKind; why: string };

export const SPECIAL_HOMES: readonly SpecialCheckpoint[] = [
  { id: 'foundation_manufactured_tie_downs',        system: 'foundation', kind: 'manufactured', why: 'Straps, anchors and their tension' },
  { id: 'foundation_manufactured_skirting',         system: 'foundation', kind: 'manufactured', why: 'Condition, ventilation and access' },
  { id: 'foundation_manufactured_marriage_line',    system: 'foundation', kind: 'manufactured', why: 'Where the two halves of a double-wide join' },
  { id: 'foundation_manufactured_belly_wrap',       system: 'foundation', kind: 'manufactured', why: 'Tears, sags and missing patches' },
  { id: 'foundation_multi_unit_shared_foundation',  system: 'foundation', kind: 'multi_unit',   why: 'Foundation shared with other units' },

  { id: 'hvac_manufactured_furnace',                system: 'heating',    kind: 'manufactured', why: 'Label shows it is approved for a manufactured home' },
  { id: 'hvac_manufactured_crossover_duct',         system: 'heating',    kind: 'manufactured', why: 'Duct joining the two halves, under the home' },
  { id: 'attic_manufactured_bellywood_ductwork',    system: 'heating',    kind: 'manufactured', why: 'Supply ducts inside the belly' },
  { id: 'hvac_older_gravity_furnace',               system: 'heating',    kind: 'older',        why: 'No blower; large ducts rising from the basement' },
  { id: 'hvac_older_oil_furnace',                   system: 'heating',    kind: 'older',        why: 'Tank, lines and burner' },
  { id: 'hvac_older_steam_boiler',                  system: 'heating',    kind: 'older',        why: 'Sight glass, pressure and safety controls' },
  { id: 'attic_older_asbestos_ductwrap',            system: 'heating',    kind: 'older',        why: 'Observed only; never identified' },
  { id: 'hvac_multi_unit_shared_plant',             system: 'heating',    kind: 'multi_unit',   why: 'Central boiler or chiller serving several units' },

  { id: 'plumbing_manufactured_water_heater_vent',  system: 'plumbing',   kind: 'manufactured', why: 'Vent through the roof, not the wall' },
  { id: 'plumbing_manufactured_plumbing_tie_downs', system: 'plumbing',   kind: 'manufactured', why: 'Pipe hangers under the belly' },
  { id: 'plumbing_older_galvanized_supply',         system: 'plumbing',   kind: 'older',        why: 'Corrosion and low flow' },
  { id: 'plumbing_older_oil_fired_water_heater',    system: 'plumbing',   kind: 'older',        why: 'Burner, flue and tank' },
  { id: 'plumbing_multi_unit_shared_water_heater',  system: 'plumbing',   kind: 'multi_unit',   why: 'One heater serving several units' },
  { id: 'plumbing_multi_unit_per_unit_water_meter', system: 'plumbing',   kind: 'multi_unit',   why: 'Whether each unit has its own' },

  { id: 'electrical_manufactured_skirt_electrical', system: 'electrical', kind: 'manufactured', why: 'Where wiring passes through the skirting' },
  { id: 'electrical_older_fuse_panel',              system: 'electrical', kind: 'older',        why: 'Fuse sizes and signs of over-fusing' },
  { id: 'electrical_multi_unit_metering',           system: 'electrical', kind: 'multi_unit',   why: 'One meter per unit' },
  { id: 'electrical_multi_unit_shared_systems',     system: 'electrical', kind: 'multi_unit',   why: 'Lights and outlets in shared areas' },

  { id: 'roofing_manufactured_roof_tie_downs',      system: 'roofing',    kind: 'manufactured', why: 'Straps across the roof' },
  { id: 'roofing_manufactured_roof_skirts',         system: 'roofing',    kind: 'manufactured', why: 'Trim where the roof meets the walls' },
  { id: 'roofing_older_roof_built_up_layers',       system: 'roofing',    kind: 'older',        why: 'Number of layers and condition' },
  { id: 'roofing_multi_unit_roof_drainage',         system: 'roofing',    kind: 'multi_unit',   why: 'Gutters and drains serving several units' },

  { id: 'exterior_multi_unit_fire_separation',      system: 'exterior',   kind: 'multi_unit',   why: 'Walls and penetrations between units' },

  { id: 'attic_multi_unit_shared_attic',            system: 'attic',      kind: 'multi_unit',   why: 'Fire separation across a shared attic' },

  { id: 'fireplace_manufactured_fireplace_venting', system: 'fireplace',  kind: 'manufactured', why: 'Listed unit, outside air, chimney' },
  { id: 'fireplace_older_fireplace_chimney',        system: 'fireplace',  kind: 'older',        why: 'Unlined or deteriorated flue' },
  { id: 'fireplace_multi_unit_shared_chimney',      system: 'fireplace',  kind: 'multi_unit',   why: 'One chimney serving several units' },

  // ── Log home (owner-approved draft, 2026-11-05) ──
  { id: 'exterior_log_walls',            system: 'exterior',   kind: 'log', why: 'Checks, cracks and gaps that let water in' },
  { id: 'exterior_log_ends',             system: 'exterior',   kind: 'log', why: 'Exposed log ends, where rot starts' },
  { id: 'exterior_log_chinking',         system: 'exterior',   kind: 'log', why: 'Gaps, cracks and loose chinking between logs' },
  { id: 'exterior_log_finish',           system: 'exterior',   kind: 'log', why: 'Worn finish and bare wood' },
  { id: 'exterior_log_upper_courses',    system: 'exterior',   kind: 'log', why: 'Weathering where the overhangs are short' },
  { id: 'exterior_log_insects',          system: 'exterior',   kind: 'log', why: 'Holes and frass; observed only, never identified' },
  { id: 'foundation_log_sill',           system: 'foundation', kind: 'log', why: 'Splash-back rot at the lowest logs' },
  { id: 'foundation_log_connection',     system: 'foundation', kind: 'log', why: 'How the logs are anchored and sealed to the foundation' },
  { id: 'interior_log_settling_gaps',    system: 'interior',   kind: 'log', why: 'Gaps above frames as the logs settle' },
  { id: 'interior_log_settling_jacks',   system: 'interior',   kind: 'log', why: 'Adjustable posts and framed walls that let the logs settle' },

  // ── New construction: final walkthrough and 11-month warranty check (owner-approved draft, 2026-11-05) ──
  { id: 'exterior_nc_grading',           system: 'exterior',   kind: 'new_construction', why: 'Final grade slopes away; downspouts discharge clear' },
  { id: 'exterior_nc_penetrations',      system: 'exterior',   kind: 'new_construction', why: 'Pipes, vents and wires sealed where they pass through' },
  { id: 'roofing_nc_flashing',           system: 'roofing',    kind: 'new_construction', why: 'Every flashing installed and finished' },
  { id: 'attic_nc_insulation',           system: 'attic',      kind: 'new_construction', why: 'Depth as specified; baffles at the eaves' },
  { id: 'electrical_nc_panel_labeling',  system: 'electrical', kind: 'new_construction', why: 'Every breaker labeled' },
  { id: 'electrical_nc_gfci_afci',       system: 'electrical', kind: 'new_construction', why: 'Protection in each location that requires it' },
  { id: 'hvac_nc_registers',             system: 'heating',    kind: 'new_construction', why: 'Every register delivers air' },
  { id: 'interior_nc_windows_doors',     system: 'interior',   kind: 'new_construction', why: 'Each one opens, closes and latches' },
  { id: 'interior_nc_appliances',        system: 'interior',   kind: 'new_construction', why: 'Each installed appliance runs' },
  { id: 'interior_nc_punch',             system: 'interior',   kind: 'new_construction', why: 'Paint, trim, drywall and finish items for the builder' },
];

export const SPECIAL_GROUP_LABEL = 'Special Homes';
/** What the shipped default called these groups before 2026-11-05 — renamed when the panel touches one. */
const LEGACY_GROUP_LABELS = new Set(['Special Systems', 'PLUMBING', 'ELECTRICAL', 'ROOFING', 'FOUNDATION', 'EXTERIOR', 'attic', 'INTERIOR', 'FIREPLACE']);
const SPECIAL_IDS = new Set(SPECIAL_HOMES.map(s => s.id));

/** A copied system ('heating~2') carries renamed ids; the panel offers special checkpoints on the original only. */
export const isCopiedSystem = (system: Pick<TemplateNode, 'id'>): boolean => /~\d+$/.test(system.id);

// ── finding things ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Where `id` sits under the active systems. `pocket`: set aside (reached through a `trimmed` list somewhere above
 *  or at it). `inside`: the nearest set-aside ANCESTOR that hides it — null when it is active, or when it is itself
 *  an entry of an active node's set-aside list (then one restoreNode brings it back). */
type Hit = { node: TemplateNode; parent: TemplateNode | null; pocket: boolean; inside: TemplateNode | null };
function find(tpl: InspectionTemplate, id: string): Hit | null {
  const visit = (n: TemplateNode, parent: TemplateNode | null, viaTrim: boolean, hidden: TemplateNode | null): Hit | null => {
    if (n.id === id) return { node: n, parent, pocket: viaTrim || !!hidden, inside: hidden };
    const below = hidden ?? (viaTrim ? n : null);
    for (const c of n.children ?? []) { const h = visit(c, n, false, below); if (h) return h; }
    for (const t of n.trimmed ?? []) { const h = visit(t, n, true, below); if (h) return h; }
    return null;
  };
  for (const s of tpl.systems) { const h = visit(s, null, false, null); if (h) return h; }
  return null;
}
const isActive = (tpl: InspectionTemplate, id: string) => { const h = find(tpl, id); return !!h && !h.pocket; };

/** The shipped group that holds a system's special checkpoints (in the shipped template, set aside). */
function shippedGroup(source: InspectionTemplate, systemId: string): TemplateNode | null {
  const sys = source.systems.find(s => s.id === systemId);
  const holds = (g: TemplateNode) => (g.children ?? []).some(c => SPECIAL_IDS.has(c.id));
  return [...(sys?.trimmed ?? []), ...(sys?.children ?? [])].find(g => g.kind !== 'component' && holds(g)) ?? null;
}
function shippedNode(source: InspectionTemplate, id: string): TemplateNode | null {
  const h = find(source, id);
  return h ? h.node : null;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ── what the panel shows ───────────────────────────────────────────────────────────────────────────────────────────

export type SpecialRow = SpecialCheckpoint & { label: string; inTemplate: boolean };

/** The special checkpoints for one of the template's systems, in list order; `inTemplate` = an inspector sees it now. */
export function specialRows(tpl: InspectionTemplate, system: Pick<TemplateNode, 'id'>, source: InspectionTemplate): SpecialRow[] {
  if (isCopiedSystem(system)) return [];
  return SPECIAL_HOMES.filter(s => s.system === system.id).map(s => {
    const own = find(tpl, s.id)?.node ?? shippedNode(source, s.id);
    return { ...s, label: own?.label ?? s.id, inTemplate: isActive(tpl, s.id) };
  });
}

/** The kinds of home a template is for (owner 2026-11-05, mockup HANP7FdGGVT542cfPt4YaU: "I shouldnt see anything about
 *  manufactured/mobile homes since i didnt check that one … strictly what i select"): its property types' kinds plus
 *  `alsoKinds`. A template from before `alsoKinds` that set an older-home cutoff counts as Older. None = single-family
 *  only: the builder offers no special-home checkpoints at all. */
export function templateKinds(tpl: Pick<InspectionTemplate, 'propertyTypes' | 'alsoKinds' | 'olderCutoffYear'>): SpecialKind[] {
  const own = new Set<string>(Array.isArray(tpl.propertyTypes) ? tpl.propertyTypes : []);
  const also = new Set<string>(Array.isArray(tpl.alsoKinds) ? tpl.alsoKinds : []);
  const legacyOlder = !Array.isArray(tpl.alsoKinds) && typeof tpl.olderCutoffYear === 'number';
  return SPECIAL_KINDS.filter(k => k.propertyTypes.some(p => own.has(p)) || also.has(k.id) || (k.id === 'older' && legacyOlder)).map(k => k.id);
}

/** A starting point's copy WITHOUT Ledrix's set-aside special-home checkpoints (and any set-aside group holding one), so a template carries nothing for a home it is not for — the phone offers set-aside items on site. The kinds
 *  picked are then added back, active, by starterOps. Active nodes are never touched. Pure: returns a new tree. */
export function withoutSetAsideSpecials(tpl: InspectionTemplate): InspectionTemplate {
  const t = clone(tpl);
  // A set-aside GROUP that holds any special checkpoint is Ledrix's "Special Homes" container and goes whole — the
  // shipped Exterior one also carries three manufactured-home repeats the 42 → 32 cleanup took off the list.
  const holds = (n: TemplateNode): boolean => [...(n.children ?? []), ...(n.trimmed ?? [])].some(c => SPECIAL_IDS.has(c.id) || holds(c));
  const special = (n: TemplateNode): boolean => SPECIAL_IDS.has(n.id) || (n.kind !== 'component' && holds(n));
  const prune = (n: TemplateNode) => {
    if (n.trimmed) { n.trimmed = n.trimmed.filter(x => !special(x)); if (!n.trimmed.length) delete n.trimmed; }
    (n.children ?? []).forEach(prune);
    (n.trimmed ?? []).forEach(prune);
  };
  t.systems.forEach(prune);
  return t;
}

/** Every special checkpoint of `kind` an inspector sees in this template (active), for switching a kind off. */
export function activeKindCheckpoints(tpl: InspectionTemplate, kind: SpecialKind): string[] {
  return SPECIAL_HOMES.filter(s => s.kind === kind && isActive(tpl, s.id)).map(s => s.id);
}

/** The kind a template's property types point at, if any (shown first, marked on its chip). */
export function kindForTemplate(tpl: Pick<InspectionTemplate, 'propertyTypes'>): SpecialKind | null {
  const own = new Set<string>(Array.isArray(tpl.propertyTypes) ? tpl.propertyTypes : []);
  return SPECIAL_KINDS.find(k => k.propertyTypes.some(p => own.has(p)))?.id ?? null;
}

// ── adding ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SpecialOpsResult = { ok: true; ops: TemplateOp[] } | { ok: false; error: string };

/** The template operations that make `pickIds` (special checkpoints of `systemId`) active in `tpl`, as one change set. */
export function specialHomeOps(tpl: InspectionTemplate, systemId: string, pickIds: readonly string[], source: InspectionTemplate): SpecialOpsResult {
  const system = tpl.systems.find(s => s.id === systemId);
  if (!system) return { ok: false, error: `"${systemId}" is not an active system in this template` };
  if (isCopiedSystem(system)) return { ok: false, error: 'Special checkpoints are offered on the original system, not a copy' };
  const listed = new Set(SPECIAL_HOMES.filter(s => s.system === systemId).map(s => s.id));
  const stray = pickIds.find(id => !listed.has(id));
  if (stray) return { ok: false, error: `"${stray}" is not a special checkpoint of this system` };
  const picks = pickIds.filter((id, i) => pickIds.indexOf(id) === i && !isActive(tpl, id));
  if (!picks.length) return { ok: true, ops: [] };

  const shipped = shippedGroup(source, systemId);
  const ops: TemplateOp[] = [];
  const picked = new Set(picks);
  const relabel = (g: TemplateNode) => { if (LEGACY_GROUP_LABELS.has(g.label)) ops.push({ op: 'setNodeField', nodeId: g.id, field: 'label', value: SPECIAL_GROUP_LABEL }); };
  const fromSource = (id: string): TemplateNode | null => { const n = shippedNode(source, id); return n ? clone(n) : null; };

  const g = shipped ? find(tpl, shipped.id) : null;
  let home: string | null = null;   // the active group new checkpoints go into
  const handled = new Set<string>();

  if (g && g.pocket && g.parent?.id === systemId && g.inside === null) {
    // The group is set aside under this system: bring it back holding only the picks.
    ops.push({ op: 'restoreNode', nodeId: g.node.id });
    for (const c of g.node.children ?? []) {
      if (picked.has(c.id)) handled.add(c.id);
      else ops.push({ op: 'trimNode', nodeId: c.id });
    }
    relabel(g.node);
    home = g.node.id;
  } else if (g && !g.pocket) {
    relabel(g.node);
    home = g.node.id;
  }
  if (!home) {
    // A group of special checkpoints the template already shows under another id (the 4-Point's auto-built
    // "heating__special_homes"): new picks join it rather than a second "Special Homes" group.
    const own = (system.children ?? []).find(c => c.kind === 'subsystem' && (c.children ?? []).some(k => SPECIAL_IDS.has(k.id)));
    if (own) { relabel(own); home = own.id; }
  }

  const absent: TemplateNode[] = [];
  for (const id of picks) {
    if (handled.has(id)) continue;
    const h = find(tpl, id);
    if (h && h.pocket && h.inside === null) { ops.push({ op: 'restoreNode', nodeId: id }); continue; }
    // In the restored group's own set-aside list: the group is active once its restore op runs.
    if (h && h.pocket && g && h.inside?.id === g.node.id && g.pocket) {
      ops.push({ op: 'restoreNode', nodeId: id }); continue;
    }
    if (h) return { ok: false, error: `"${h.node.label}" is set aside inside "${h.inside?.label ?? 'another item'}"; restore that first` };
    const n = fromSource(id);
    if (!n) return { ok: false, error: `"${id}" is not in Ledrix's template` };
    absent.push(n);
  }

  if (absent.length) {
    if (home) {
      for (const n of absent) ops.push({ op: 'addNode', parentId: home, node: n });
    } else {
      const hasGroups = (system.children ?? []).some(c => c.kind === 'subsystem');
      const hasItems = (system.children ?? []).some(c => c.kind === 'component');
      if (!hasGroups && hasItems) {
        for (const n of absent) ops.push({ op: 'addNode', parentId: systemId, node: n });
      } else {
        const id = shipped && !find(tpl, shipped.id) ? shipped.id : `${systemId}__special_homes`;
        if (find(tpl, id)) return { ok: false, error: `"${id}" is already used in this template` };
        ops.push({ op: 'addNode', parentId: systemId, node: { id, label: SPECIAL_GROUP_LABEL, kind: 'subsystem', children: absent } as TemplateNode });
      }
    }
  }
  return { ok: true, ops };
}

// ── starting points: a kind of home picked on Templates › New template (2026-11-05) ──────────────────────────────

/** The kinds offered under "Also" (how the home was built), apart from property type (ruling 2). */
export const ALSO_KINDS: readonly SpecialKind[] = ['older', 'log'];

/** The kinds a new template starts with: the property types' kinds, then the "Also" picks, then new construction when
 *  the New Construction starting point was chosen. Each kind once, in SPECIAL_KINDS order. */
export function starterKinds(args: { propertyTypes: readonly string[]; also: readonly string[]; newConstruction?: boolean }): SpecialKind[] {
  const on = new Set<SpecialKind>();
  for (const k of SPECIAL_KINDS) if (k.propertyTypes.some(p => args.propertyTypes.includes(p))) on.add(k.id);
  for (const a of args.also) if ((ALSO_KINDS as readonly string[]).includes(a)) on.add(a as SpecialKind);
  if (args.newConstruction) on.add('new_construction');
  return SPECIAL_KINDS.map(k => k.id).filter(id => on.has(id));
}

/** Every checkpoint of these kinds, in list order (all ticked to start — ruling 1). */
export const starterCheckpoints = (kinds: readonly SpecialKind[]): SpecialCheckpoint[] =>
  SPECIAL_HOMES.filter(s => kinds.includes(s.kind));

/** The template operations that make `pickIds` active in `tpl`, system by system, as ONE change set. Each system's ops
 *  are specialHomeOps' (they touch only that system, so they compose); a system the template does not hold is
 *  refused by name. */
export function starterOps(tpl: InspectionTemplate, pickIds: readonly string[], source: InspectionTemplate): SpecialOpsResult {
  const known = new Map(SPECIAL_HOMES.map(s => [s.id, s]));
  const bySystem = new Map<string, string[]>();
  for (const id of pickIds) {
    const s = known.get(id);
    if (!s) return { ok: false, error: `"${id}" is not one of Ledrix's special checkpoints` };
    if (!bySystem.has(s.system)) bySystem.set(s.system, []);
    bySystem.get(s.system)!.push(id);
  }
  const ops: TemplateOp[] = [];
  for (const [system, ids] of bySystem) {
    const r = specialHomeOps(tpl, system, ids, source);
    if (!r.ok) return r;
    ops.push(...r.ops);
  }
  return { ok: true, ops };
}

// ── condo / townhome: association responsibility (ruling 3) ───────────────────────────────────────────────────────

/** What "pre-mark" sets when the company ticks it: the roof, the foundation and the shared exterior. */
export const ASSOCIATION_SYSTEMS: readonly string[] = ['roofing', 'foundation', 'exterior'];
/** The cause every pre-marked system carries; the inspector clears it to inspect the system anyway. */
export const ASSOCIATION_CAUSE = 'Association responsibility';

/** The systems a NEW job from `tpl` starts with marked Not inspected: the template's choice, limited to systems the
 *  template actually holds. Empty unless the company ticked the pre-mark. */
export function associationPremarks(tpl: Pick<InspectionTemplate, 'systems' | 'associationNotInspected'>): string[] {
  const want = Array.isArray(tpl.associationNotInspected) ? tpl.associationNotInspected : [];
  const held = new Set((tpl.systems ?? []).map(s => s.id));
  return want.filter((id, i) => want.indexOf(id) === i && held.has(id));
}
