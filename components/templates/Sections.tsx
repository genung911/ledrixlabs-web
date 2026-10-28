'use client';

// The template-level sections of the editor: Overview, Requirements, Report Content and Review & Publish. Each one
// reads the draft (and the live template, for what changed) and shows only what the data actually says — no invented
// metrics. The only actions are navigation and the existing save / discard / publish, passed in by the page.
import { useMemo } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import { structureTypesOf } from '@/lib/templateBuilder/core/structureTypes';
import type { Issue } from '@/lib/templateBuilder/core/templateValidate';
import { assessesCondition, flatItems, isCovered, ops } from '@/lib/templates/editorModel';
import { propertyTypesOf } from '@/lib/templateBuilder/core/propertyTypes';
import { PropertyTypePicker } from './PropertyTypes';
import {
  LEVEL_LABEL, LEVEL_MEANING, PURPOSE_LABEL, REQUIREMENT_LEVELS, unpublishableRequirements, itemsWithRequirements, levelCounts, overrideCount, pinnedDefaultSet,
} from '@/lib/templates/requirementModel';
import { notShownToInspectors } from './EditorParts';
import { LevelPill } from './RequirementsEditor';
import { btn } from './ui';
import type { Fix } from '@/lib/templates/publishFixes';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';

type Sel = { systemId: string | null; nodeId: string | null };

/** Counts over the real tree. */
export function templateFacts(tree: InspectionTemplate) {
  let groups = 0, components = 0, unseen = 0, setAside = (tree.trimmedSystems ?? []).length;
  for (const s of tree.systems) {
    setAside += (s.trimmed ?? []).length;
    for (const r of flatItems(s)) {
      if (r.node.kind === 'component') components++; else groups++;
      setAside += (r.node.trimmed ?? []).length;
      if (notShownToInspectors(s, r.node, r.parentId)) unseen++;
    }
  }
  const covered = tree.systems.filter(s => isCovered(tree, s)).length;
  return { systems: tree.systems.length, covered, groups, components, unseen, setAside };
}

const Card = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="rounded-xl border border-hairline bg-surface">
    <header className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5"><h3 className="text-sm font-semibold text-ink">{title}</h3>{action}</header>
    <div className="px-4 py-3 text-sm text-body">{children}</div>
  </section>
);
const Stat = ({ n, label: l }: { n: number | string; label: string }) => (
  <div className="rounded-xl border border-hairline bg-surface px-4 py-3"><p className="text-2xl font-bold tracking-tight text-ink">{n}</p><p className="text-xs text-muted">{l}</p></div>
);

// ── Overview ────────────────────────────────────────────────────────────────────────────────────────────────

