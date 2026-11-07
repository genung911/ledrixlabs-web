'use client';

// The building the Template Builder is showing (owner 2026-11-06, mockup https://claude.ai/artifact/HHfBh3wvLanc1CG4UcNxaU):
// the strip across the top picks it, and every "is this part here?" switch, list and Off list in Systems reads it.
// The main house is no lens at all (null) — the builder exactly as before, its switches the Included switches. Any other
// building: a part is listed when it is in that building, and its switch writes the building type (lib/templates/
// buildingModel.partOps, one op). Content — names, answers, condition settings — is shared; only what's in it differs.
import { createContext, useContext, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { STRUCTURE_TYPE_ICONS, type StructureTypeDef } from '@/lib/templateBuilder/core/structureTypes';
import { propertyTypeLabel, propertyTypesOf } from '@/lib/templateBuilder/core/propertyTypes';
import { addBuildingOps, addableBuildings, buildingEditOps, buildingsOf, inBuilding, offPartsIn, parentMap, partOps } from '@/lib/templates/buildingModel';
import { Menu, Modal, btn, field } from './ui';
import { BIcon } from './BuildingTypes';

export type BuildingLens = {
  building: StructureTypeDef;
  /** Is this part (system, group or item) in the building? */
  isIn: (id: string) => boolean;
  /** The op that switches it on or off in the building. */
  set: (id: string, on: boolean) => TemplateOp[];
  /** The building's off parts in one system, for its Off list. */
  offIn: (systemId: string) => Array<{ node: TemplateNode; under: string }>;
};
const Ctx = createContext<BuildingLens | null>(null);
/** The selected building, or null for the main house. */
export const useBuildingLens = () => useContext(Ctx);

export function BuildingLensProvider({ tree, buildingId, children }: { tree: InspectionTemplate; buildingId: string | null; children: React.ReactNode }) {
  const lens = useMemo<BuildingLens | null>(() => {
    const b = buildingId ? buildingsOf(tree).find(t => t.id === buildingId) ?? null : null;
    if (!b) return null;
    const pm = parentMap(tree);
    return { building: b, isIn: id => inBuilding(b, tree, id, pm), set: (id, on) => partOps(tree, b.id, id, on), offIn: sys => offPartsIn(b, tree, sys) };
  }, [tree, buildingId]);
  return <Ctx.Provider value={lens}>{children}</Ctx.Provider>;
}

/** The home this template is for ("Single Family Home"), the first chip; Main house when it names none. */
export const homeLabelOf = (tree: InspectionTemplate): string => { const p = propertyTypesOf(tree)[0]; return p ? propertyTypeLabel(p) : 'Main house'; };

/** The strip: the home, then each building, then "+ Building"; ‹ › step through them. The selected building's ⋯:
 *  Rename, Icon, Remove. Adding one starts it with Ledrix's sensible systems (or none, for your own name). */
export function BuildingStrip({ tree, value, onChange, onOps, disabled }: {
  tree: InspectionTemplate; value: string | null; onChange: (id: string | null) => void; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const buildings = buildingsOf(tree);
  const ids: Array<string | null> = [null, ...buildings.map(b => b.id)];
  const at = Math.max(0, ids.indexOf(value));
  const sel = buildings.find(b => b.id === value) ?? null;
  const [dialog, setDialog] = useState<null | 'name' | 'icon' | 'remove' | 'own'>(null);
  const [text, setText] = useState('');
  const step = (d: number) => onChange(ids[(at + d + ids.length) % ids.length]);
  const chip = (on: boolean) => `flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${on ? 'border-accent bg-accent text-white' : 'border-hairline bg-surface text-body hover:text-ink'}`;
  const add = (from: StructureTypeDef | { name: string }) => { const r = addBuildingOps(tree, from, Date.now()); if (r && onOps(r.ops)) onChange(r.id); };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-hairline bg-ground px-2 py-1.5" role="tablist" aria-label="Buildings">
      <button type="button" className={btn.icon} aria-label="Previous building" onClick={() => step(-1)}>‹</button>
      <button type="button" role="tab" aria-selected={value === null} className={chip(value === null)} onClick={() => onChange(null)}>{homeLabelOf(tree)}</button>
      {buildings.map(b => (
        <button key={b.id} type="button" role="tab" aria-selected={value === b.id} className={chip(value === b.id)} onClick={() => onChange(b.id)}>
          <BIcon name={b.icon} size={14} /> {b.name}</button>
      ))}
      <Menu label="Add a building" trigger="+ Building" items={[
        ...addableBuildings(tree).map(t => ({ label: `+ ${t.name}`, disabled: disabled && 'The draft can’t change right now.', onSelect: () => add(t) })),
        { label: '+ Your own…', disabled: disabled && 'The draft can’t change right now.', onSelect: () => { setText(''); setDialog('own'); } },
      ]} />
      {sel && <Menu label={`More for ${sel.name}`} items={[
        { label: 'Rename', disabled: disabled && 'The draft can’t change right now.', onSelect: () => { setText(sel.name); setDialog('name'); } },
        { label: 'Icon', disabled: disabled && 'The draft can’t change right now.', onSelect: () => setDialog('icon') },
        { label: 'Remove building', danger: true, disabled: disabled && 'The draft can’t change right now.', onSelect: () => setDialog('remove') },
      ]} />}
      <button type="button" className={btn.icon} aria-label="Next building" onClick={() => step(1)}>›</button>

      {(dialog === 'name' || dialog === 'own') && (
        <Modal open title={dialog === 'own' ? 'Add a building' : `Rename ${sel?.name ?? ''}`} onClose={() => setDialog(null)} footer={<>
          <button className={btn.secondary} onClick={() => setDialog(null)}>Cancel</button>
          <button className={btn.primary} disabled={!text.trim()} onClick={() => {
            if (dialog === 'own') add({ name: text });
            else if (sel) onOps(buildingEditOps(tree, sel.id, { name: text }));
            setDialog(null);
          }}>{dialog === 'own' ? 'Add' : 'Rename'}</button>
        </>}>
          <input autoFocus value={text} onChange={e => setText(e.target.value)} aria-label="Building name" placeholder="e.g. Pole Barn" className={field} />
          {dialog === 'own' && <p className="mt-2 text-xs text-muted">It starts with no systems. Switch on what it has with it selected.</p>}
        </Modal>
      )}
      {dialog === 'icon' && sel && (
        <Modal open title={`Icon for ${sel.name}`} onClose={() => setDialog(null)} footer={<button className={btn.secondary} onClick={() => setDialog(null)}>Done</button>}>
          <div className="flex flex-wrap gap-2">{STRUCTURE_TYPE_ICONS.map(i => (
            <button key={i} type="button" aria-label={i} aria-pressed={sel.icon === i} onClick={() => onOps(buildingEditOps(tree, sel.id, { icon: i }))}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border ${sel.icon === i ? 'border-accent bg-accent/10' : 'border-hairline'}`}><BIcon name={i} size={22} /></button>
          ))}</div>
        </Modal>
      )}
      {dialog === 'remove' && sel && (
        <Modal open title={`Remove ${sel.name}?`} onClose={() => setDialog(null)} footer={<>
          <button className={btn.secondary} onClick={() => setDialog(null)}>Cancel</button>
          <button className={btn.danger} onClick={() => { if (onOps(buildingEditOps(tree, sel.id, 'remove'))) onChange(null); setDialog(null); }}>Remove</button>
        </>}>
          <p className="text-sm text-body">Inspectors won’t be offered {sel.name} on new inspections. Buildings already added to a job keep theirs.</p>
        </Modal>
      )}
    </div>
  );
}
