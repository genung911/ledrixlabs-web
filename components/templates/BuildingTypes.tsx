'use client';

// The template editor's BUILDING TYPES tab (owner, 2026-10-24 — the approved Structure Types mockup, built for real).
//
// A template says which of ITS OWN systems each kind of building starts with — "our Detached Shop has Roofing,
// Electrical and Foundation" — and the phone starts a building from the inspection's copy of that list
// (ledrix-app services/buildings.ts). Every change here is ONE template operation, `setTemplateField structureTypes`,
// through the same draft as every other edit: undoable, saved to the shared draft, validated (templateValidate →
// structureTypes.validateStructureTypes) on every op and again at publish. Nothing here writes anywhere else.
//
// SYSTEMS ARE REFERENCES: ticking Electrical doesn't copy it. A Shop's Electrical is the template's Electrical, edited
// once in Systems & items. A template without its own list uses Ledrix's defaults until someone chooses to customize.
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import {
  hasOwnStructureTypes, newStructureTypeId, seedStructureTypes, structureTypesOf, validateStructureTypes,
  STRUCTURE_TYPE_ICONS, type StructureTypeDef, type StructureTypeIssue,
} from '@/lib/templateBuilder/core/structureTypes';
import { assessesCondition, flatItems, isCovered } from '@/lib/templates/editorModel';
import { Banner, Menu, Modal, Pill, btn, field, label } from './ui';
import { displayLabel } from './systemLabel';

// ── icons (the building set is structureTypes.STRUCTURE_TYPE_ICONS — MaterialCommunityIcons names on the phone) ──
const BUILDING_PATHS: Record<string, string> = {
  'warehouse': 'M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10',
  'garage-variant': 'M3 21V10l9-6 9 6v11M6 21v-8h12v8M6 16h12M6 19h12',
  'home-group': 'M2 21v-8l5-4 5 4v8M12 21v-9l5-4 5 4v9M5 21v-4h4v4M15 21v-4h4v4',
  'home-variant-outline': 'M3 11 12 4l9 7M5 10v11h14V10M10 21v-6h4v6',
  'barn': 'M3 21V10l3-5h12l3 5v11M3 10h18M9 21v-6h6v6M9 15l6 6M15 15l-6 6',
  'pool': 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 22c2 0 2-1.5 4-1.5S8 22 10 22s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8',
  'office-building': 'M5 21V3h10v18M15 9h4v12M8 7h4M8 11h4M8 15h4',
  'home-city-outline': 'M4 20V9l6-4 6 4v11M16 20V12h4v8M8 13h4M8 17h4',
  'home-outline': 'M3 12 12 4l9 8M6 10v10h12V10',
  'home': 'M3 12 12 4l9 8M6 10v10h12V10M10 20v-5h4v5',
};
const SYSTEM_PATHS: Record<string, string> = {
  'home-roof': 'M3 12 12 4l9 8M6 10v9h12v-9', 'home-city-outline': 'M4 20V9l6-4 6 4v11M16 20V12h4v8M8 13h4M8 17h4',
  'layers-triple': 'M12 3 3 8l9 5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5', 'fire': 'M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3-1-5 1-8Z',
  'snowflake': 'M12 2v20M4 7l16 10M20 7 4 17', 'water': 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z',
  'water-boiler': 'M7 3h10v15H7zM10 21v-3M14 21v-3M10 8h4', 'lightning-bolt': 'M13 2 4 14h7l-1 8 9-12h-7Z',
  'fireplace': 'M3 21V5h18v16M7 21v-8h10v8', 'home-thermometer-outline': 'M3 12 12 4l9 8M6 10v9h12v-9M12 11v5',
  'floor-plan': 'M4 4h16v16H4zM4 12h7M11 4v10M15 12h5', 'stove': 'M5 3h14v18H5zM5 9h14M9 6h.01M15 6h.01',
  'shield-check-outline': 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM8.5 12l2.5 2.5 4.5-5', 'shape-outline': 'M4 14h6v6H4zM14 4l6 6-6 6-6-6zM17 17h.01',
};
function Svg({ d, size = 18, className = '', color }: { d: string; size?: number; className?: string; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flex: 'none' }}><path d={d} /></svg>;
}
const BIcon = ({ name, size, className, color }: { name: string; size?: number; className?: string; color?: string }) =>
  <Svg d={BUILDING_PATHS[name] ?? BUILDING_PATHS['home-outline']} size={size} className={className} color={color} />;
