'use client';

// The workspace for whatever is selected in the tree: a system, a group, or a component (Details · Requirements ·
// Fields · Applicability · Report). Everything edits the one draft through `onOps`; nothing here reads or writes
// anything else.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { structureTypesOf } from '@/lib/templateBuilder/core/structureTypes';
import { assessesCondition, includeOps, isCovered, itemSummary, locate, locateOff, ops, recordsNothingHere } from '@/lib/templates/editorModel';
import { requirementsOf } from '@/lib/templates/requirementModel';
import { AboutRows, AlsoShowIn, CommitInput, ComponentCondition, ComponentFields, FacetRow, GroupDetails, ItemsPanel, LinkOverview, UnseenPill, notShownToInspectors, type TypeView } from './EditorParts';
import { RequirementsEditor } from './RequirementsEditor';
import { RuleEditor } from './RuleEditor';
import { Menu, Pill, Toggle, btn, label } from './ui';
import { MoveToDialog, moveBlockFor } from './MoveTo';
import { EveryTypeOperates } from './TypeBuilder';
import { LimitationsRow, PartLimitations } from './GatesPanel';
import { useBuildingLens } from './BuildingLens';
import { MaterialAnswers } from './MaterialsBuilder';

type Sel = { systemId: string | null; nodeId: string | null };
type OnOps = (o: TemplateOp[]) => boolean;
export type ComponentTab = 'overview' | 'limitations' | 'condition' | 'details' | 'requirements' | 'applicability';

// ONE SHAPE AT EVERY LEVEL (owner 2026-11-07, mockup https://claude.ai/artifact/CgiHJ5LqFQb4hAFSrAr3ox, "approved"): an item
// has no tabs. 'overview' is its rows (Limitations · Condition · Details · Requirements · Applies when); every other value
// is the screen one of those rows opens, with back to the item. A system's and a group's 'limitations' is their own
// Limitations screen. Selecting anything opens its rows ('overview'). Links (an item shown from another system) keep
// their two tabs.
const TAB_LABEL: Record<ComponentTab, string> = { overview: 'Item', limitations: 'Limitations', condition: 'Condition', details: 'Details', requirements: 'Requirements', applicability: 'Applies when' };

/** A request to bring one panel section into view (the tree's section rows, owner 2026-11-05). `n` changes per click. */
export type Reveal = { id: string; n: number };

