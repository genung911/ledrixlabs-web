'use client';

// "Move to…" (owner 2026-11-05, mockup https://claude.ai/artifact/XtoreixMRS7sZ4YyKMTUqp, "Yes on all 3. Approved"):
// pick a system, then a group, then the spot — the item (or group) moves there as ONE change (lib/templates/moveModel).
// What cannot move says why, in the menu, before anything opens.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import ledrixPack from '@/lib/scope/core/taxonomy/ledrix.core.json';
import { moveBlock, moveOps, moveTargets, whereIs } from '@/lib/templates/moveModel';
import { copyGroupOf, typeLayoutOf } from '@/lib/templates/typeLayout';
import { rulesFor } from './phonePreviewModel';
import { Modal, btn } from './ui';

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
  if (!here) return null;
  const group = here.node.kind !== 'component';
  const t = targets.find(x => x.system.id === sysId) ?? null;
  const home: TemplateNode | null = t ? (t.homes.find(h => h.id === homeId) ?? (t.homes.length === 1 ? t.homes[0] : null)) : null;
  const siblings = (home?.children ?? []).filter(c => c.id !== nodeId && (group ? c.kind === 'subsystem' : true));
  const after = afterId === undefined ? (siblings[siblings.length - 1]?.id ?? null) : afterId;
  const o = home ? moveOps(tree, nodeId, home.id, after) : [];
  const where = home ? `${t!.system.label}${home.id !== t!.system.id ? ` › ${home.label}` : ''}` : '';
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
              onClick={() => { setSysId(x.system.id); setHomeId(null); setAfterId(undefined); }}>
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
          </div>
        )}
        <div className={col} role="listbox" aria-label="Where">
          <p className="sticky top-0 bg-ground px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Place it</p>
          {home ? (<>
            <button type="button" role="option" aria-selected={after === null} className={opt(after === null)} onClick={() => setAfterId(null)}>At the top</button>
            {siblings.map(c => (
              <button key={c.id} type="button" role="option" aria-selected={after === c.id} className={opt(after === c.id)} onClick={() => setAfterId(c.id)}>After {c.label}</button>
            ))}
          </>) : <p className="px-3 py-2 text-xs text-muted">{group ? 'Choose a system.' : 'Choose a group.'}</p>}
        </div>
      </div>
      {home && (
        <div className="mt-3 rounded-lg border border-hairline bg-ground px-3 py-2 text-sm">
          {o.length ? <span><strong className="text-ink">{here.node.label}</strong> moves to <strong className="text-ink">{where}</strong>{afterLabel ? `, after ${afterLabel}` : ', at the top'}.</span>
            : <span className="text-muted">That is where it already is.</span>}
          {leftEmpty && o.length > 0 && <span className="mt-1 block text-xs text-muted">{here.parent.label} will be empty. It stays, for you to switch off, rename or fill.</span>}
          {here.system.id !== t!.system.id && o.length > 0 && <span className="mt-1 block text-xs text-muted">New inspections show it, and report it, under {t!.system.label} (phone build 717 or later). Inspections already started keep their own copy.</span>}
        </div>
      )}
    </Modal>
  );
}
