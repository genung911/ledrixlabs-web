'use client';

// An item row in a laid-out system (Materials first, and the type-chip view): the row opens the item; its ⋯ menu offers
// Rename (in the row), Move to… and Switch off (owner 2026-11-06: "build it, no mock up, yes switch off not delete").
// Nothing is deleted — a switched-off item goes to the Off list with everything set on it, to switch back on.
// Every change is the editor's own op (ops.rename, includeOps) or the Move to… dialog's moveOps, one change set each.
import { useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { includeOps, itemSummary, ops } from '@/lib/templates/editorModel';
import { MoveToDialog, moveBlockFor } from './MoveTo';
import { Menu } from './ui';

const LOCKED = 'The draft can’t change right now.';

export function ItemRow({ tree, node, onOps, onOpen, selected, disabled, tag }: {
  tree: InspectionTemplate; node: TemplateNode; onOps: (o: TemplateOp[]) => boolean; onOpen: (id: string) => void;
  selected: string | null; disabled: boolean; tag?: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [v, setV] = useState(node.label);
  const [moving, setMoving] = useState(false);
  const cancelled = useRef(false);
  const done = () => { setRenaming(false); if (cancelled.current) { cancelled.current = false; return; } const t = v.trim(); if (t && t !== node.label) onOps(ops.rename(node.id, t)); };
  return (
    <li className={`flex items-center gap-2 py-1 pl-3 pr-1 ${selected === node.id ? 'bg-accent/10' : ''}`}>
      {renaming ? (
        <div className="min-w-0 flex-1 py-1">
          <input autoFocus value={v} aria-label="Item name" onChange={e => setV(e.target.value)} onBlur={done}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); } }}
            className="w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 text-sm font-medium text-ink outline-none" />
          <p className="truncate pt-0.5 text-xs text-muted">{itemSummary(node)}</p>
        </div>
      ) : (
        <button className="min-w-0 flex-1 py-1 text-left" onClick={() => onOpen(node.id)}>
          <span className="block truncate text-sm font-medium text-ink">{node.label}</span>
          <span className="block truncate text-xs text-muted">{itemSummary(node)}</span>
        </button>
      )}
      {tag}
      {node.pointsTo ? <span className="w-8 flex-none" aria-hidden /> : (
        <Menu label={`More for ${node.label}`} items={[
          { label: 'Rename', disabled: disabled && LOCKED, onSelect: () => { setV(node.label); cancelled.current = false; setRenaming(true); } },
          { label: 'Move to…', disabled: (disabled && LOCKED) || moveBlockFor(tree, node.id) || false, onSelect: () => setMoving(true) },
          { label: 'Switch off', disabled: disabled && LOCKED, onSelect: () => { onOps(includeOps(tree, node.id, false)); } },
        ]} />
      )}
      {moving && <MoveToDialog tree={tree} nodeId={node.id} onOps={onOps} onClose={() => setMoving(false)} onMoved={() => {}} />}
    </li>
  );
}
