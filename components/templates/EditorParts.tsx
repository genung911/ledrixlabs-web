'use client';

// The template editor's hand-editing parts: the systems column, a system's items, and an item's details.
// Every change is a list of template operations (lib/templates/editorModel `ops`), applied through `onOps`, so a
// direct edit takes the same validated, undoable path as an accepted Ledrix proposal. Text commits on blur or
// Enter — one change per edit, not one per keystroke.
import { useEffect, useState } from 'react';
import type { InspectionTemplate, TemplateNode, ComponentAttribute } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp, FindingShortcut } from '@/lib/templateBuilder/core/templateOps';
import { flatItems, itemSummary, locate, ops } from '@/lib/templates/editorModel';
import { ChipList, Menu, Pill, Toggle, btn, field, label } from './ui';

type Sel = { systemId: string | null; nodeId: string | null };
type OnOps = (o: TemplateOp[]) => boolean;

/** A text input that commits on blur / Enter, and follows outside changes when not being edited. */
function CommitInput({ value, onCommit, multiline, ariaLabel, placeholder, className = '', disabled }: {
  value: string; onCommit: (v: string) => void; multiline?: boolean; ariaLabel: string; placeholder?: string; className?: string; disabled?: boolean;
}) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setV(value); }, [value, focused]);
  const commit = () => { setFocused(false); if (v !== value) onCommit(v); };
  const common = { value: v, disabled, 'aria-label': ariaLabel, placeholder, onFocus: () => setFocused(true), onBlur: commit,
    onChange: (e: { target: { value: string } }) => setV(e.target.value) };
  return multiline
    ? <textarea {...common} rows={3} className={`${field} resize-y ${className}`} />
    : <input {...common} className={`${field} ${className}`} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); } }} />;
}

const Arrow = ({ dir }: { dir: 'up' | 'down' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{dir === 'up' ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}</svg>
);

// ── systems ────────────────────────────────────────────────────────────────────────────────────────────────

export function SystemsColumn({ tree, sel, onSelect, onOps, disabled }: { tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: OnOps; disabled: boolean }) {
  const [adding, setAdding] = useState('');
  const covered = tree.systems.filter(s => s.defaultActive !== false).length;
  return (
    <section aria-label="Systems" className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface">
      <header className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Systems</h2>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Covered</span>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {tree.systems.map((s, i) => {
          const on = sel.systemId === s.id;
          return (
            <li key={s.id} className={`group flex items-center gap-1 px-1.5 ${on ? 'bg-accent/10' : ''}`}>
              <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button aria-label={`Move ${s.label} up`} disabled={disabled || i === 0} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i - 1))}><Arrow dir="up" /></button>
                <button aria-label={`Move ${s.label} down`} disabled={disabled || i === tree.systems.length - 1} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i + 1))}><Arrow dir="down" /></button>
              </div>
              <button onClick={() => onSelect({ systemId: s.id, nodeId: null })} aria-current={on ? 'true' : undefined}
                className={`min-w-0 flex-1 truncate py-2 text-left text-sm ${on ? 'font-semibold text-accent-ink' : s.defaultActive === false ? 'text-muted' : 'text-ink'}`}>{s.label}</button>
              <Toggle on={s.defaultActive !== false} disabled={disabled} label={`${s.label} is covered when an inspection starts`} onChange={v => onOps(ops.coverByDefault(s.id, v))} />
              <Menu label={`More for ${s.label}`} items={[{ label: 'Set aside', disabled: disabled && 'The draft can’t change right now.', onSelect: () => onOps(ops.setAside(s.id)) }]} />
            </li>
          );
        })}
        {!tree.systems.length && <li className="px-3 py-4 text-xs text-muted">No systems yet. Add the first one below.</li>}
      </ul>
      {!!tree.trimmedSystems?.length && (
        <details className="border-t border-hairline px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted">Set aside ({tree.trimmedSystems.length})</summary>
          <ul className="mt-1 space-y-1">{tree.trimmedSystems.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-2"><span className="truncate text-body">{s.label}</span>
              <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => onOps(ops.restore(s.id))}>Restore</button></li>))}</ul>
        </details>
      )}
      <form className="flex gap-1.5 border-t border-hairline p-2" onSubmit={e => { e.preventDefault(); if (adding.trim() && onOps(ops.addSystem(tree, adding))) setAdding(''); }}>
        <input value={adding} onChange={e => setAdding(e.target.value)} placeholder="Add system" aria-label="New system name" disabled={disabled} className={`${field} py-1.5`} />
        <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !adding.trim()}>Add</button>
      </form>
      <p className="border-t border-hairline px-3 py-2 text-[11px] text-muted">{covered} of {tree.systems.length} covered when an inspection starts</p>
    </section>
  );
}

// ── a system's items ───────────────────────────────────────────────────────────────────────────────────────