const SIcon = ({ name, size, className, color }: { name?: string; size?: number; className?: string; color?: string }) =>
  <Svg d={SYSTEM_PATHS[name ?? ''] ?? SYSTEM_PATHS['shape-outline']} size={size} className={className} color={color} />;

type SysInfo = { node: TemplateNode; items: number; assessed: number; specs: number; coveredOnMain: boolean };
function infoOf(tree: InspectionTemplate, sys: TemplateNode): SysInfo {
  const comps = flatItems(sys).map(r => r.node).filter(n => n.kind === 'component');
  return { node: sys, items: comps.length, assessed: comps.filter(assessesCondition).length, specs: comps.filter(c => (c.attributes?.length ?? 0) > 0).length, coveredOnMain: isCovered(tree, sys) };
}

/** What publishing would change in the building types, in words (the publish dialog). */
export function buildingTypeChanges(live: InspectionTemplate | null, now: InspectionTemplate): string[] {
  const liveOwn = hasOwnStructureTypes(live), nowOwn = hasOwnStructureTypes(now);
  if (!liveOwn && !nowOwn) return [];
  if (liveOwn && !nowOwn) return ['Building types go back to Ledrix’s defaults'];
  const nm = (id: string) => displayLabel(now.systems.find(s => s.id === id)?.label ?? live?.systems.find(s => s.id === id)?.label ?? id);
  const was = structureTypesOf(live).types, is = structureTypesOf(now).types;
  const out: string[] = [];
  if (!liveOwn) out.push('Building types: this template now sets its own (until now, Ledrix’s defaults)');
  for (const t of is) {
    const w = liveOwn ? was.find(l => l.id === t.id) : undefined;
    if (!w) {
      out.push(liveOwn ? `Added “${t.name}” with ${t.systems.length} system${t.systems.length === 1 ? '' : 's'}`
        : `${t.name}: ${t.systems.length ? t.systems.map(nm).join(', ') : 'no systems'}`);
      continue;
    }
    if (w.name !== t.name) out.push(`Renamed “${w.name}” to “${t.name}”`);
    if (w.icon !== t.icon) out.push(`${t.name}: new icon`);
    const add = t.systems.filter(s => !w.systems.includes(s)), rem = w.systems.filter(s => !t.systems.includes(s));
    if (add.length) out.push(`${t.name}: + ${add.map(nm).join(', ')}`);
    if (rem.length) out.push(`${t.name}: − ${rem.map(nm).join(', ')}`);
  }
  if (liveOwn) for (const l of was) if (!is.some(t => t.id === l.id)) out.push(`Removed “${l.name}”`);
  return out;
}

/** Building-type problems that block publishing, and the warnings shown with it. */
export function buildingTypeIssues(tree: InspectionTemplate): { errors: StructureTypeIssue[]; warnings: StructureTypeIssue[] } {
  const all = validateStructureTypes(tree);
  return { errors: all.filter(i => i.severity === 'error'), warnings: all.filter(i => i.severity === 'warning') };
}