export function OverviewSection({ tree, status, issues, onGo, onOps, disabled }: {
  tree: InspectionTemplate; status: string; issues: Issue[]; onGo: (section: string, sel?: Sel) => void;
  onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const f = useMemo(() => templateFacts(tree), [tree]);
  const types = useMemo(() => structureTypesOf(tree), [tree]);
  const reqItems = useMemo(() => itemsWithRequirements(tree), [tree]);
  const reqCount = reqItems.reduce((a, r) => a + r.defs.length, 0);
  const errors = issues.filter(i => i.severity === 'error'), warnings = issues.filter(i => i.severity === 'warning');
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div><h2 className="text-xl font-bold tracking-tight text-ink">{tree.name}</h2><p className="text-sm text-muted">{status}</p></div>
      <Card title="Property types">
        <PropertyTypePicker value={propertyTypesOf(tree)} disabled={disabled} onChange={v => onOps(ops.propertyTypes(v))} />
        <p className="mt-2 text-xs text-muted">What this template is for. Shown on the Templates page; inspections run the same.</p>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat n={`${f.covered} / ${f.systems}`} label="Systems covered when an inspection starts" />
        <Stat n={f.components} label="Items" />
        <Stat n={f.groups} label="Groups" />
        <Stat n={types.types.length + 1} label={`Building types (main + ${types.types.length})`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Systems" action={<button className={btn.ghost} onClick={() => onGo('systems')}>Open</button>}>
          <ul className="divide-y divide-hairline">
            {tree.systems.map(s => {
              const items = flatItems(s).filter(r => r.node.kind === 'component').length;
              return <li key={s.id}><button className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:text-ink" onClick={() => onGo('systems', { systemId: s.id, nodeId: null })}>
                <span className={`truncate ${isCovered(tree, s) ? 'text-ink' : 'text-muted'}`}>{s.label}</span>
                <span className="shrink-0 text-xs text-muted">{items} item{items === 1 ? '' : 's'}{isCovered(tree, s) ? '' : ' · off'}</span></button></li>;
            })}
            {!tree.systems.length && <li className="py-2 text-xs text-muted">No systems yet.</li>}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="Checks" action={<button className={btn.ghost} onClick={() => onGo('review')}>Review</button>}>
            <ul className="space-y-1">
              <li>{errors.length ? <span className="text-safety">{errors.length} problem{errors.length === 1 ? '' : 's'} to fix</span> : 'No problems found.'}{warnings.length ? ` ${warnings.length} note${warnings.length === 1 ? '' : 's'}.` : ''}</li>
              <li>{f.unseen ? <span>{f.unseen} item{f.unseen === 1 ? ' is' : 's are'} not shown to inspectors.</span> : 'Every item is shown to inspectors.'}</li>
              {f.setAside > 0 && <li>{f.setAside} set aside (restorable).</li>}
            </ul>
          </Card>
          <Card title="Building types" action={<button className={btn.ghost} onClick={() => onGo('buildings')}>Open</button>}>
            <p>{types.source === 'template' ? 'This template has its own building types: ' : 'Using Ledrix’s default building types: '}{types.types.map(t => t.name).join(', ') || 'none'}.</p>
          </Card>
          <Card title="Requirements" action={<button className={btn.ghost} onClick={() => onGo('requirements')}>Open</button>}>
            <p>{reqCount ? `${reqCount} requirement${reqCount === 1 ? '' : 's'} on ${reqItems.length} item${reqItems.length === 1 ? '' : 's'} — checked on the phone before the report is sent.` : 'No company requirements. Inspections use Ledrix’s built-in rules.'}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Requirements (template-wide) ─────────────────────────────────────────────────────────────────────────────

export function RequirementsSection({ tree, onGo }: { tree: InspectionTemplate; onGo: (section: string, sel?: Sel, tab?: 'requirements') => void }) {
  const items = useMemo(() => itemsWithRequirements(tree), [tree]);
  const all = items.flatMap(i => i.defs);
  const counts = levelCounts(all);
  const carried = unpublishableRequirements(tree);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div><h2 className="text-xl font-bold tracking-tight text-ink">Requirements</h2>
        <p className="text-sm text-muted">What inspectors must record, item by item. Add them from an item’s Requirements tab.</p></div>
      <div className="rounded-xl border border-hairline bg-ground px-4 py-3 text-sm text-body" role="status">
        <p>Before the report is sent, the phone lists any item missing its proof — each one opens the item. The inspector can send without it.{carried.length ? <> <span className="font-semibold text-ink">Not publishable yet:</span> inspections can’t use {carried.join('; ')}.</> : null}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Ledrix defaults">
          <p><span className="font-semibold text-ink">{pinnedDefaultSet(tree) === 'ledrix-r0' ? 'Ledrix r0' : pinnedDefaultSet(tree)}</span> — the built-in rules every inspection uses today: required facts, coverage and evidence.</p>
          <p className="mt-2 text-xs text-muted">{overrideCount(tree) ? `${overrideCount(tree)} change(s) to these defaults are stored in this template; they can’t be edited here.` : 'No changes to the defaults. They can’t be changed from the website yet.'}</p>
        </Card>
        <Card title="Company requirements">
          <ul className="space-y-1">{REQUIREMENT_LEVELS.map(l => <li key={l} className="flex items-center justify-between"><LevelPill level={l} /><span className="font-mono text-ink">{counts[l]}</span></li>)}</ul>
        </Card>
        <Card title="Quick reference">
          <ul className="space-y-1.5 text-xs">{REQUIREMENT_LEVELS.map(l => <li key={l} className="flex items-start gap-2"><LevelPill level={l} /><span>{LEVEL_MEANING[l]}</span></li>)}</ul>
          <p className="mt-2 text-[11px] text-muted">Only Required items count toward what an inspection owes. Recommended and Optional are shown apart.</p>
        </Card>
      </div>
      <Card title="By item">
        {items.length ? (
          <ul className="divide-y divide-hairline">
            {items.map(({ node, system, defs }) => (
              <li key={node.id} className="py-2">
                <button className="text-left font-semibold text-ink hover:underline" onClick={() => onGo('systems', { systemId: system.id, nodeId: node.id }, 'requirements')}>{system.label} › {node.label}</button>
                <ul className="mt-1 space-y-1">{defs.map(d => (
                  <li key={d.id} className="flex flex-wrap items-center gap-1.5 text-xs"><LevelPill level={d.level} /><span className="text-ink">{d.label}</span>
                    {d.purposes.map(p => <span key={p} className="text-muted">· {PURPOSE_LABEL[p] ?? p}</span>)}</li>
                ))}</ul>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">No item carries requirements. Open an item in Systems & Components and use its Requirements tab.</p>}
      </Card>
      <p className="text-[11px] text-muted">Levels: {REQUIREMENT_LEVELS.map(l => LEVEL_LABEL[l]).join(' · ')}. Purposes describe why something is collected and never change how strict it is.</p>
    </div>
  );
}

// ── Report Content ─────────────────────────────────────────────────────────────────────────────────────────

export function ReportSection({ tree, onGo }: { tree: InspectionTemplate; onGo: (section: string, sel?: Sel) => void }) {
  const advisories = Array.isArray(tree.advisories) ? tree.advisories : [];
  const rows = useMemo(() => tree.systems.map(s => {
    const items = flatItems(s).map(r => r.node).filter(n => n.kind === 'component');
    const assessed = items.filter(n => assessesCondition(n)).length;
    const specs = items.reduce((a, n) => a + (n.attributes?.length ?? 0), 0);
    const reasons = items.reduce((a, n) => a + (n.limitations?.length ?? 0), 0);
    const method = items.filter(n => n.method?.length).length;
    return { s, items: items.length, assessed, specs, reasons, method };
  }), [tree]);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div><h2 className="text-xl font-bold tracking-tight text-ink">Report content</h2>
        <p className="text-sm text-muted">What this template’s items can put in a report. The report rules themselves belong to the Ledrix app.</p></div>
      <div className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-body">
        <p className="font-semibold text-ink">Today’s report rules (every template)</p>
        <p className="mt-1">A report includes confirmed findings, confirmed specifications, limitations and the inspector’s verdicts. Limitation reasons and the method of inspection print as disclosures.</p>
        <p className="mt-2 text-xs text-muted">Per-item report settings (include as standard, or never) aren’t available yet — they need report work in the app. Nothing on this page changes what prints.</p>
      </div>
      <Card title="By system">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="py-1.5 pr-3 font-semibold">System</th><th className="pr-3 font-semibold">Items</th><th className="pr-3 font-semibold">Assessed</th><th className="pr-3 font-semibold">Spec fields</th><th className="pr-3 font-semibold">Limitation reasons</th><th className="font-semibold">Method disclosures</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(r => (
                <tr key={r.s.id}><td className="py-1.5 pr-3"><button className="font-semibold text-ink hover:underline" onClick={() => onGo('systems', { systemId: r.s.id, nodeId: null })}>{r.s.label}</button>{!isCovered(tree, r.s) && <span className="ml-1 text-muted">(off)</span>}</td>
                  <td className="pr-3">{r.items}</td><td className="pr-3">{r.assessed}</td><td className="pr-3">{r.specs}</td><td className="pr-3">{r.reasons}</td><td>{r.method}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Report advisories">
        {advisories.length
          ? <p>This template carries {advisories.length} advisor{advisories.length === 1 ? 'y' : 'ies'} (standard report disclosures). They are set by Ledrix and can’t be edited here.</p>
          : <p className="text-muted">No template advisories. Reports use the app’s standard disclosures.</p>}
      </Card>
    </div>
  );
}

// ── Review & Publish ───────────────────────────────────────────────────────────────────────────────────────

export type ReviewProps = {
  tree: InspectionTemplate; status: string; issues: Issue[]; buildingErrors: string[]; buildingWarnings: string[]; buildingChanges: string[];
  publishBlock: string | null; readOnly: string | null; liveMoved: boolean; edits: number; saveState: string; isNew: boolean; nextVersion: number;
  canSave: boolean; canDiscard: boolean; canPublish: boolean; busy: boolean;
  onSave: () => void; onDiscard: () => void; onPublish: () => void; onGo: (section: string, sel?: Sel, tab?: Fix['go']['tab']) => void;
  fixes: Fix[]; onOps: (o: TemplateOp[]) => boolean;
};

/** Everything between this draft and Publish — each row opens the exact place to fix it (owner, 2026-10-27). */
export function FixList({ fixes, onGo, onOps, disabled }: { fixes: Fix[]; onGo: ReviewProps['onGo']; onOps: ReviewProps['onOps']; disabled: boolean }) {
  if (!fixes.length) return null;
  const blocking = fixes.filter(f => f.blocks).length;
  return (
    <Card title={blocking ? `To fix before publishing · ${blocking}` : 'Worth a look'}>
      <ul className="-mx-1 divide-y divide-hairline" aria-label="To fix before publishing">
        {fixes.map(f => (
          <li key={f.key} className="flex items-center gap-2 py-1">
            <button type="button" onClick={() => onGo(f.go.section, f.go.systemId ? { systemId: f.go.systemId, nodeId: f.go.nodeId ?? null } : undefined, f.go.tab)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-ground">
              <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${f.blocks ? 'bg-safety/15 text-safety' : 'bg-warn/30 text-ink'}`}>{f.blocks ? '✕' : '!'}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{f.where}</span><span className="block text-xs text-body">{f.what}</span></span>
              <span aria-hidden className="shrink-0 text-sm font-semibold text-accent-ink">Open →</span>
            </button>
            {f.quick && <button type="button" className={btn.secondary + ' shrink-0 px-2.5 py-1 text-xs'} disabled={disabled} onClick={() => onOps(f.quick!.ops)}>{f.quick.label}</button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReviewSection(p: ReviewProps) {
  const errors = p.issues.filter(i => i.severity === 'error'), warnings = p.issues.filter(i => i.severity === 'warning');
  const carried = unpublishableRequirements(p.tree);
  const facts = templateFacts(p.tree);
  const row = (ok: boolean | 'warn', title: string, detail?: React.ReactNode) => (
    <li className="flex items-start gap-2.5 py-2">
      <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ok === true ? 'bg-ok/20 text-ink' : ok === 'warn' ? 'bg-warn/30 text-ink' : 'bg-safety/15 text-safety'}`}>{ok === true ? '✓' : ok === 'warn' ? '!' : '✕'}</span>
      <div className="min-w-0"><p className="text-sm font-semibold text-ink">{title}</p>{detail && <div className="text-xs text-body">{detail}</div>}</div>
    </li>
  );
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div><h2 className="text-xl font-bold tracking-tight text-ink">Review & publish</h2><p className="text-sm text-muted">{p.status}</p></div>
      <FixList fixes={p.fixes} onGo={p.onGo} onOps={p.onOps} disabled={!!p.readOnly} />
      <Card title="Before publishing">
        <ul className="divide-y divide-hairline">
          {row(p.saveState === 'saved' || p.saveState === 'clean' ? true : p.saveState === 'error' ? false : 'warn', 'Draft saved',
            p.saveState === 'error' ? 'The last change was not saved.' : p.saveState === 'dirty' || p.saveState === 'saving' ? 'Saving…' : `${p.edits} change${p.edits === 1 ? '' : 's'} in this draft.`)}
          {row(errors.length ? false : warnings.length ? 'warn' : true, errors.length ? `${errors.length} template problem${errors.length === 1 ? '' : 's'}` : 'Template checks pass',
            (errors.length || warnings.length) ? 'Listed above — tap one to open it.' : undefined)}
          {row(p.buildingErrors.length ? false : p.buildingWarnings.length ? 'warn' : true, p.buildingErrors.length ? 'Building types need attention' : 'Building types',
            p.buildingErrors.length || p.buildingWarnings.length ? 'Listed above — tap one to open it.' : 'Every building type is valid.')}
          {row(carried.length ? false : true, carried.length ? 'Changes to Ledrix default requirements can’t be published yet' : 'Requirements are ready',
            carried.length ? 'Inspections can’t use them yet.' : 'Item requirements are checked on the phone before the report is sent.')}
          {row(facts.unseen ? 'warn' : true, facts.unseen ? `${facts.unseen} item${facts.unseen === 1 ? '' : 's'} not shown to inspectors` : 'Every item is shown to inspectors',
            facts.unseen ? 'Listed above — tap one to open it.' : undefined)}
          {p.liveMoved && row('warn', 'The live template changed after this draft started', 'Publishing will ask before replacing those changes.')}
          {p.readOnly && row(false, 'This draft can’t change right now', p.readOnly)}
        </ul>
      </Card>
      {p.buildingChanges.length > 0 && (
        <Card title="Building type changes">
          <ul className="list-disc space-y-0.5 pl-5">{p.buildingChanges.map(c => <li key={c}>{c}</li>)}</ul>
        </Card>
      )}
      <Card title={p.isNew ? 'Publish this template' : `Publish as v${p.nextVersion}`}>
        <p>{p.isNew ? 'It becomes a live template your company can assign to inspection types.' : 'New inspections that use this template start from this version.'} Inspections already started or finished keep the copy they started with.</p>
        {p.publishBlock && <p role="status" className="mt-2 font-semibold text-ink">{p.publishBlock}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn.secondary} disabled={!p.canSave} onClick={p.onSave}>Save draft</button>
          <button className={btn.secondary} disabled={!p.canDiscard} onClick={p.onDiscard}>Discard draft</button>
          <button className={btn.primary} disabled={!p.canPublish} title={p.publishBlock ?? undefined} onClick={p.onPublish}>Publish…</button>
        </div>
      </Card>
    </div>
  );
}

/** Small helper for the left rail's badges. */
export const issueCounts = (issues: Issue[]) => ({ errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length });