export function ItemsPanel({ tree, system, sel, onSelect, onOps, onOpen, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; sel: Sel; onSelect: (s: Sel) => void; onOps: OnOps; onOpen: (id: string) => void; disabled: boolean;
}) {
  const rows = flatItems(system);
  const groups = [system, ...rows.map(r => r.node).filter(n => n.kind !== 'component' && !n.pointsTo)];
  const [parent, setParent] = useState(system.id);
  const [kind, setKind] = useState<'component' | 'subsystem'>('component');
  const [name, setName] = useState('');
  useEffect(() => { setParent(system.id); }, [system.id]);
  const setAside = rows.flatMap(r => (r.node.trimmed ?? []).map(t => ({ t, under: r.node.label }))).concat((system.trimmed ?? []).map(t => ({ t, under: system.label })));

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="space-y-2">
        <CommitInput value={system.label} ariaLabel="System name" disabled={disabled} onCommit={v => onOps(ops.rename(system.id, v))} className="text-base font-semibold" />
        <CommitInput value={system.description ?? ''} multiline ariaLabel="System guidance" placeholder="Guidance inspectors see for this system (optional)" disabled={disabled}
          onCommit={v => onOps(ops.describe(system.id, v))} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className={label + ' mb-0'}>Items</p><span className="rounded-full bg-ground px-2 py-0.5 font-mono text-xs text-body">{rows.filter(r => r.node.kind === 'component').length}</span>
        </div>
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
          {rows.map(({ node, depth, parentId }) => {
            const on = sel.nodeId === node.id;
            const siblings = (locate(tree, parentId)?.node ?? system).children ?? [];
            const idx = siblings.findIndex(c => c.id === node.id);
            const group = node.kind !== 'component';
            return (
              <li key={node.id} className={`group flex items-center gap-2 py-2 pr-2 ${on ? 'bg-accent/10' : group ? 'bg-ground' : ''}`} style={{ paddingLeft: 12 + depth * 18 }}>
                <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button aria-label={`Move ${node.label} up`} disabled={disabled || idx <= 0} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(node.id, parentId, idx - 1))}><Arrow dir="up" /></button>
                  <button aria-label={`Move ${node.label} down`} disabled={disabled || idx >= siblings.length - 1} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(node.id, parentId, idx + 1))}><Arrow dir="down" /></button>
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={() => { onSelect({ systemId: system.id, nodeId: node.id }); if (!group) onOpen(node.id); }}>
                  <p className={`truncate text-sm ${group ? 'font-semibold uppercase tracking-wide text-muted text-xs' : 'font-medium text-ink'}`}>{node.label}</p>
                  {!group && <p className="truncate text-xs text-muted">{itemSummary(node)}</p>}
                </button>
                {!group && <button aria-label={`Edit ${node.label}`} className={btn.icon} onClick={() => { onSelect({ systemId: system.id, nodeId: node.id }); onOpen(node.id); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg></button>}
                <Menu label={`More for ${node.label}`} items={[
                  ...(group ? [{ label: 'Rename', disabled: disabled && 'The draft can’t change right now.', onSelect: () => { const v = window.prompt('Group name', node.label); if (v) onOps(ops.rename(node.id, v)); } }] : []),
                  { label: 'Set aside', disabled: disabled && 'The draft can’t change right now.', onSelect: () => onOps(ops.setAside(node.id)) },
                ]} />
              </li>
            );
          })}
          {!rows.length && <li className="px-4 py-4 text-xs text-muted">No items yet.</li>}
        </ul>
        <form className="mt-2 flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); if (name.trim() && onOps(ops.addItem(tree, system.id, parent, name, kind))) setName(''); }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'component' ? 'Add item, e.g. Kick-out flashing' : 'Add group'} aria-label="New item name" disabled={disabled} className={`${field} min-w-[10rem] flex-1 py-1.5`} />
          <select aria-label="Add under" value={parent} onChange={e => setParent(e.target.value)} disabled={disabled} className={`${field} w-auto py-1.5`}>
            {groups.map(g => <option key={g.id} value={g.id}>{g.id === system.id ? `in ${system.label}` : `in ${g.label}`}</option>)}
          </select>
          <select aria-label="Kind" value={kind} onChange={e => setKind(e.target.value as 'component' | 'subsystem')} disabled={disabled} className={`${field} w-auto py-1.5`}>
            <option value="component">Item</option><option value="subsystem">Group</option>
          </select>
          <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !name.trim()}>Add</button>
        </form>
      </div>

      {!!setAside.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Set aside in {system.label} ({setAside.length})</summary>
          <ul className="mt-1 space-y-1">{setAside.map(({ t, under }) => (
            <li key={t.id} className="flex items-center justify-between gap-2"><span className="truncate text-body">{t.label} <span className="text-muted">· {under}</span></span>
              <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => onOps(ops.restore(t.id))}>Restore</button></li>))}</ul>
        </details>
      )}
    </div>
  );
}

// ── an item's details (slide-over) ─────────────────────────────────────────────────────────────────────────

