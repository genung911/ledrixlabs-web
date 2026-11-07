'use client';

// The building the Template Builder is showing (owner 2026-11-06, mockup https://claude.ai/artifact/HHfBh3wvLanc1CG4UcNxaU):
// the strip across the top picks it, and every "is this part here?" switch, list and Off list in Systems reads it.
// The main house is no lens at all (null) — the builder exactly as before, its switches the Included switches. Any other
// building: a part is listed when it is in that building, and its switch writes the building type (lib/templates/
// buildingModel.partOps, one op). Content — names, answers, condition settings — is shared; only what's in it differs.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { STRUCTURE_TYPE_ICONS, type StructureTypeDef } from '@/lib/templateBuilder/core/structureTypes';
import { propertyTypeLabel, propertyTypesOf } from '@/lib/templateBuilder/core/propertyTypes';
import { addBuildingOps, addableBuildings, buildingEditOps, buildingsOf, inBuilding, offPartsIn, parentMap, partOps } from '@/lib/templates/buildingModel';
import { Modal, btn, field } from './ui';
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

/** The building picker at the top of the systems column (owner 2026-11-06, mockup 28zjLMm9yntyJYgbKHcPbZ: "We are starting
 *  to push the working screen down" → the strip became this dropdown): ‹ › step through the home and each building like
 *  swiping on the phone; opened, it lists them, "+ Add building" (Ledrix's kinds not there yet, or your own name) and, for
 *  the selected building, Rename · Icon · Remove. */
export function BuildingPicker({ tree, value, onChange, onOps, disabled }: {
  tree: InspectionTemplate; value: string | null; onChange: (id: string | null) => void; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const buildings = buildingsOf(tree);
  const ids: Array<string | null> = [null, ...buildings.map(b => b.id)];
  const at = Math.max(0, ids.indexOf(value));
  const sel = buildings.find(b => b.id === value) ?? null;
  const [dialog, setDialog] = useState<null | 'name' | 'icon' | 'remove' | 'own'>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const step = (d: number) => onChange(ids[(at + d + ids.length) % ids.length]);
  const add = (from: StructureTypeDef | { name: string }) => { const r = addBuildingOps(tree, from, Date.now()); if (r && onOps(r.ops)) onChange(r.id); };
  const pick = (id: string | null) => { onChange(id); setOpen(false); };
  const opt = (on: boolean) => `flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${on ? 'bg-accent/15 font-semibold text-accent-ink' : 'text-ink hover:bg-ink/5'}`;
  const act = 'block w-full px-3 py-1.5 text-left text-sm text-accent-ink hover:bg-ink/5 disabled:opacity-40';
  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-1">
        <button type="button" className={btn.icon} aria-label="Previous building" onClick={() => step(-1)}>‹</button>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Building" onClick={() => setOpen(o => !o)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-accent bg-surface px-2.5 py-1.5 text-left text-xs font-semibold text-ink">
          {sel ? <BIcon name={sel.icon} size={14} /> : <BIcon name="home-outline" size={14} />}
          <span className="min-w-0 flex-1 truncate">{sel ? sel.name : homeLabelOf(tree)}</span><span aria-hidden className="text-muted">▾</span>
        </button>
        <button type="button" className={btn.icon} aria-label="Next building" onClick={() => step(1)}>›</button>
      </div>
      {open && (
        <div role="listbox" aria-label="Buildings" className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-lg">
          <button type="button" role="option" aria-selected={value === null} className={opt(value === null)} onClick={() => pick(null)}><BIcon name="home-outline" size={14} />{homeLabelOf(tree)}</button>
          {buildings.map(b => (
            <button key={b.id} type="button" role="option" aria-selected={value === b.id} className={opt(value === b.id)} onClick={() => pick(b.id)}><BIcon name={b.icon} size={14} />{b.name}</button>
          ))}
          <div className="my-1 border-t border-hairline" />
          {addableBuildings(tree).map(t => <button key={t.id} type="button" disabled={disabled} className={act} onClick={() => { setOpen(false); add(t); }}>+ {t.name}</button>)}
          <button type="button" disabled={disabled} className={act} onClick={() => { setOpen(false); setText(''); setDialog('own'); }}>+ Your own building…</button>
          {sel && (<>
            <div className="my-1 border-t border-hairline" />
            <button type="button" disabled={disabled} className={act} onClick={() => { setOpen(false); setText(sel.name); setDialog('name'); }}>Rename {sel.name}</button>
            <button type="button" disabled={disabled} className={act} onClick={() => { setOpen(false); setDialog('icon'); }}>Icon</button>
            <button type="button" disabled={disabled} className="block w-full px-3 py-1.5 text-left text-sm text-safety hover:bg-ink/5 disabled:opacity-40" onClick={() => { setOpen(false); setDialog('remove'); }}>Remove {sel.name}</button>
          </>)}
        </div>
      )}

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