export function NodeWorkspace({ tree, sel, onSelect, onOps, disabled, tab, setTab, onOpenBuildingTypes, typeView, reveal }: {
  tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: OnOps; disabled: boolean;
  tab: ComponentTab; setTab: (t: ComponentTab) => void; onOpenBuildingTypes: () => void;
  /** The selected system's by-type layout (owner 2026-11-05), when it has one. */
  typeView?: TypeView | null;
  reveal?: Reveal | null;
}) {
  // NO JUMPING (owner 2026-11-05): every panel below shares ONE scroll box, so a new selection used to open scrolled to
  // wherever the last one was (the type chips half hidden). Each selection opens at its top; a section row in the tree
  // scrolls this box — and only this box — to that section.
  const sk = `${sel.systemId ?? ''}|${sel.nodeId ?? ''}`;
  // A switch turned ON with nothing behind it yet opens its empty tab for this item (it is "on" once something is added).
  const [opened, setOpened] = useState<Record<string, { details?: boolean; reqs?: boolean }>>({});
  // The building selected in the strip (2026-11-06): the panel's switch says whether this part is in THAT building.
  const lens = useBuildingLens();
  // "Move to…" (owner 2026-11-05, mockup XtoreixMRS7sZ4YyKMTUqp): the ⋯ menu on a group's and an item's title.
  const [moving, setMoving] = useState<string | null>(null);
  const moveMenu = (id: string) => (
    <Menu label="More for this" items={[{ label: 'Move to…', onSelect: () => setMoving(id), disabled: (disabled && 'The draft can’t change right now.') || moveBlockFor(tree, id) || false }]} />
  );
  const moveDialog = moving && <MoveToDialog tree={tree} nodeId={moving} onOps={onOps} onClose={() => setMoving(null)} onMoved={sysId => onSelect({ systemId: sysId, nodeId: moving })} />;
  const system = sel.systemId ? tree.systems.find(s => s.id === sel.systemId) ?? null : null;
  const loc = sel.nodeId ? locate(tree, sel.nodeId) : null;
  // SWITCHED OFF (owner 2026-11-05): a set-aside system, group or item opens with its switch Off and what it holds; the
  // switch turns it back on where it was. Editing waits until it is on.
  const off = !loc ? locateOff(tree, sel.nodeId ?? (system ? null : sel.systemId)) : null;
  if (off) {
    const kind = off.offSystem ? 'System' : off.node.kind === 'component' ? 'Component' : 'Group';
    const where = off.offSystem ? '' : `${off.parent && off.parent.id !== off.system.id ? pathOf(tree, off.parent.id) + ' › ' + off.parent.label : off.system.label} · `;
    return (
      <Shell scrollKey={sk} reveal={reveal} kind={kind} title={off.node.label} sub={`${where}${OFF_SUB}`} onBack={off.offSystem ? undefined : { label: off.parent && off.parent.id !== off.system.id ? off.parent.label : off.system.label, go: () => onSelect({ systemId: off.system.id, nodeId: off.parent && off.parent.id !== off.system.id ? off.parent.id : null }) }}
        action={<IncludedSwitch on={false} label={off.node.label} disabled={disabled} onChange={v => { if (v) onOps(includeOps(tree, off.node.id, true)); }} />}>
        <OffContents node={off.node} />
      </Shell>
    );
  }
  if (!system) return <p className="px-4 py-6 text-sm text-muted">{tree.systems.length ? 'Pick a system or component in the tree.' : 'Add a system to start.'}</p>;
  const open = (id: string) => onSelect({ systemId: system.id, nodeId: id });

  // A part's Limitations screen opens from its first row; an item's limitations from inside its rows.
  const openLimits = (id: string) => { onSelect({ systemId: system.id, nodeId: id }); setTab('limitations'); };
  const limitsScreen = (part: TemplateNode, sub: string, policy?: React.ReactNode) => (
    <Shell scrollKey={`${sk}|limitations`} reveal={null} kind="Limitations" title="Limitations" sub={sub} onBack={{ label: part.label, go: () => setTab('overview') }}>
      <PartLimitations tree={tree} system={system} part={part} onOps={onOps} disabled={disabled} policy={policy} onOpenItem={openLimits} />
    </Shell>
  );
  if (!loc || loc.depth === 0) {
    if (tab === 'limitations') return limitsScreen(system, system.label);
    return (
      <Shell scrollKey={sk} reveal={reveal} kind="System" title={system.label} onRename={v => onOps(ops.rename(system.id, v))} renameDisabled={disabled}
        tips={{ value: system.description ?? '', what: 'system', onCommit: v => onOps(ops.describe(system.id, v)) }}
        sub={isCovered(tree, system) ? ON_SUB : OFF_SUB}
        action={<IncludedSwitch on={lens ? lens.isIn(system.id) : isCovered(tree, system)} label={system.label} disabled={disabled} onChange={v => onOps(lens ? lens.set(system.id, v) : includeOps(tree, system.id, v))} />}>
        <ItemsPanel tree={tree} system={system} sel={sel} onSelect={onSelect} onOps={onOps} onOpen={open} disabled={disabled} typeView={typeView}
          about={<AboutRows><LimitationsRow tree={tree} part={system} onOpen={() => setTab('limitations')} /></AboutRows>} />
      </Shell>
    );
  }
  const node = loc.node;
  const path = pathOf(tree, node.id);
  // BACK, ONE LEVEL (owner 2026-11-06: "a back button in the top left corner … next to the home icon … remove the x"): an item
  // goes back to its group, a group (or an item straight under the system) to the system.
  // A type-chip system (Heating, Cooling, Water Heater, Fireplace) is reached by its chips, so back goes to the system.
  const up = !typeView && loc.parent && loc.parent.id !== system.id && loc.parent.kind !== 'component' ? loc.parent : null;
  const close = { label: up ? up.label : system.label, go: () => onSelect({ systemId: system.id, nodeId: up ? up.id : null }) };
  if (node.kind !== 'component') {
    if (tab === 'limitations') return limitsScreen(node, `${path} › ${node.label}`);
    return (
      <Shell scrollKey={sk} reveal={reveal} kind="Group" title={node.label} sub={`${path} · ${ON_SUB}`} onBack={close} onRename={v => onOps(ops.rename(node.id, v))} renameDisabled={disabled}
        tips={{ value: node.description ?? '', what: 'group', onCommit: v => onOps(ops.describe(node.id, v)) }}
        menu={moveMenu(node.id)}
        action={<IncludedSwitch on={lens ? lens.isIn(node.id) : true} label={node.label} disabled={disabled} onChange={v => { if (lens) onOps(lens.set(node.id, v)); else if (!v) onOps(includeOps(tree, node.id, false)); }} />}>
        <GroupDetails tree={tree} system={system} node={node} onOps={onOps} onOpen={open} selected={sel.nodeId} disabled={disabled}
          about={<AboutRows><LimitationsRow tree={tree} part={node} onOpen={() => setTab('limitations')} /></AboutRows>} />
        {moveDialog}
      </Shell>
    );
  }
  if (node.pointsTo) {
    const lt: ComponentTab = tab === 'applicability' ? 'applicability' : 'overview';
    return (
      <Shell scrollKey={sk} reveal={reveal} kind="Link" title={node.label} sub={path} onBack={close}
        tabs={(['overview', 'applicability'] as const).map(t => (
          <button key={t} role="tab" aria-selected={lt === t} onClick={() => setTab(t)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${lt === t ? 'border-accent text-ink' : 'border-transparent text-body hover:text-ink'}`}>{TAB_LABEL[t]}</button>
        ))}>
        {lt === 'overview' && <LinkOverview tree={tree} node={node} onOpen={(s, n) => onSelect({ systemId: s, nodeId: n })} onOps={onOps} disabled={disabled} />}
        {lt === 'applicability' && <Applicability tree={tree} system={system} node={node} onOps={onOps} disabled={disabled} onOpenBuildingTypes={onOpenBuildingTypes} />}
      </Shell>
    );
  }
  const reqs = requirementsOf(node).length;
  const unseen = notShownToInspectors(system, node, loc.parent?.id ?? system.id);
  const o = opened[node.id] ?? {};
  const detailsOn = !!(node.attributes?.length || node.method?.length) || !!o.details;
  const reqsOn = reqs > 0 || !!o.reqs;
  const mark = (k: 'details' | 'reqs', v: boolean) => setOpened(cur => ({ ...cur, [node.id]: { ...cur[node.id], [k]: v } }));
  const onDetails = (on: boolean) => { const x = ops.switchDetails(node, on); if (x.length && !onOps(x)) return; mark('details', on); };
  const onReqs = (on: boolean) => { const x = ops.switchRequirements(node, on); if (x.length && !onOps(x)) return; mark('reqs', on); if (on) setTab('requirements'); };
  const nothing = !assessesCondition(node) && !detailsOn && !reqsOn;
  // The screen one of the item's rows opens: same header shape, back goes to the item.
  const facet = (t: Exclude<ComponentTab, 'overview'>, body: React.ReactNode) => (
    <Shell scrollKey={`${sk}|${t}`} reveal={null} kind={TAB_LABEL[t]} title={TAB_LABEL[t]} sub={`${path} › ${node.label}`} onBack={{ label: node.label, go: () => setTab('overview') }}>
      {body}
    </Shell>
  );
  const sw = (title: string, hint: string, on: boolean, onChange: (v: boolean) => void) => (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-hairline px-3 py-3">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{title}</p><p className="text-xs text-muted">{hint}</p></div>
      <Toggle on={on} disabled={disabled} label={title} onChange={onChange} />
    </div>
  );
  if (tab === 'limitations') return limitsScreen(node, `${path} › ${node.label}`, <EveryTypeOperates tree={tree} system={system} node={node} onOps={onOps} disabled={disabled} />);
  if (tab === 'condition') return facet('condition', <>
    {sw('Inspectors rate its condition', 'Satisfactory · Limitation · Finding', assessesCondition(node), v => onOps(ops.assessed(node.id, v)))}
    {assessesCondition(node) && <ComponentCondition node={node} onOps={onOps} disabled={disabled} />}</>);
  if (tab === 'details') return facet('details', <>
    {sw('Inspectors record details', 'Material, type or count', detailsOn, onDetails)}
    {detailsOn && <><MaterialAnswers tree={tree} system={system} node={node} onOps={onOps} onOpen={open} selected={sel.nodeId} disabled={disabled} /><ComponentFields node={node} onOps={onOps} disabled={disabled} /></>}</>);
  if (tab === 'requirements') return facet('requirements', <>
    {sw('Requirements', 'Proof photos and readings', reqsOn, onReqs)}
    {reqsOn && <RequirementsEditor tree={tree} node={node} onOps={onOps} disabled={disabled} />}</>);
  if (tab === 'applicability') return facet('applicability', <Applicability tree={tree} system={system} node={node} onOps={onOps} disabled={disabled} onOpenBuildingTypes={onOpenBuildingTypes} />);
  // THE ITEM: its rows, then where else it shows.
  const shortcuts = ((node as TemplateNode & { findingShortcuts?: unknown[] }).findingShortcuts ?? []).length;
  const aw = (node as TemplateNode & { appliesWhen?: unknown }).appliesWhen;
  return (
    <Shell scrollKey={sk} reveal={reveal} kind="Component" title={node.label} sub={`${path} · ${ON_SUB}`} onBack={close} onRename={node.pointsTo ? undefined : v => onOps(ops.rename(node.id, v))} renameDisabled={disabled}
      tips={{ value: node.description ?? '', what: 'item', onCommit: v => onOps(ops.describe(node.id, v)) }}
      menu={moveMenu(node.id)}
      action={<IncludedSwitch on={lens ? lens.isIn(node.id) : true} label={node.label} disabled={disabled} onChange={v => { if (lens) onOps(lens.set(node.id, v)); else if (!v) onOps(includeOps(tree, node.id, false)); }} />} badge={unseen ? <UnseenPill /> : recordsNothingHere(node) ? <Pill tone="warn">Hidden — nothing to record</Pill> : null}>
      <div className="space-y-5 px-4 py-4">
        <AboutRows>
          <LimitationsRow tree={tree} part={node} onOpen={() => setTab('limitations')} />
          <FacetRow title="Condition" line={assessesCondition(node) ? `Satisfactory · Limitation · Finding${shortcuts ? ` · ${shortcuts} quick finding${shortcuts === 1 ? '' : 's'}` : ''}` : 'Off — not rated'} onOpen={() => setTab('condition')} />
          <FacetRow title="Details" line={detailsOn ? ((node.attributes ?? []).map(a => a.label).join(' · ') || 'On · nothing asked yet') : 'Off'} onOpen={() => setTab('details')} />
          <FacetRow title="Requirements" line={reqs ? `${reqs} proof photo${reqs === 1 ? '' : 's'} or reading${reqs === 1 ? '' : 's'}` : reqsOn ? 'On · none yet' : 'Off'} count={reqs || undefined} onOpen={() => setTab('requirements')} />
          <FacetRow title="Applies when" line={aw === undefined || aw === null ? 'Always, whenever its system is in the inspection' : 'Only when its rule holds'} onOpen={() => setTab('applicability')} />
        </AboutRows>
        {nothing && <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink">Nothing to record — inspectors won’t see this item.</p>}
        <AlsoShowIn tree={tree} systemId={system.id} node={node} onOps={onOps} disabled={disabled} />
      </div>
      {moveDialog}
    </Shell>
  );
}

function pathOf(tree: InspectionTemplate, id: string): string {
  const parts: string[] = []; let cur = locate(tree, id);
  while (cur && cur.parent) { parts.unshift(cur.parent.label); cur = locate(tree, cur.parent.id); }
  return parts.join(' › ');
}

const ON_SUB = 'Included in new inspections';
const OFF_SUB = 'Not included — inspectors can still add it during an inspection';

/** What a switched-off system or group holds — read-only until it is switched back on. */
function OffContents({ node }: { node: TemplateNode }) {
  const kids = node.children ?? [];
  return (
    <div className="space-y-3 px-4 py-4">
      <p className="rounded-lg bg-ground px-3 py-2 text-xs text-body">Off: new inspections leave it out, and inspectors can add it on site. Switch it on to edit it.</p>
      {node.kind === 'component'
        ? <p className="text-sm text-body">{itemSummary(node)}</p>
        : <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {kids.map(c => <li key={c.id} className="px-3 py-2"><span className="block truncate text-sm font-medium text-muted">{c.label}</span>
              {c.kind === 'component' && <span className="block truncate text-xs text-muted">{itemSummary(c)}</span>}</li>)}
            {!kids.length && <li className="px-3 py-3 text-xs text-muted">Nothing inside.</li>}
          </ul>}
    </div>
  );
}

/** Whether new inspections include a system, group or item — ONE switch on the title line (owner 2026-10-27 for systems;
 *  2026-11-05 for groups and items). Off still lets inspectors add it during an inspection (editorModel.includeOps). */
function IncludedSwitch({ on, label: name, disabled, onChange }: { on: boolean; label: string; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 pt-1">
      <span className={`text-xs font-semibold ${on ? 'text-ink' : 'text-muted'}`}>{on ? 'Included' : 'Not included'}</span>
      <Toggle on={on} disabled={disabled} label={`${name} included in new inspections`} onChange={onChange} />
    </div>
  );
}

function Shell({ kind, title, sub, onBack, badge, tabs, action, menu, children, scrollKey, reveal, onRename, renameDisabled, tips }: {
  kind: string; title: string; sub: string; onBack?: { label: string; go: () => void }; badge?: React.ReactNode; tabs?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
  /** The ⋯ menu beside the switch ("Move to…"). */
  menu?: React.ReactNode;
  scrollKey: string; reveal?: Reveal | null;
  /** The name is edited in the title itself, behind a pencil — no separate Name box (owner 2026-11-05). */
  onRename?: (v: string) => void; renameDisabled?: boolean;
  /** Tips (the node's `description`) open from an ⓘ beside the title, like the phone's ⓘ (owner 2026-11-05). */
  tips?: { value: string; what: 'system' | 'group' | 'item'; onCommit: (v: string) => void };
}) {
  const [tipsOpen, setTipsOpen] = useState(false);
  useEffect(() => { setTipsOpen(false); }, [scrollKey]);
  const box = useRef<HTMLDivElement>(null);
  // A new selection opens at the top of its panel.
  useLayoutEffect(() => { if (box.current) box.current.scrollTop = 0; }, [scrollKey]);
  // A section row in the tree: scroll THIS box to the section (never the page or the tree), after the reset above.
  useLayoutEffect(() => {
    const b = box.current; if (!b || !reveal) return;
    const el = b.querySelector<HTMLElement>(`#${reveal.id}`);
    if (el) b.scrollTop = Math.max(0, el.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 8);
  }, [reveal?.n]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 px-4 pt-3">
        {onBack && <button type="button" aria-label={`Back to ${onBack.label}`} title={`Back to ${onBack.label}`} onClick={onBack.go}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline text-body hover:bg-ink/5 hover:text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>}
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline text-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{kind === 'Component' ? <rect x="5" y="5" width="14" height="14" rx="3" /> : <path d="M3 10.5L12 4l9 6.5V20H3z" />}</svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-0.5">
            <TitleName title={title} kind={kind} onRename={onRename} disabled={renameDisabled} resetKey={scrollKey} />
            {tips && <TipsButton has={!!tips.value.trim()} open={tipsOpen} onClick={() => setTipsOpen(o => !o)} />}
          </div>
          <p className="truncate text-xs text-muted">{kind}{sub ? ` · ${sub}` : ''}</p>
          {badge && <div className="mt-1">{badge}</div>}
        </div>
        {action}
        {menu}
      </header>
      {tips && tipsOpen && <TipsBox tips={tips} disabled={renameDisabled} onDone={() => setTipsOpen(false)} />}
      {tabs && <div role="tablist" aria-label="Component" className="mt-2 flex overflow-x-auto border-b border-hairline px-2">{tabs}</div>}
      {!tabs && <div className="mt-3 border-b border-hairline" />}
      <div ref={box} data-editor-scroll className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/** The ⓘ beside the title: blue and filled when Tips are written, grey outline when not — the phone's own signal. */
function TipsButton({ has, open, onClick }: { has: boolean; open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={has ? 'Tips (written) — show or edit' : 'Add tips'} title={has ? 'Tips' : 'Add tips'}
      className={`${btn.icon} shrink-0`}>
      <span className={`inline-flex h-[17px] w-[17px] items-center justify-center rounded-full border-[1.5px] font-serif text-[10px] font-extrabold italic ${has ? 'border-accent bg-accent text-white' : 'border-muted text-muted'}`}>i</span>
    </button>
  );
}

/** The Tips box the ⓘ opens, under the title. Saves when you leave the box; Done closes it. */
function TipsBox({ tips, disabled, onDone }: { tips: NonNullable<Parameters<typeof Shell>[0]['tips']>; disabled?: boolean; onDone: () => void }) {
  const hint = tips.what === 'item'
    ? 'Inspectors see these when they tap the blue ⓘ beside the item on the phone. Never in the report.'
    : `Inspectors see these on the ${tips.what}’s tile on the phone. Never in the report.`;
  return (
    <div className="mx-4 mt-2 space-y-1.5 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2.5">
      <label className={label} htmlFor="tb-tips">Tips</label>
      <CommitInput id="tb-tips" value={tips.value} multiline ariaLabel={`${tips.what[0].toUpperCase()}${tips.what.slice(1)} tips`} disabled={disabled} onCommit={tips.onCommit}
        placeholder={tips.what === 'item' ? 'What to look at, how your company wants it done' : `Tips or training for inspectors on this ${tips.what}`} />
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[11px] text-muted">{hint}</p>
        <button type="button" className={btn.secondary + ' px-3 py-1'} onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

/** The panel title; with `onRename`, a pencil beside it turns the title into a box (Enter or leaving it saves, Esc cancels). */
function TitleName({ title, kind, onRename, disabled, resetKey }: { title: string; kind: string; onRename?: (v: string) => void; disabled?: boolean; resetKey: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(title);
  const cancelled = useRef(false);
  useEffect(() => { setEditing(false); }, [resetKey]);
  const name = kind === 'Component' ? 'item' : kind.toLowerCase();
  if (editing && onRename) {
    const done = () => { setEditing(false); if (cancelled.current) { cancelled.current = false; return; } const t = v.trim(); if (t && t !== title) onRename(t); };
    return <input autoFocus value={v} aria-label={`${kind === 'Component' ? 'Item' : kind} name`} onChange={e => setV(e.target.value)} onBlur={done}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); } }}
      className="w-full rounded-md border border-accent bg-surface px-1.5 py-0 text-lg font-bold tracking-tight text-ink outline-none" />;
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <h2 className="truncate text-lg font-bold tracking-tight text-ink">{title}</h2>
      {onRename && <button type="button" aria-label={`Rename ${name}`} title={`Rename ${name}`} disabled={disabled} className={`${btn.icon} shrink-0 disabled:opacity-40`}
        onClick={() => { setV(title); cancelled.current = false; setEditing(true); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
      </button>}
    </div>
  );
}

// ── Applicability ───────────────────────────────────────────────────────────────────────────────────────────

function Applicability({ tree, system, node, onOps, disabled, onOpenBuildingTypes }: {
  tree: InspectionTemplate; system: TemplateNode; node: TemplateNode; onOps: OnOps; disabled: boolean; onOpenBuildingTypes: () => void;
}) {
  const x = node as TemplateNode & { appliesWhen?: unknown; whenUnknown?: 'show' | 'hide'; appliesToTypes?: string[] };
  const types = useMemo(() => structureTypesOf(tree), [tree]);
  const withSystem = types.types.filter(t => t.systems.includes(system.id));
  const [wu, setWu] = useState<'show' | 'hide'>(x.whenUnknown ?? 'show');
  useEffect(() => { setWu(x.whenUnknown ?? 'show'); }, [x.whenUnknown]);
  return (
    <div className="space-y-6 px-4 py-4">
      <section>
        <p className={label}>Building types</p>
        <div className="rounded-xl border border-hairline px-3 py-3 text-sm text-body">
          <p>This item is part of <span className="font-semibold text-ink">{system.label}</span>. {isCovered(tree, system) ? 'The main building covers it when an inspection starts.' : 'The main building doesn’t cover it by default.'}</p>
          <p className="mt-1">{withSystem.length
            ? <>Other buildings that start with {system.label}: {withSystem.map(t => t.name).join(', ')}.</>
            : <>No other building type starts with {system.label}.</>}
            {types.source === 'ledrix-default' && ' (Ledrix’s default building types.)'}</p>
          <button className={`${btn.ghost} mt-2 px-0`} onClick={onOpenBuildingTypes}>Edit building types →</button>
        </div>
      </section>

      <section>
        <p className={label}>When this item is inspected</p>
        <RuleEditor tree={tree} forNodeId={node.id} rule={x.appliesWhen} idPrefix={`aw-${node.id}`} disabled={disabled}
          emptyText="Always, whenever its system is in the inspection."
          onSave={r => onOps(ops.applicability(node, r, r === null ? null : wu === 'hide' ? 'hide' : null))} />
        {x.appliesWhen !== undefined && (
          <fieldset className="mt-3">
            <legend className="text-xs font-semibold text-ink">Before that answer is recorded</legend>
            <div className="mt-1 space-y-1 text-sm text-body">
              {(['show', 'hide'] as const).map(v => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name={`wu-${node.id}`} checked={wu === v} disabled={disabled}
                    onChange={() => { if (onOps(ops.whenUnknown(node.id, v === 'hide'))) setWu(v); }} />
                  {v === 'show' ? 'Show the item — the inspector decides' : 'Hide the item until the answer says it applies'}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="mt-3 text-[11px] text-muted">Rules test answers recorded elsewhere in this inspection. Being hard to reach isn’t a rule: the inspector records a limitation, so the item is still reported.</p>
      </section>

      {!!x.appliesToTypes?.length && (
        <section>
          <p className={label}>Equipment types (Ledrix)</p>
          <p className="text-sm text-body">Inspected for: {x.appliesToTypes.join(', ')}. Set by Ledrix; not editable here.</p>
        </section>
      )}
    </div>
  );
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────────────────