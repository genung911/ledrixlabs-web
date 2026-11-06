'use client';

// "Move to…" (owner 2026-11-05, mockup https://claude.ai/artifact/XtoreixMRS7sZ4YyKMTUqp, "Yes on all 3. Approved"):
// pick a system, then a group, then the spot — the item (or group) moves there as ONE change (lib/templates/moveModel).
// What cannot move says why, in the menu, before anything opens.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import ledrixPack from '@/lib/scope/core/taxonomy/ledrix.core.json';
import { moveBlock, moveIntoNewGroupOps, moveOps, moveTargets, newGroupClash, whereIs } from '@/lib/templates/moveModel';
import { copyGroupOf, typeLayoutOf } from '@/lib/templates/typeLayout';
import { rulesFor } from './phonePreviewModel';
import { Modal, btn, field } from './ui';

/** The pack's unit-establishing items (Furnace, Water Heater, Panel…). */
const UNIT_IDS = new Set<string>(((ledrixPack as unknown as { systems: Array<{ nodes: Array<{ id: string; establishesAs?: unknown }> }> }).systems ?? [])
  .flatMap(s => s.nodes.filter(n => n.establishesAs).map(n => n.id)));
const baseOf = (id: string) => id.replace(/~i\d+.*$/, '');
const isUnit = (id: string) => UNIT_IDS.has(baseOf(id));

/** Why this node cannot move, or null. Count copies come from the system's type layout (Indoor Head 1–8). */
export function moveBlockFor(tree: InspectionTemplate, id: string): string | null {
  const w = whereIs(tree, id);
  const layout = w ? typeLayoutOf(tree, w.system, rulesFor(tree)) : null;
  return moveBlock(tree, id, isUnit, x => !!layout && !!copyGroupOf(layout, x));
}