export function ItemDrawer({ node, path, onOps, onClose, disabled }: { node: TemplateNode; path: string; onOps: OnOps; onClose: () => void; disabled: boolean }) {
  const shortcuts = ((node as TemplateNode & { findingShortcuts?: FindingShortcut[] }).findingShortcuts ?? []).map(s => s.label);
  const [newField, setNewField] = useState('');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0"><p className="truncate text-[11px] text-muted">{path}</p><h3 className="truncate text-base font-semibold text-ink">{node.label}</h3></div>
        <button aria-label="Close item" className={btn.icon} onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {node.pointsTo && <p className="rounded-lg bg-ground px-3 py-2 text-xs text-body">This row shows an item recorded in another section. Edit it there.</p>}
        <div>
          <label className={label}>Name</label>
          <CommitInput value={node.label} ariaLabel="Item name" disabled={disabled} onCommit={v => onOps(ops.rename(node.id, v))} />
        </div>
        <div>
          <label className={label}>Guidance</label>
          <CommitInput value={node.description ?? ''} multiline ariaLabel="Item guidance" placeholder="What the inspector should look at and record" disabled={disabled} onCommit={v => onOps(ops.describe(node.id, v))} />
        </div>

        <div>
          <div className="flex items-center justify-between"><p className={label + ' mb-0'}>Condition</p>
            <Toggle on={node.condition === true} disabled={disabled} label="Inspectors assess its condition" onChange={v => onOps(ops.assessed(node.id, v))} /></div>
          <p className="mt-1.5 text-xs text-body">{node.condition ? 'Inspectors answer Satisfactory, Limitation or Finding.' : 'Not assessed — inspectors only record what it is.'}</p>
        </div>

        <div>
          <p className={label}>Spec fields</p>
          <div className="space-y-3">
            {(node.attributes ?? []).map(a => <AttrEditor key={a.id} node={node} a={a} onOps={onOps} disabled={disabled} />)}
            {!node.attributes?.length && <p className="text-xs text-muted">No spec fields. Spec fields describe what the thing is (type, material, age) — never a grade.</p>}
          </div>
          <form className="mt-2 flex gap-1.5" onSubmit={e => { e.preventDefault(); if (newField.trim() && onOps(ops.addField(node, newField, [], false))) setNewField(''); }}>
            <input value={newField} onChange={e => setNewField(e.target.value)} placeholder="Add spec field, e.g. Material" aria-label="New spec field" disabled={disabled} className={`${field} py-1.5`} />
            <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !newField.trim()}>Add</button>
          </form>
        </div>

        {node.condition && (
          <div>
            <p className={label}>Limitation reasons</p>
            <ChipList values={node.limitations ?? []} disabled={disabled} addLabel="Add limitation reason" placeholder="e.g. Concealed by roof covering"
              onChange={v => onOps(ops.limitations(node.id, v))} />
            <p className="mt-1 text-[11px] text-muted">Shown first when an inspector taps Limitation; the app’s general reasons follow.</p>
          </div>
        )}
        {node.condition && (
          <div>
            <p className={label}>Finding shortcuts</p>
            <ChipList values={shortcuts} disabled={disabled} addLabel="Add finding shortcut" placeholder="e.g. Missing kick-out flashing"
              onChange={v => onOps(ops.findingShortcuts(node, v, Date.now()))} />
            <p className="mt-1 text-[11px] text-muted">Saved with the template and shown in this preview. The Ledrix app doesn’t read template shortcuts yet — inspectors see them after an app update.</p>
          </div>
        )}
        <div className="rounded-lg bg-ground px-3 py-2 text-[11px] text-muted">
          Required photos and required checkpoints aren’t part of templates yet — they wait on the default-obligations decision.
        </div>
      </div>
    </div>
  );
}

function AttrEditor({ node, a, onOps, disabled }: { node: TemplateNode; a: ComponentAttribute; onOps: OnOps; disabled: boolean }) {
  const typed = (a as ComponentAttribute & { allowTyped?: boolean }).allowTyped === true;
  return (
    <div className="rounded-xl border border-hairline px-3 py-3">
      <div className="flex items-center gap-2">
        <CommitInput value={a.label} ariaLabel="Spec field name" disabled={disabled} onCommit={v => onOps(ops.fieldLabel(node.id, a, v))} className="py-1.5 font-semibold" />
        <div role="radiogroup" aria-label={`${a.label}: answers`} className="inline-flex shrink-0 rounded-lg border border-hairline bg-ground p-0.5">
          {([false, true] as const).map(m => (
            <button key={String(m)} role="radio" aria-checked={!!a.multi === m} disabled={disabled} onClick={() => !!a.multi !== m && onOps(ops.fieldMulti(node.id, a, m))}
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${!!a.multi === m ? 'bg-surface text-ink shadow-sm' : 'text-body'}`}>{m ? 'Multiple' : 'Single'}</button>
          ))}
        </div>
        <Menu label={`More for ${a.label}`} items={[{ label: 'Remove spec field', danger: true, disabled: disabled && 'The draft can’t change right now.', onSelect: () => onOps(ops.removeField(node.id, a)) }]} />
      </div>
      <div className="mt-2">
        <ChipList values={a.values} disabled={disabled} addLabel={`Add choice to ${a.label}`} placeholder="Add a choice" onChange={v => onOps(ops.fieldValues(node.id, a, v))} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{a.multi ? 'Inspectors pick any that apply.' : 'Inspectors pick one.'} {typed && <Pill>Other (typed) offered</Pill>}</p>
    </div>
  );
}