export function BuildingTypesPanel({ tree, live, onOps, disabled, onOpenSystem }: {
  tree: InspectionTemplate; live: InspectionTemplate | null; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
  onOpenSystem: (systemId: string) => void;
}) {
  const own = hasOwnStructureTypes(tree);
  const types = useMemo(() => structureTypesOf(tree).types, [tree]);
  const liveTypes = useMemo(() => (hasOwnStructureTypes(live) ? structureTypesOf(live).types : null), [live]);
  const infos = useMemo(() => tree.systems.map(s => infoOf(tree, s)), [tree]);
  const issues = useMemo(() => validateStructureTypes(tree), [tree]);
  const [selId, setSelId] = useState<string>('main');
  const [open, setOpen] = useState<string | null>(null);
  const [iconPicker, setIconPicker] = useState(false);
  const [dialog, setDialog] = useState<null | 'defaults' | { remove: string }>(null);
  const sel = types.find(t => t.id === selId) ?? null;
  useEffect(() => { if (selId !== 'main' && !types.some(t => t.id === selId)) setSelId(types[0]?.id ?? 'main'); }, [types, selId]);

  // The name is typed locally and written when it is a name: an empty name would be refused as an op.
  const [name, setName] = useState('');
  useEffect(() => { setName(sel?.name ?? ''); setIconPicker(false); }, [sel?.id, sel?.name]);

  const commit = (next: StructureTypeDef[] | null) => onOps([{ op: 'setTemplateField', field: 'structureTypes', value: next }]);
  const update = (id: string, patch: Partial<StructureTypeDef>) => commit(types.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const order = (ids: string[]) => tree.systems.map(s => s.id).filter(s => ids.includes(s));
  const toggle = (sysId: string) => sel && update(sel.id, { systems: sel.systems.includes(sysId) ? sel.systems.filter(s => s !== sysId) : order([...sel.systems, sysId]) });
  const saveName = () => { const v = name.trim(); if (sel && v && v !== sel.name) update(sel.id, { name: v }); };
  const addType = () => {
    const taken = new Set(types.map(t => t.name.toLowerCase()));
    let n = 'New building type'; for (let i = 2; taken.has(n.toLowerCase()); i++) n = `New building type ${i}`;
    const id = newStructureTypeId(types.map(t => t.id), Date.now());
    if (commit([...types, { id, name: n, icon: 'home-outline', systems: [] }])) setSelId(id);
  };
  const issuesFor = (id: string) => issues.filter(i => i.structureTypeId === id);
  const mainCount = infos.filter(i => i.coveredOnMain).length;

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
      {/* ── the list ── */}
      <section aria-label="Building types" className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface">
        <header className="border-b border-hairline px-3 py-2.5">
          <h2 className="text-sm font-semibold text-ink">Building types</h2>
          <p className="text-[11px] text-muted">{own ? 'What inspectors can add to an inspection' : 'Ledrix’s defaults — not customized'}</p>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          <li>
            <button onClick={() => setSelId('main')} aria-current={selId === 'main' ? 'true' : undefined}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${selId === 'main' ? 'bg-accent/10' : 'hover:bg-ink/5'}`}>
              <BIcon name="home" size={18} className="text-muted" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">Main Structure</span>
                <span className="block text-[11px] text-muted">Every inspection · {mainCount} system{mainCount === 1 ? '' : 's'}</span></span>
            </button>
          </li>
          <li className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-muted">Added on site</li>
          {types.map(t => {
            const was = liveTypes?.find(l => l.id === t.id);
            const dirty = own && (!was || JSON.stringify(was) !== JSON.stringify(t));
            const bad = issuesFor(t.id).some(i => i.severity === 'error');
            return (
              <li key={t.id}>
                <button onClick={() => setSelId(t.id)} aria-current={selId === t.id ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${selId === t.id ? 'bg-accent/10' : 'hover:bg-ink/5'}`}>
                  <BIcon name={t.icon} size={18} className={selId === t.id ? 'text-accent-ink' : 'text-muted'} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{t.name}</span>
                    <span className="block text-[11px] text-muted">{t.systems.length ? `${t.systems.length} system${t.systems.length === 1 ? '' : 's'}` : 'No systems yet'}</span></span>
                  {bad ? <span title="Needs attention before publishing" className="h-2 w-2 rounded-full bg-safety" />
                    : dirty && <span title="Changed in this draft" className="h-2 w-2 rounded-full bg-warn" />}
                </button>
              </li>
            );
          })}
        </ul>
        {own && <div className="border-t border-hairline p-2"><button className={btn.secondary + ' w-full py-1.5'} disabled={disabled} onClick={addType}>+ Add building type</button></div>}
        <p className="border-t border-hairline px-3 py-2 text-[11px] text-muted">Inspectors can still name something else on site; it starts with no systems.</p>
      </section>

      {/* ── the selected type ── */}
      <section className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-hairline bg-surface xl:min-h-0">
        {!own && (
          <div className="border-b border-hairline px-5 py-4">
            <Banner title="This template uses Ledrix’s default building types."
              actions={<button className={btn.primary} disabled={disabled} onClick={() => { if (commit(seedStructureTypes(tree))) setSelId('main'); }}>Customize building types</button>}>
              Inspections from it offer Detached Shop, ADU, Guest House, Detached Garage and Outbuilding with Ledrix’s starting systems.
              Customize to choose your own — you start from these, limited to the systems this template has.
            </Banner>
          </div>
        )}
        {selId === 'main' ? (
          <div className="space-y-4 overflow-y-auto px-5 py-5">
            <div className="flex items-center gap-3"><BIcon name="home" size={28} className="text-muted" /><h2 className="text-lg font-bold text-ink">Main Structure</h2></div>
            <p className="text-sm text-body">Every inspection has a Main Structure. It isn’t a building type: its systems are the ones this template <b>covers when an inspection starts</b>, set with the switches in Systems &amp; items.</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">{infos.map(i => (
              <li key={i.node.id} className={`flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-sm ${i.coveredOnMain ? 'text-ink' : 'text-muted'}`}>
                <SIcon name={i.node.icon} size={16} /> {displayLabel(i.node.label)}<span className="ml-auto">{i.coveredOnMain ? <Pill tone="ok">Covered</Pill> : <Pill>Offered</Pill>}</span></li>))}</ul>
            {own && (
              <div className="rounded-xl border border-hairline px-4 py-3 text-xs text-body">
                Prefer Ledrix’s defaults again? <button className="font-semibold text-accent-ink hover:underline disabled:opacity-50" disabled={disabled} onClick={() => setDialog('defaults')}>Use Ledrix’s default building types</button>
              </div>
            )}
          </div>
        ) : sel ? (
          <>
            <div className="flex items-start gap-3 border-b border-hairline px-5 py-4">
              <div className="relative">
                <button aria-label="Choose icon" disabled={disabled || !own} onClick={() => setIconPicker(v => !v)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-ground text-ink hover:border-accent disabled:hover:border-hairline"><BIcon name={sel.icon} size={24} /></button>
                {iconPicker && (
                  <div className="absolute left-0 top-12 z-30 grid w-56 grid-cols-5 gap-1 rounded-xl border border-hairline bg-surface p-2 shadow-lg">
                    {STRUCTURE_TYPE_ICONS.map(k => (
                      <button key={k} aria-label={k} onClick={() => { update(sel.id, { icon: k }); setIconPicker(false); }}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${sel.icon === k ? 'bg-accent/15 text-accent-ink' : 'text-body hover:bg-ink/5'}`}><BIcon name={k} size={20} /></button>
                    ))}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <input value={name} disabled={disabled || !own} onChange={e => setName(e.target.value)} onBlur={saveName}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setName(sel.name); }}
                  placeholder="Name, e.g. Pool House" aria-label="Building type name" className={`${field} text-base font-semibold`} />
                <p className="mt-1 text-xs text-muted">{!name.trim() ? 'A building type needs a name — the last one is kept until you type one.' : `${sel.systems.length} of ${tree.systems.length} template systems · inspectors see this name in Add building`}</p>
              </div>
              {own && <Menu label={`More for ${sel.name}`} items={[{ label: 'Remove building type', danger: true, disabled: disabled ? 'Read only' : false, onSelect: () => setDialog({ remove: sel.id }) }]} />}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {issuesFor(sel.id).map(i => <Banner key={i.code + i.message} tone={i.severity === 'error' ? 'error' : 'warn'} title={i.message} />)}
              <div className="rounded-xl bg-ground px-4 py-3 text-xs text-body">
                <b className="text-ink">Systems come from this template.</b> Ticking Electrical here doesn’t copy it: a {sel.name}’s Electrical is the template’s Electrical — its items, condition assessment and spec fields are edited once, in Systems &amp; items.
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className={label + ' mb-0'}>Systems in a {sel.name}</p>
                  {own && <span className="flex gap-1.5">
                    <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => update(sel.id, { systems: tree.systems.map(s => s.id) })}>Select all</button>
                    <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => update(sel.id, { systems: [] })}>Clear</button>
                  </span>}
                </div>
                {sel.systems.length === 0 && (
                  <div className="mb-3 rounded-xl border border-dashed border-hairline px-4 py-5 text-center text-sm text-muted">
                    No systems yet. Tick the systems a {sel.name} has. With none, an inspector who adds one starts with an empty grid and adds systems on site.
                  </div>
                )}
                <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
                  {infos.map(i => {
                    const on = sel.systems.includes(i.node.id);
                    const expanded = open === i.node.id;
                    const comps = flatItems(i.node);
                    return (
                      <li key={i.node.id} className={on ? 'bg-accent/[0.06]' : ''}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <input type="checkbox" checked={on} disabled={disabled || !own} onChange={() => toggle(i.node.id)} aria-label={`${displayLabel(i.node.label)} in ${sel.name}`} className="h-4 w-4 accent-[rgb(33,123,232)]" />
                          <SIcon name={i.node.icon} size={18} className={on ? 'text-ink' : 'text-muted'} />
                          <button className="min-w-0 flex-1 text-left" disabled={disabled || !own} onClick={() => toggle(i.node.id)}>
                            <span className={`block text-sm ${on ? 'font-semibold text-ink' : 'text-body'}`}>{displayLabel(i.node.label)}</span>
                            <span className="block text-[11px] text-muted">{i.items} items · {i.assessed} assessed for condition · {i.specs} with spec fields</span>
                          </button>
                          {!i.coveredOnMain && <Pill>Not covered on Main</Pill>}
                          <button aria-label={`${expanded ? 'Hide' : 'Show'} what ${displayLabel(i.node.label)} records`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i.node.id)} className={btn.icon}>
                            <Svg d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} size={16} />
                          </button>
                        </div>
                        {expanded && (
                          <div className="border-t border-hairline bg-ground px-4 py-3">
                            <p className="mb-2 text-[11px] text-muted">What inspectors record for {displayLabel(i.node.label)} — the template’s definition, the same in every building.</p>
                            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                              {comps.slice(0, 16).map(({ node, depth }) => node.kind !== 'component'
                                ? <li key={node.id} className="pt-1 text-[10px] font-bold uppercase tracking-wider text-muted sm:col-span-2" style={{ paddingLeft: depth * 10 }}>{node.label}</li>
                                : <li key={node.id} className="flex items-center gap-2 text-xs text-ink" style={{ paddingLeft: depth * 10 }}>
                                    <span className="truncate">{node.label}</span>
                                    {assessesCondition(node) && <span className="rounded bg-ok/15 px-1 text-[10px] font-semibold">Condition</span>}
                                    {!!node.attributes?.length && <span className="rounded bg-ink/10 px-1 text-[10px] font-semibold">{node.attributes.map(a => a.label).join(', ')}</span>}
                                  </li>)}
                            </ul>
                            {comps.length > 16 && <p className="mt-1 text-[11px] text-muted">…and {comps.length - 16} more</p>}
                            <button className={btn.ghost + ' mt-2 text-xs'} onClick={() => onOpenSystem(i.node.id)}>Edit {displayLabel(i.node.label)} in Systems &amp; items →</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="rounded-xl border border-hairline px-4 py-3 text-xs text-body">
                <b className="text-ink">On site.</b> The inspector can still add any other template system to a {sel.name} with + Add system, and remove one the building doesn’t have. A system with recorded work is never hidden.
              </div>
            </div>
          </>
        ) : <p className="px-5 py-6 text-sm text-muted">Pick a building type.</p>}
      </section>

      <aside aria-label="Inspector preview" className="flex min-h-0 justify-center">
        <BuildingPhone tree={tree} types={types} focus={sel} infos={infos} />
      </aside>

      <Modal open={dialog === 'defaults'} title="Use Ledrix’s default building types?" onClose={() => setDialog(null)} footer={<>
        <button className={btn.secondary} onClick={() => setDialog(null)}>Cancel</button>
        <button className={btn.danger} onClick={() => { commit(null); setDialog(null); setSelId('main'); }}>Use Ledrix’s defaults</button>
      </>}>
        <p>Your building types are removed from this draft; new inspections from this template offer Ledrix’s defaults again once you publish. Undo restores them.</p>
      </Modal>
      <Modal open={!!dialog && typeof dialog === 'object'} title="Remove this building type?" onClose={() => setDialog(null)} footer={<>
        <button className={btn.secondary} onClick={() => setDialog(null)}>Cancel</button>
        <button className={btn.danger} onClick={() => { if (dialog && typeof dialog === 'object') { if (commit(types.filter(t => t.id !== dialog.remove))) setSelId('main'); } setDialog(null); }}>Remove</button>
      </>}>
        <p>Inspectors won’t see it in Add building on new inspections. Inspections that already have one of these buildings keep it, with its systems.</p>
      </Modal>
    </div>
  );
}

// ─── the phone ────────────────────────────────────────────────────────────────────────────────────────────────────
// THIS TYPE: the selected type's building grid, live as it is edited. ADD BUILDING FLOW: the app's building sheet
// (ScopeScreen: list → choices → name). A building added in the flow takes a COPY of its type's systems — editing the
// type afterwards does not change it, which is how an inspection already started behaves after a publish. Local
// preview state only; nothing here is saved.
type PhoneBuilding = { id: string; name: string; icon: string; systems: string[]; typeId: string | null };
type PScreen = 'grid' | 'sheet' | 'add' | 'name';

function BuildingPhone({ tree, types, focus, infos }: { tree: InspectionTemplate; types: StructureTypeDef[]; focus: StructureTypeDef | null; infos: SysInfo[] }) {
  const main: PhoneBuilding = { id: 'main', name: 'Main Structure', icon: 'home', systems: infos.filter(i => i.coveredOnMain).map(i => i.node.id), typeId: null };
  const [view, setView] = useState<'type' | 'flow'>('type');
  const [buildings, setBuildings] = useState<PhoneBuilding[]>([main]);
  const [active, setActive] = useState('main');
  const [screen, setScreen] = useState<PScreen>('grid');
  const [name, setName] = useState('');
  useEffect(() => { setBuildings(bs => bs.map(b => (b.id === 'main' ? main : b))); /* Main follows the template */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const shown: PhoneBuilding = view === 'type'
    ? (focus ? { id: 'preview', name: focus.name, icon: focus.icon, systems: focus.systems, typeId: focus.id } : main)
    : buildings.find(b => b.id === active) ?? main;
  const addFrom = (b: Omit<PhoneBuilding, 'id'>) => {
    const id = `pb_${Date.now()}`;
    setBuildings(bs => [...bs, { ...b, id }]); setActive(id); setScreen('grid'); setName('');
  };
  const typeOf = (b: PhoneBuilding) => types.find(t => t.id === b.typeId);
  const drifted = view === 'flow' && !!shown.typeId && !!typeOf(shown) && JSON.stringify(typeOf(shown)!.systems) !== JSON.stringify(shown.systems);
  const tiles = infos.filter(i => shown.systems.includes(i.node.id));

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-2">
      <div role="tablist" aria-label="Preview" className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
        {([['type', 'This type'], ['flow', 'Add building flow']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setScreen('grid'); }}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${view === k ? 'bg-ink text-surface' : 'text-body'}`}>{l}</button>
        ))}
      </div>
      <div className="relative w-[330px] overflow-hidden rounded-[2.4rem] border-[10px] border-[#1c1f22] bg-[#0b0e11] text-[#e8ecef] shadow-xl" style={{ height: 660 }}>
        <div className="flex items-center justify-between px-6 pt-2 text-[11px] font-semibold"><span>9:41</span><span className="h-4 w-20 rounded-full bg-black" /><span>100%</span></div>
        <div className="px-4 pt-2">
          <p className="text-[10px] text-[#7d8b96]">‹ &nbsp;<span className="text-[#217BE8]">●</span> Sample inspection</p>
          <button disabled={view === 'type'} onClick={() => setScreen('sheet')} className="mx-auto mt-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-[#c7d0d6]">
            <span className="text-[#7d8b96]">‹</span> {shown.name.toUpperCase()} {view === 'flow' && '▾'} <span className="text-[#7d8b96]">›</span>
          </button>
        </div>
        <div className="h-[500px] overflow-y-auto px-4 pb-20 pt-3">
          {drifted && <p className="mb-2 rounded-lg bg-[#f0a020]/15 px-2.5 py-1.5 text-[10px] text-[#f0c070]">The {typeOf(shown)!.name} type changed since this building was added. This building keeps the systems it was added with.</p>}
          <div className="grid grid-cols-3 gap-2">
            {tiles.map(i => (
              <div key={i.node.id} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-1 py-3 text-center">
                <SIcon name={i.node.icon} size={22} color="#c7d0d6" />
                <span className="text-[10px] font-semibold leading-tight">{displayLabel(i.node.label)}</span>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 py-3 text-[10px] text-[#7d8b96]">+<span>Add system</span></div>
          </div>
          {shown.systems.length === 0 && <p className="mt-3 text-center text-[11px] text-[#7d8b96]">No systems yet — add the ones this building has.</p>}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-around border-t border-white/10 bg-[#0b0e11] pb-5 pt-2 text-[9px] text-[#7d8b96]">
          {['Coverage', 'Findings', 'Evidence', 'Camera'].map((t, i) => <span key={t} className={i === 0 ? 'text-[#e8ecef]' : ''}>{t}</span>)}
        </div>
        {view === 'flow' && screen !== 'grid' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 px-5" onClick={() => setScreen('grid')}>
            <div className="w-full rounded-2xl border border-[#2f4a62]/50 bg-[#0c141d] p-4" onClick={e => e.stopPropagation()}>
              {screen === 'sheet' && (<>
                <p className="mb-1 text-[15px] font-extrabold">Building — which one are you in?</p>
                {buildings.map(b => (
                  <button key={b.id} onClick={() => { setActive(b.id); setScreen('grid'); }} className="flex w-full items-center gap-3 border-t border-[#26323e]/60 py-2.5 text-left text-[13px] font-semibold">
                    <BIcon name={b.icon} size={18} color="#8fa0ad" /><span className="flex-1">{b.name}</span>{b.id === active && <span className="text-[#2F8CE8]">✓</span>}
                  </button>
                ))}
                <button onClick={() => setScreen('add')} className="flex w-full items-center gap-3 border-t border-[#26323e]/60 py-2.5 text-left text-[13px] font-semibold"><span className="w-[18px] text-center text-[#8fa0ad]">+</span>Add building</button>
              </>)}
              {screen === 'add' && (<>
                <p className="mb-1 text-[15px] font-extrabold">Add a building</p>
                {types.filter(t => !buildings.some(b => b.name.toLowerCase() === t.name.toLowerCase())).map(t => (
                  <button key={t.id} onClick={() => addFrom({ name: t.name, icon: t.icon, systems: [...t.systems], typeId: t.id })} className="flex w-full items-center gap-3 border-t border-[#26323e]/60 py-2.5 text-left text-[13px] font-semibold">
                    <BIcon name={t.icon} size={18} color="#8fa0ad" /><span className="flex-1">{t.name}</span>
                  </button>
                ))}
                <button onClick={() => setScreen('name')} className="flex w-full items-center gap-3 border-t border-[#26323e]/60 py-2.5 text-left text-[13px] font-semibold"><span className="w-[18px] text-center text-[#8fa0ad]">✎</span>Something else — name it</button>
                <button onClick={() => setScreen('sheet')} className="flex w-full items-center gap-3 border-t border-[#26323e]/60 py-2.5 text-left text-[13px] font-semibold"><span className="w-[18px] text-center text-[#8fa0ad]">‹</span>Back</button>
              </>)}
              {screen === 'name' && (<>
                <p className="mb-2 text-[15px] font-extrabold">Name the building</p>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Pool house, barn, Unit B…" aria-label="New building name"
                  className="w-full rounded-lg border border-[#2f4a62]/60 bg-white/5 px-3 py-2.5 text-[14px] font-semibold text-[#eef2f4] outline-none placeholder:text-[#5d6b76]" />
                <div className="mt-3 flex gap-2.5">
                  <button onClick={() => setScreen('add')} className="flex-1 rounded-lg bg-white/[0.07] py-2.5 text-[13px] font-bold">Back</button>
                  <button disabled={!name.trim()} onClick={() => addFrom({ name: name.trim(), icon: 'home-outline', systems: [], typeId: null })}
                    className="flex-1 rounded-lg bg-[#2F8CE8] py-2.5 text-[13px] font-bold text-white disabled:opacity-40">Add</button>
                </div>
              </>)}
            </div>
          </div>
        )}
      </div>
      <p className="max-w-[330px] text-center text-[11px] text-muted">
        {view === 'type' ? 'The grid an inspector sees in a building of this type. It follows your edits.' : 'Tap the building name. Added buildings keep a copy of their type’s systems.'}
      </p>
      {view === 'flow' && buildings.length > 1 && <button className={btn.ghost + ' text-xs'} onClick={() => { setBuildings([main]); setActive('main'); }}>Reset the sample inspection</button>}
    </div>
  );
}