export function MoveToDialog({ tree, nodeId, onOps, onClose, onMoved }: {
  tree: InspectionTemplate; nodeId: string; onOps: (o: TemplateOp[]) => boolean; onClose: () => void; onMoved: (systemId: string) => void;
}) {
  const here = whereIs(tree, nodeId);
  const targets = useMemo(() => moveTargets(tree, nodeId), [tree, nodeId]);
  const [sysId, setSysId] = useState<string | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null | undefined>(undefined);   // undefined = not chosen → the end
  // "+ New group": the name being typed, and the one added (selected; created only when Move is pressed).
  const [draftName, setDraftName] = useState('');
  const [newGroup, setNewGroup] = useState<string | null>(null);
  if (!here) return null;
  const group = here.node.kind !== 'component';
  const t = targets.find(x => x.system.id === sysId) ?? null;
  const fresh = !group && !!t && newGroup !== null && homeId === null;
  const home: TemplateNode | null = t && !fresh ? (t.homes.find(h => h.id === homeId) ?? (t.homes.length === 1 && newGroup === null ? t.homes[0] : null)) : null;
  const siblings = (home?.children ?? []).filter(c => c.id !== nodeId && (group ? c.kind === 'subsystem' : true));
  const after = afterId === undefined ? (siblings[siblings.length - 1]?.id ?? null) : afterId;
  const o = fresh ? moveIntoNewGroupOps(tree, nodeId, t!.system.id, newGroup!) : home ? moveOps(tree, nodeId, home.id, after) : [];
  const where = fresh ? `${t!.system.label} › ${newGroup!.trim()}` : home ? `${t!.system.label}${home.id !== t!.system.id ? ` › ${home.label}` : ''}` : '';
  const clash = t && draftName.trim() ? newGroupClash(tree, t.system.id, draftName) : null;
  const addGroup = () => { if (!t || !draftName.trim() || clash) return; setNewGroup(draftName.trim()); setHomeId(null); setAfterId(undefined); setDraftName(''); };
  const afterLabel = after ? siblings.find(c => c.id === after)?.label : null;
  const leftEmpty = !group && here.parent.kind === 'subsystem' && (here.parent.children ?? []).length === 1 && home?.id !== here.parent.id;

  const col = 'flex max-h-72 flex-col overflow-y-auto rounded-lg border border-hairline';
  const opt = (on: boolean) => `px-3 py-1.5 text-left text-sm ${on ? 'bg-accent/15 font-semibold text-ink' : 'text-body hover:bg-ink/5'}`;
  return (
    <Modal open wide title={`Move ${here.node.label}`} onClose={onClose} footer={<>
      <button className={btn.secondary} onClick={onClose}>Cancel</button>
      <button className={btn.primary} disabled={!o.length} onClick={() => { if (onOps(o)) { onMoved(t!.system.id); onClose(); } }}>Move</button>
    </>}>
      <p className="mb-3 text-xs text-muted">Now in {here.system.label}{here.parent.id !== here.system.id ? ` › ${here.parent.label}` : ''}. Its Tips, condition, limitation reasons, quick findings, requirements and rules go with it.</p>
      <div className={`grid gap-2 ${group ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        <div className={col} role="listbox" aria-label="System">
          <p className="sticky top-0 bg-ground px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">System</p>
          {targets.map(x => (
            <button key={x.system.id} type="button" role="option" aria-selected={sysId === x.system.id} className={opt(sysId === x.system.id)}
              onClick={() => { setSysId(x.system.id); setHomeId(null); setAfterId(undefined); setNewGroup(null); setDraftName(''); }}>
              {x.system.label}{x.system.id === here.system.id ? <span className="ml-1 text-[11px] font-normal text-muted">now</span> : null}</button>
          ))}
        </div>
        {!group && (
          <div className={col} role="listbox" aria-label="Group">
            <p className="sticky top-0 bg-ground px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Group</p>
            {t ? t.homes.map(h => (
              <button key={h.id} type="button" role="option" aria-selected={home?.id === h.id} className={opt(home?.id === h.id)}
                onClick={() => { setHomeId(h.id); setAfterId(undefined); }}>{h.id === t.system.id ? `${t.system.label} (no groups)` : h.label}</button>
            )) : <p className="px-3 py-2 text-xs text-muted">Choose a system.</p>}
            {t && newGroup !== null && (
              <button type="button" role="option" aria-selected={fresh} className={opt(fresh)} onClick={() => { setHomeId(null); setAfterId(undefined); }}>
                {newGroup} <span className="ml-1 text-[11px] font-normal text-muted">new</span></button>
            )}
            {t && (
              <form className="mt-auto flex flex-wrap gap-1.5 border-t border-dashed border-hairline p-2" onSubmit={e => { e.preventDefault(); addGroup(); }}>
                <input value={draftName} onChange={e => setDraftName(e.target.value)} aria-label={`New group in ${t.system.label}`} placeholder="+ New group"
                  className={`${field} min-w-0 flex-1 py-1 text-sm`} />
                <button className={btn.secondary + ' px-3 py-1 text-xs'} disabled={!draftName.trim() || !!clash}>Add</button>
                {clash && <p className="w-full text-[11px] text-muted">{t.system.label} already has {clash.label}. Choose it above.</p>}
              </form>
            )}
          </div>
        )}
        <div className={col} role="listbox" aria-label="Where">
          <p className="sticky top-0 bg-ground px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Place it</p>
          {fresh ? (<>
            <button type="button" role="option" aria-selected className={opt(true)}>At the top</button>
            <p className="px-3 py-1.5 text-xs text-muted">The group is new, so the item is its first.</p>
          </>) : home ? (<>
            <button type="button" role="option" aria-selected={after === null} className={opt(after === null)} onClick={() => setAfterId(null)}>At the top</button>
            {siblings.map(c => (
              <button key={c.id} type="button" role="option" aria-selected={after === c.id} className={opt(after === c.id)} onClick={() => setAfterId(c.id)}>After {c.label}</button>
            ))}
          </>) : <p className="px-3 py-2 text-xs text-muted">{group ? 'Choose a system.' : 'Choose a group.'}</p>}
        </div>
      </div>
      {(home || fresh) && (
        <div className="mt-3 rounded-lg border border-hairline bg-ground px-3 py-2 text-sm">
          {fresh && o.length ? <span><strong className="text-ink">{here.node.label}</strong> moves to <strong className="text-ink">{where}</strong> (a new group).
            <span className="mt-1 block text-xs text-muted">One change: Undo removes the group and puts the item back.</span></span>
          : o.length ? <span><strong className="text-ink">{here.node.label}</strong> moves to <strong className="text-ink">{where}</strong>{afterLabel ? `, after ${afterLabel}` : ', at the top'}.</span>
            : <span className="text-muted">That is where it already is.</span>}
          {leftEmpty && o.length > 0 && <span className="mt-1 block text-xs text-muted">{here.parent.label} will be empty. It stays, for you to switch off, rename or fill.</span>}
          {here.system.id !== t!.system.id && o.length > 0 && <span className="mt-1 block text-xs text-muted">New inspections show it, and report it, under {t!.system.label} (phone build 717 or later). Inspections already started keep their own copy.</span>}
        </div>
      )}
    </Modal>
  );
}
