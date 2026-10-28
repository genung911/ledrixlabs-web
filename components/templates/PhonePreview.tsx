'use client';

// ─── PhonePreview — the inspector's phone, drawn from the CURRENT DRAFT ─────────────────────────────────────
//
// What a Ledrix Inspect inspector would see for this template, so an owner can "use" it before publishing. It
// renders ONLY from `tree`; nothing about the house or the checklist is hardcoded except the header's sample text.
// Taps (picks, condition answers, open sheets, the current screen) are local state and are never saved.
//
// Modeled on the app (ledrix-app, read-only), screen by screen:
//   · header ................ src/app/ScopeScreen.tsx (chrome: back, blue dot + address, sub lines, menu)
//   · landing ............... src/components/inspect/CoverageGrid.tsx (building row, CHECKPOINTS ADDRESSED card,
//                              three-across system tiles with the red / amber / green lights, dashed Add system)
//   · a system's page ....... src/components/systems/ScopeWorkspace.tsx — since 2026-10-24 the system's ITEM LIST:
//                              one row per Guided Coverage step, grouped by component group (kind, name, status,
//                              what is recorded). The steps come from the app's own guidedOrder.ts (byte-identical
//                              copy), so the list and the walk are the app's.
//   · a guided step ......... src/components/systems/GuidedStep.tsx (the SYSTEM as the big heading, the item under
//                              it, Back / Next fixed above the tabs, the system-boundary card between systems) whose
//                              body is src/components/systems/ScopeRowList.tsx + scopeRowStyles.ts (CONDITION:
//                              Satisfactory / Limitation / Finding, limitation + finding sheets, value grids)
//   · value grids ........... src/components/systems/SpecChipRow.tsx (SpecOptionGrid: three-across tiles, "Add …")
//   · bottom tabs ........... src/components/inspect/InspectTabBar.tsx (Coverage · Findings · Evidence · Camera)
//   · colours ............... src/core/theme/starlink.ts and the literals in the files above
// The phone is ALWAYS dark, as the app is, whatever the website's theme.
//
// Condition is never a grade (app DECISIONS 2026-08-10): the only answers are Satisfactory, Limitation, Finding.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import {
  axesOf, buildIndex, findingShortcutsOf, itemApplies, leafProgress, leavesOf, limitationReasonsFor, METHOD_ATTR, pickKey,
  previewSpecValue, previewSteps, prunePicks, rulesFor, shownSystems, sumProgress, tilesOf, type CondPick, type Picks,
} from './phonePreviewModel';
import {
  crossesSystem, GUIDED_KIND_LABEL, positionInSystem, reconcileIndex, resumeIndex, stepIndexOf, systemSummary, type GuidedStep,
} from '@/lib/templateBuilder/core/guidedOrder';
import { previewNeeds } from '@/lib/templates/requirementModel';
import { displayLabel } from './systemLabel';

export type PreviewSelection = { systemId: string | null; nodeId: string | null };

// The app's screens (2026-10-24): the Coverage grid, a system's item list, a guided step, and the system-boundary
// card that Next / Back stops on between two systems — a state of the walk, never a step.
type Screen = { kind: 'landing' } | { kind: 'system'; systemId: string } | { kind: 'step'; key: string }
  | { kind: 'cross'; from: string; to: string; dir: 'forward' | 'back' };
type Sheet = { kind: 'limit' | 'finding'; nodeId: string } | null;

// ── icons (MaterialCommunityIcons names the app's pack uses → simple inline strokes) ──
const PATHS: Record<string, string> = {
  'home-roof': 'M3 12 12 4l9 8M6 10v9h12v-9',
  'home-city-outline': 'M4 20V9l6-4 6 4v11M16 20V12h4v8M8 13h4M8 17h4',
  'layers-triple': 'M12 3 3 8l9 5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  'fire': 'M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3-1-5 1-8Z',
  'snowflake': 'M12 2v20M4 7l16 10M20 7 4 17',
  'water': 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z',
  'water-boiler': 'M7 3h10v15H7zM10 21v-3M14 21v-3M10 8h4',
  'lightning-bolt': 'M13 2 4 14h7l-1 8 9-12h-7Z',
  'fireplace': 'M3 21V5h18v16M7 21v-8h10v8',
  'home-thermometer-outline': 'M3 12 12 4l9 8M6 10v9h12v-9M12 11v5',
  'floor-plan': 'M4 4h16v16H4zM4 12h7M11 4v10M15 12h5',
  'stove': 'M5 3h14v18H5zM5 9h14M9 6h.01M15 6h.01',
  'shield-check-outline': 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM8.5 12l2.5 2.5 4.5-5',
  'shape-outline': 'M4 14h6v6H4zM14 4l6 6-6 6-6-6zM17 17h.01',
};
function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const d = PATHS[name] ?? PATHS['shape-outline'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d={d} /></svg>
  );
}
const G = {
  chevL: 'm15 6-6 6 6 6', chevR: 'm9 6 6 6-6 6', chevD: 'm6 9 6 6 6-6',
  check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6', circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  alert: 'M12 3 2 20h20ZM12 10v4M12 17h.01', flag: 'M5 21V4h11l-2 4 2 4H5', plus: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8',
  plain: 'M12 5v14M5 12h14', dots: 'M12 5h.01M12 12h.01M12 19h.01', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', images: 'M3 5h14v12H3zM7 21h14V9', camera: 'M4 8h3l2-3h6l2 3h3v11H4ZM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
};
function Glyph({ d, size = 16, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d={d} /></svg>
  );
}

const toneOf = (p: { met: number; total: number; finding: boolean; limited: boolean }) =>
  p.finding ? '#ff5a5a' : p.limited ? '#f0a020' : p.total && p.met >= p.total ? '#7dc9a0' : p.met ? '#217BE8' : '#8fa0ad';
const HL_MS = 1400;

export function PhonePreview({ tree, selection, onSelect, address = 'Sample inspection' }: {
  tree: InspectionTemplate;
  selection: PreviewSelection;
  onSelect: (s: PreviewSelection) => void;
  address?: string;
}): JSX.Element {
  const index = useMemo(() => buildIndex(tree), [tree]);
  const systems = useMemo(() => shownSystems(tree), [tree]);

  const [screen, setScreen] = useState<Screen>({ kind: 'landing' });
  const [picks, setPicks] = useState<Picks>({});
  const [typed, setTyped] = useState<Picks>({});
  const [cond, setCond] = useState<Record<string, CondPick>>({});
  // THE RULES A NEW INSPECTION WOULD CAPTURE from this draft, evaluated against the answers tapped here — the same
  // compiler and resolver the phone runs (phonePreviewModel.rulesFor / itemApplies), so a rule-gated item appears
  // and disappears here exactly when it would on the phone.
  const rules = useMemo(() => rulesFor(tree), [tree]);
  const applies = useMemo(() => {
    const sv = previewSpecValue(index, picks, typed);
    return (id: string) => itemApplies(rules, id, sv);
  }, [rules, index, picks, typed]);
  // THE WALK — the app's step list for this draft and these answers (guidedOrder, the app's own module).
  const steps = useMemo(() => previewSteps(systems, applies), [systems, applies]);
  const prevSteps = useRef<GuidedStep[]>([]);
  const [limReason, setLimReason] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [adding, setAdding] = useState<{ key: string; text: string } | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef<string>('');

  const flash = (id: string) => {
    setHl(id);
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHl(null), HL_MS);
  };
  const say = (msg: string) => {
    setNote(msg);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };
  useEffect(() => () => {
    if (hlTimer.current) clearTimeout(hlTimer.current);
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);

  // ── THE TREE CHANGED: stay where we are if it still exists, else step up; drop picks that no longer exist ──
  useEffect(() => {
    setScreen(cur => {
      if (cur.kind === 'landing') return cur;
      if (cur.kind !== 'system') return cur;   // steps are reconciled against the step list below
      if (!index.shown[cur.systemId] || !index.byId[cur.systemId]) return { kind: 'landing' };
      return cur;
    });
    setSheet(cur => (cur && !index.byId[cur.nodeId] ? null : cur));
    const pr = prunePicks(picks, typed, index);
    if (pr.changed) { setPicks(pr.picks); setTyped(pr.typed); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ── THE STEP LIST CHANGED (an answer, or an edit in the editor): the app's reconcile rule ──
  // The open step stays if it still applies; if it no longer does, the walk moves to the next surviving step,
  // never backwards (guidedOrder.reconcileIndex). A boundary whose ends no longer exist is dropped.
  useEffect(() => {
    const prev = prevSteps.current;
    prevSteps.current = steps;
    setScreen(cur => {
      if (cur.kind === 'step') {
        const i = reconcileIndex(prev, steps, cur.key);
        return i < 0 ? { kind: 'landing' } : steps[i].key === cur.key ? cur : { kind: 'step', key: steps[i].key };
      }
      if (cur.kind === 'cross') {
        const ok = steps.some(x => x.key === cur.from) && steps.some(x => x.key === cur.to);
        return ok ? cur : (steps.some(x => x.key === cur.from) ? { kind: 'step', key: cur.from } : { kind: 'landing' });
      }
      return cur;
    });
  }, [steps]);

  // ── SELECTION FROM THE EDITOR → navigate and highlight ──
  useEffect(() => {
    const key = (selection.systemId ?? '') + '|' + (selection.nodeId ?? '');
    if (key === lastEmitted.current) return;          // our own tap coming back — already there
    lastEmitted.current = key;
    const sysId = selection.systemId ?? (selection.nodeId ? index.byId[selection.nodeId]?.systemId ?? null : null);
    if (!sysId) return;
    const sys = index.allSystems[sysId];
    if (!sys) return;
    if (!index.shown[sysId]) {
      setScreen({ kind: 'landing' }); setSheet(null);
      say(`${sys.label} isn't in scope when an inspection starts. Inspectors add it with Add system.`);
      return;
    }
    setSheet(null);
    const loc = selection.nodeId ? index.byId[selection.nodeId] : undefined;
    // An item selected in the editor opens its guided step (a card opens its host's); a system or a component
    // group opens the system's item list, as the app's system page does.
    const at = loc && loc.kind === 'leaf' ? stepIndexOf(steps, loc.node.id) : -1;
    if (at >= 0) { setScreen({ kind: 'step', key: steps[at].key }); flash(loc!.node.id); return; }
    setScreen({ kind: 'system', systemId: sysId });
    flash(loc && loc.kind !== 'system' ? loc.node.id : sysId);
  }, [selection.systemId, selection.nodeId, index]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll a highlighted element into view INSIDE the frame (never the page).
  useEffect(() => {
    if (!hl || !scrollRef.current) return;
    const box = scrollRef.current;
    const el = box.querySelector<HTMLElement>(`[data-pv-id="${CSS.escape(hl)}"]`);
    if (!el) return;
    const top = el.offsetTop - 12, bottom = el.offsetTop + el.offsetHeight + 12;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(top, bottom - box.clientHeight);
  }, [hl, screen]);

  const emit = (s: PreviewSelection) => { lastEmitted.current = (s.systemId ?? '') + '|' + (s.nodeId ?? ''); onSelect(s); };
  const go = (s: Screen) => { setScreen(s); setSheet(null); setAdding(null); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const back = () => {
    if (sheet) { setSheet(null); return; }
    if (screen.kind === 'step') { const st = steps.find(x => x.key === screen.key); go(st ? { kind: 'system', systemId: st.systemId } : { kind: 'landing' }); }
    else if (screen.kind === 'cross') go({ kind: 'step', key: screen.from });
    else if (screen.kind === 'system') go({ kind: 'landing' });
  };
  const reset = () => {
    setPicks({}); setTyped({}); setCond({}); setLimReason({}); setFinding({}); setReadings({});
    setSheet(null); setAdding(null); setNote(null); go({ kind: 'landing' });
  };
  // Every system opens its item list — a flat system too (the app's one-card system page is gone).
  const openSystem = (sys: TemplateNode) => { go({ kind: 'system', systemId: sys.id }); emit({ systemId: sys.id, nodeId: null }); };
  const openStep = (st: GuidedStep) => { go({ kind: 'step', key: st.key }); emit({ systemId: st.systemId, nodeId: st.key }); };
  // THE APP'S NEXT / BACK (ScopeScreen guidedNext / guidedBack): the next or previous applicable step of the same
  // sequence; a move that crosses into another system stops on the boundary card first; Next on the last step ends
  // the walk on the Coverage grid. Nothing is written by moving.
  const move = (dir: 1 | -1) => {
    if (screen.kind !== 'step') return;
    const i = steps.findIndex(x => x.key === screen.key);
    const j = i + dir;
    if (i < 0 || j < 0) return;
    if (j >= steps.length) { go({ kind: 'landing' }); say('End of guided coverage.'); return; }
    if (crossesSystem(steps, i, j)) { go({ kind: 'cross', from: steps[i].key, to: steps[j].key, dir: dir > 0 ? 'forward' : 'back' }); return; }
    openStep(steps[j]);
  };
  const stepStat = (st: GuidedStep) => sumProgress(st.rowIds.map(id => index.byId[id]?.node).filter(Boolean) as TemplateNode[], picks, cond, readings);
  const stepDone = (st: GuidedStep) => { const p = stepStat(st); return p.total === 0 || p.met >= p.total; };
  const togglePick = (key: string, value: string, multi: boolean) => setPicks(p => {
    const cur = p[key] ?? [];
    const next = cur.indexOf(value) >= 0 ? cur.filter(v => v !== value) : multi ? cur.concat(value) : [value];
    const out = { ...p }; if (next.length) out[key] = next; else delete out[key];
    return out;
  });

  const progressOfSystem = (sys: TemplateNode) => {
    const leaves: TemplateNode[] = [];
    tilesOf(sys).forEach(t => leavesOf(t, applies).forEach(l => leaves.push(l)));
    return sumProgress(leaves, picks, cond, readings);
  };

  // ── screens ──
  const landing = () => {
    const tot = systems.reduce((a, s) => { const p = progressOfSystem(s); a.met += p.met; a.total += p.total; return a; }, { met: 0, total: 0 });
    const pct = tot.total ? Math.round((tot.met / tot.total) * 100) : 0;
    return (
      <>
        <div className="pv-bldg"><b>MAIN STRUCTURE <Glyph d={G.chevD} size={12} /></b></div>
        <div className="pv-cov">
          <div className="pv-cl"><span className="pv-capS">CHECKPOINTS ADDRESSED</span><span className="pv-bar6"><i style={{ width: `${pct}%` }} /></span></div>
          <span className="pv-n">{tot.met}<small>/{tot.total}</small></span>
        </div>
        {systems.length === 0 ? <p className="pv-empty">No system starts in scope. Inspectors would add each one with Add system.</p> : null}
        <div className="pv-tiles">
          {systems.map(sys => {
            const p = progressOfSystem(sys);
            const done = p.total > 0 && p.met >= p.total;
            return (
              <button key={sys.id} type="button" data-pv-id={sys.id} className={`pv-tile${hl === sys.id ? ' pv-hit' : ''}`}
                onClick={() => openSystem(sys)} aria-label={`${sys.label}, ${p.met} of ${p.total}`}>
                <Icon name={sys.icon ?? 'shape-outline'} size={24} />
                <span className="pv-tl">{sys.label}</span>
                <span className="pv-lights" aria-hidden="true"><i className={p.finding ? 'r' : ''} /><i className={p.limited ? 'a' : ''} /><i className={done ? 'g' : ''} /></span>
              </button>
            );
          })}
          <div className="pv-tile pv-add" aria-hidden="true"><Glyph d={G.plain} size={24} /><span className="pv-tl">Add system</span></div>
        </div>
      </>
    );
  };

  // ── A SYSTEM'S PAGE: ITS ITEMS (ScopeWorkspace, 2026-10-24) ──
  const systemPage = (sysId: string) => {
    const sys = index.allSystems[sysId]; if (!sys) return null;
    const mine = steps.filter(st => st.systemId === sysId);
    const p = progressOfSystem(sys);
    const done = mine.filter(st => { const q = stepStat(st); return q.total > 0 && q.met >= q.total; }).length;
    const groups: Array<{ id: string; label: string; items: GuidedStep[] }> = [];
    mine.forEach(st => { let g = groups.find(x => x.id === st.tileId); if (!g) { g = { id: st.tileId, label: st.tileLabel, items: [] }; groups.push(g); } g.items.push(st); });
    const start = () => { if (!mine.length) return; openStep(mine[resumeIndex(mine, stepDone, 0)]); };
    return (
      <>
        <div className="pv-eyebrow">{address.toUpperCase()} · MAIN STRUCTURE</div>
        <div className="pv-sysrow">
          <button type="button" className="pv-iconbtn" onClick={back} aria-label="Back to all systems"><Glyph d={G.chevL} size={22} color="#c7d0d6" /></button>
          <span className="pv-big1">{displayLabel(sys.label)}</span>
          <span className="pv-c">{p.met}<small> / {p.total}</small></span>
          <button type="button" className="pv-guidechip" onClick={start} aria-label={`Guided coverage through ${displayLabel(sys.label)}`}>▶ GUIDED</button>
        </div>
        <div className="pv-bar3"><i style={{ width: `${p.total ? Math.round((p.met / p.total) * 100) : 0}%`, background: '#2F8CE8' }} /></div>
        <div className="pv-syssub">{mine.length} item{mine.length === 1 ? '' : 's'} · {done} complete · tap an item to start there</div>
        {!mine.length ? <p className="pv-empty">Nothing in scope for this category yet.</p> : null}
        {groups.map(g => (
          <div key={g.id} className="pv-group">
            <div className="pv-ghead" data-pv-id={g.id !== sysId ? g.id : undefined}><span>{g.label.toUpperCase()}</span><em>+ Item</em></div>
            {g.items.map(st => {
              const q = stepStat(st); const c = toneOf(q);
              const n = index.byId[st.key]?.node;
              const ax = n ? axesOf(n) : null;
              const vals = ax ? ax.attributes.map(a => (picks[pickKey(st.key, a.id)] ?? []).join(', ')).filter(Boolean) : [];
              const v = q.finding ? 'Finding' : q.limited ? 'Limitation' : vals.length ? vals.join(', ')
                : cond[st.key] === 'ok' ? 'Satisfactory' : q.total && q.met >= q.total ? 'Complete' : q.met ? 'Incomplete'
                : st.kind === 'description' ? 'Not set' : 'Not started';
              return (
                <button key={st.key} type="button" data-pv-id={st.key} className={`pv-item${hl === st.key ? ' pv-hit' : ''}`} onClick={() => openStep(st)}
                  aria-label={`${st.label}, ${v}. Start guided coverage here`}>
                  <i className="pv-dot" style={{ background: q.met || q.finding || q.limited ? c : '#2a333a' }} />
                  <span className="pv-itx"><b>{st.label}</b>{n && previewNeeds(n) ? <small className="pv-needs">Needs {previewNeeds(n)}</small> : null}</span>
                  <span className="pv-iv" style={{ color: q.finding ? '#ff8a8a' : q.limited ? '#f0a020' : vals.length || q.met >= q.total && q.total ? '#c9d6de' : '#5f7378' }}>{v}</span>
                  <Glyph d={G.chevR} size={14} color="#4a5a60" />
                </button>
              );
            })}
          </div>
        ))}
      </>
    );
  };

  const optionGrid = (n: TemplateNode, key: string, caption: string, values: string[], multi: boolean, addLabel: string | null) => {
    const v = picks[key] ?? [];
    const extra = (typed[key] ?? []).filter(x => values.indexOf(x) < 0);
    const all = values.concat(extra);
    return (
      <>
        <div className="pv-cap">{caption}<em>{multi ? 'Select all that apply' : 'Pick one'}</em></div>
        <div className="pv-ogrid">
          {all.map(o => {
            const on = v.indexOf(o) >= 0;
            return (
              <button key={o} type="button" role="checkbox" aria-checked={on} className={`pv-opt${on ? ' on' : ''}`}
                onClick={() => { togglePick(key, o, multi); emit({ systemId: index.byId[n.id]?.systemId ?? null, nodeId: n.id }); }}>
                <Glyph d={on ? G.check : G.circle} size={16} /><span>{o}</span>
              </button>
            );
          })}
        </div>
        {addLabel === null ? null : adding && adding.key === key ? (
          <form className="pv-addrow" onSubmit={e => {
            e.preventDefault();
            const t = adding.text.trim();
            if (t) {
              setTyped(p => ({ ...p, [key]: (p[key] ?? []).concat(t) }));
              if (v.indexOf(t) < 0) togglePick(key, t, multi);
            }
            setAdding(null);
          }}>
            <input autoFocus value={adding.text} onChange={e => setAdding({ key, text: e.target.value })} placeholder="Type it…" aria-label={addLabel} />
            <button type="submit" className="pv-iconbtn" aria-label="Add"><Glyph d="m5 12 5 5 9-10" size={18} color="#2fc56e" /></button>
          </form>
        ) : (
          <button type="button" className="pv-addrow" onClick={() => setAdding({ key, text: '' })}><Glyph d={G.plus} size={16} />{addLabel}</button>
        )}
      </>
    );
  };

  const conditionRow = (n: TemplateNode) => {
    const c = cond[n.id];
    return (
      <>
        <div className="pv-conds">
          <button type="button" className={`pv-cbtn${c === 'ok' ? ' ok' : ''}${c === 'fnd' ? ' dis' : ''}`} disabled={c === 'fnd'} aria-pressed={c === 'ok'}
            onClick={() => setCond(p => { const o = { ...p }; if (o[n.id] === 'ok') delete o[n.id]; else o[n.id] = 'ok'; return o; })}>
            <Glyph d={G.check} size={18} /><span>Satisfactory</span>
          </button>
          <button type="button" className={`pv-cbtn${c === 'lim' ? ' lim' : ''}`} aria-pressed={c === 'lim'} onClick={() => setSheet({ kind: 'limit', nodeId: n.id })}>
            <Glyph d={G.alert} size={18} /><span>Limitation</span>
          </button>
          <button type="button" className={`pv-cbtn${c === 'fnd' ? ' fnd' : ''}`} aria-pressed={c === 'fnd'} onClick={() => setSheet({ kind: 'finding', nodeId: n.id })}>
            <Glyph d={G.flag} size={18} /><span>Finding</span>
          </button>
        </div>
        {c === 'lim' && limReason[n.id] ? <div className="pv-limline">{limReason[n.id]}</div> : null}
        {c === 'fnd' && finding[n.id] ? <div className="pv-findline"><i /><span>{finding[n.id]} — drafted for Review</span></div> : null}
      </>
    );
  };

  const leafCard = (sysId: string, n: TemplateNode) => {
    if (n.pointsTo) {
      const target = index.byId[n.pointsTo.nodeId];
      const tSys = index.allSystems[n.pointsTo.systemId];
      const reachable = !!(target && target.tileId && index.shown[target.systemId]);
      return (
        <div key={n.id} data-pv-id={n.id} className={`pv-leaf${hl === n.id ? ' pv-hit' : ''}`}>
          <div className="pv-ct"><Glyph d={G.link} size={14} color="#6aa8f0" />{n.label}</div>
          <div className="pv-guide">Recorded under {tSys ? tSys.label : 'another system'}{target ? ` › ${target.node.label}` : ''}.</div>
          {reachable && target ? (
            <button type="button" className="pv-linkbtn" onClick={() => { const at = stepIndexOf(steps, target.node.id); go(at >= 0 ? { kind: 'step', key: steps[at].key } : { kind: 'system', systemId: target.systemId }); flash(target.node.id); emit({ systemId: target.systemId, nodeId: target.node.id }); }}>
              Open in {tSys ? tSys.label : 'its system'}
            </button>
          ) : null}
        </div>
      );
    }
    const ax = axesOf(n);
    const first = ax.attributes[0];
    const headVal = first ? (picks[pickKey(n.id, first.id)] ?? []).join(', ') : '';
    const named = ax.attributes.length > 1;
    const sel = hl === n.id;
    return (
      <div key={n.id} data-pv-id={n.id} className={`pv-leaf${sel ? ' sel pv-hit' : ''}`}>
        <button type="button" className="pv-leafhead" onClick={() => { emit({ systemId: sysId, nodeId: n.id }); flash(n.id); }} aria-label={`Select ${n.label} in the editor`}>
          <span className="pv-ct">{n.label}{first && !named ? <span className={`pv-hv${headVal ? '' : ' empty'}`}>{headVal || 'Not set'}</span> : null}</span>
          {n.description ? <span className="pv-guide">{n.description}</span> : null}
        </button>
        {ax.condition ? <div className="pv-sec"><div className="pv-cap">CONDITION</div>{conditionRow(n)}</div> : null}
        {ax.attributes.map((a, i) => (
          <div key={a.id} className={`pv-sec${ax.condition || i > 0 ? ' div' : ''}`}>
            {optionGrid(n, pickKey(n.id, a.id), named ? a.label.toUpperCase() : 'MATERIAL / TYPE', a.values, !!a.multi, named ? `Add ${a.label.toLowerCase()}` : 'Add a material')}
          </div>
        ))}
        {ax.method.length ? (
          <div className={`pv-sec${ax.condition || ax.attributes.length ? ' div' : ''}`}>{optionGrid(n, pickKey(n.id, METHOD_ATTR), 'METHOD', ax.method, false, null)}</div>
        ) : null}
        {n.freeFormValue ? (
          <div className={`pv-sec${ax.condition || ax.attributes.length || ax.method.length ? ' div' : ''}`}>
            <div className="pv-cap">VALUE</div>
            <input className="pv-reading" value={readings[n.id] ?? ''} placeholder="Enter the reading" aria-label={`${n.label} reading`}
              onChange={e => { const v = e.target.value; setReadings(p => ({ ...p, [n.id]: v })); }} />
          </div>
        ) : null}
        {!ax.condition && !ax.attributes.length && !ax.method.length && !n.freeFormValue ? <div className="pv-guide" style={{ marginTop: 8 }}>Nothing to record on this item yet.</div> : null}
      </div>
    );
  };

  // ── A GUIDED STEP (GuidedStep.tsx): the system is the heading, the item the second one ──
  const stepPage = (key: string) => {
    const at = steps.findIndex(x => x.key === key); if (at < 0) return null;
    const st = steps[at];
    const pos = positionInSystem(steps, at);
    const q = stepStat(st); const c = toneOf(q);
    const sub = st.tileLabel !== st.systemLabel ? displayLabel(st.tileLabel).toUpperCase() : null;
    const state = q.finding ? 'Finding recorded' : q.limited ? 'Limitation recorded' : q.total && q.met >= q.total ? 'Complete' : q.met ? 'Incomplete' : 'Not started';
    return (
      <>
        <div className="pv-toprow"><span className="pv-eyebrow" style={{ margin: 0 }}>{address.toUpperCase()} · MAIN STRUCTURE</span>
          <button type="button" className="pv-exit" onClick={() => go({ kind: 'landing' })}>EXIT GUIDED</button></div>
        <div className="pv-sysrow" style={{ marginTop: 4 }}>
          <button type="button" className="pv-sysbtn" onClick={() => go({ kind: 'system', systemId: st.systemId })} aria-label={`Open the ${displayLabel(st.systemLabel)} page`}>
            <Glyph d={G.chevL} size={20} color="#2F8CE8" /><span className="pv-big1">{displayLabel(st.systemLabel)}</span>
          </button>
          <span className="pv-c">{pos.n}<small> / {pos.of}</small></span>
        </div>
        <div className="pv-bar3"><i style={{ width: `${pos.of ? Math.round((pos.n / pos.of) * 100) : 0}%`, background: '#2F8CE8' }} /></div>
        <div className="pv-kindrow"><span>{GUIDED_KIND_LABEL[st.kind]}{sub ? <small>{`  ·  ${sub}`}</small> : null}</span>
          <span className="pv-pill" style={{ color: c, borderColor: c }}>{state}</span></div>
        <div className="pv-steptitle">{st.label}</div>
        {st.rowIds.map(id => { const n = index.byId[id]?.node; return n ? leafCard(st.systemId, n) : null; })}
      </>
    );
  };

  // ── THE SYSTEM BOUNDARY (GuidedTransitionView) ──
  const crossPage = (from: string, to: string, dir: 'forward' | 'back') => {
    const fi = steps.findIndex(x => x.key === from), ti = steps.findIndex(x => x.key === to);
    if (fi < 0 || ti < 0) return null;
    const toSum = systemSummary(steps, ti, stepDone)!, fromSum = systemSummary(steps, fi, stepDone)!;
    const t = steps[ti];
    return (
      <>
        <div className="pv-eyebrow">{address.toUpperCase()} · MAIN STRUCTURE</div>
        <div className="pv-xcap">{dir === 'forward' ? 'NEXT SYSTEM' : 'BACK TO'}</div>
        <div className="pv-xsys">{displayLabel(t.systemLabel)}</div>
        <div className="pv-xstat">System {toSum.n} of {toSum.of} · {toSum.steps} item{toSum.steps === 1 ? '' : 's'} · {toSum.done} complete</div>
        <div className="pv-xcard"><em>{dir === 'forward' ? 'STARTS WITH' : 'RETURNS TO'}</em><span>{GUIDED_KIND_LABEL[t.kind]}</span><b>{t.label}</b></div>
        <div className="pv-xleave">Leaving {displayLabel(fromSum.systemLabel)} · {fromSum.done} of {fromSum.steps} complete. Nothing changes by moving on.</div>
      </>
    );
  };

  // ── BACK / NEXT, FIXED ABOVE THE TABS (GuidedNavBar in the rail's `above` slot) ──
  const navBar = () => {
    if (screen.kind === 'cross') {
      const f = steps.find(x => x.key === screen.from), t = steps.find(x => x.key === screen.to);
      if (!f || !t) return null;
      return (
        <div className="pv-nav">
          <button type="button" className="pv-nb" onClick={() => openStep(f)}><Glyph d={G.chevL} size={16} />{displayLabel(f.systemLabel).toUpperCase()}</button>
          <button type="button" className="pv-nn" onClick={() => openStep(t)}>{screen.dir === 'forward' ? 'BEGIN' : 'BACK TO'} {displayLabel(t.systemLabel).toUpperCase()}<Glyph d={G.chevR} size={16} /></button>
        </div>
      );
    }
    if (screen.kind !== 'step') return null;
    const i = steps.findIndex(x => x.key === screen.key);
    const last = i >= steps.length - 1;
    return (
      <div className="pv-nav">
        <button type="button" className="pv-nb" disabled={i <= 0} onClick={() => move(-1)} aria-label="Previous step"><Glyph d={G.chevL} size={16} />BACK</button>
        <button type="button" className="pv-nn" onClick={() => move(1)} aria-label={last ? 'Finish guided coverage' : 'Next step'}>{last ? 'FINISH' : 'NEXT'}<Glyph d={G.chevR} size={16} /></button>
      </div>
    );
  };

  const sheetView = () => {
    if (!sheet) return null;
    const loc = index.byId[sheet.nodeId]; if (!loc) return null;
    const n = loc.node; const title = n.label.toUpperCase();
    const close = () => setSheet(null);
    if (sheet.kind === 'limit') {
      const pick = (r: string) => { setCond(p => ({ ...p, [n.id]: 'lim' })); setLimReason(p => ({ ...p, [n.id]: r })); close(); };
      return (
        <div className="pv-sheetbg" onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="pv-sheet" role="dialog" aria-label={`${n.label} — limitation`}>
            <div className="pv-hd" />
            <div className="pv-hh">{title} — LIMITATION<button type="button" onClick={close}>CANCEL</button></div>
            {limitationReasonsFor(n).map(r => <button key={r} type="button" className="pv-row" onClick={() => pick(r)}>{r}</button>)}
            <button type="button" className="pv-big" onClick={() => pick('Photographed — Ledrix drafts it for Review')}>PHOTOGRAPH IT — LEDRIX DRAFTS IT FOR REVIEW</button>
            <p className="pv-foot">In the app, a tap on Limitation opens the camera; holding it shows this list.</p>
          </div>
        </div>
      );
    }
    const shortcuts = findingShortcutsOf(n);
    const pick = (label: string) => { setCond(p => ({ ...p, [n.id]: 'fnd' })); setFinding(p => ({ ...p, [n.id]: label })); close(); say('In the app the camera opens here, aimed at this item.'); };
    return (
      <div className="pv-sheetbg" onClick={e => { if (e.target === e.currentTarget) close(); }}>
        <div className="pv-sheet" role="dialog" aria-label={`${n.label} — new finding`}>
          <div className="pv-hd" />
          <div className="pv-hh">{title} — NEW FINDING<button type="button" onClick={close}>CANCEL</button></div>
          <div className="pv-cap2">TAP WHAT YOU SEE</div>
          {shortcuts.length
            ? shortcuts.map(s => <button key={s.id} type="button" className="pv-row f" onClick={() => pick(s.label)}>{s.label}</button>)
            : <p className="pv-foot">No shortcuts for this component yet — the findings you log most will build this list.</p>}
          <button type="button" className="pv-big" onClick={() => pick('Finding')}>{shortcuts.length ? 'SOMETHING ELSE — JUST SHOOT IT' : 'ADD FINDING — OPEN CAMERA'}</button>
          <p className="pv-foot">A shortcut tells Ledrix what to look for — it reads the photo and drafts the finding for Review. In the app, a tap on Finding opens the camera; holding it shows this list.</p>
        </div>
      </div>
    );
  };

  let body: JSX.Element | null;
  if (screen.kind === 'landing') body = landing();
  else if (screen.kind === 'system') body = systemPage(screen.systemId);
  else if (screen.kind === 'step') body = stepPage(screen.key);
  else body = crossPage(screen.from, screen.to, screen.dir);

  return (
    <div className="ldx-pv flex w-full max-w-[340px] flex-col items-stretch gap-2.5">
      <style>{CSS_TEXT}</style>
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xs text-muted"><b className="font-semibold text-ink">Inspector preview</b> — taps here aren&rsquo;t saved</span>
        <button type="button" onClick={reset}
          className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          Reset
        </button>
      </div>
      <div className="pv-phone" aria-label="Inspector preview of the Ledrix Inspect app">
        <div className="pv-screen">
          <div className="pv-sb" aria-hidden="true"><span>9:41</span><span className="pv-island" /><span>●●●</span></div>
          <div className="pv-chrome">
            <button type="button" className="pv-iconbtn" onClick={back} aria-label="Back" style={{ color: '#8a8f93' }}><Glyph d={G.chevL} size={20} /></button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pv-addr"><i />{address}</div>
              <div className="pv-sub1">{tree.name}</div>
            </div>
            <span style={{ color: '#8a8f93' }} aria-hidden="true"><Glyph d={G.dots} size={18} /></span>
          </div>
          <div className="pv-scroll" ref={scrollRef}>{body}</div>
          {navBar()}
          <div className="pv-tabs" aria-hidden="true">
            <div className="on"><Glyph d={G.grid} size={20} />Coverage</div>
            <div><Glyph d={G.flag} size={20} />Findings</div>
            <div><Glyph d={G.images} size={20} />Evidence</div>
            <div><Glyph d={G.camera} size={20} />Camera</div>
          </div>
          {sheetView()}
          {note ? <div className="pv-toast" role="status">{note}</div> : null}
        </div>
      </div>
    </div>
  );
}

// Scoped under .ldx-pv. Literal colours are the app's (see the header comment); they do not follow the site theme.
const CSS_TEXT = `
.ldx-pv .pv-phone{width:100%;height:min(720px,calc(100vh - 180px));min-height:520px;border-radius:48px;background:#1b1f24;padding:11px;box-shadow:0 0 0 1px #2c3238,0 12px 40px rgba(10,15,20,.18)}
.ldx-pv .pv-screen{position:relative;height:100%;border-radius:38px;overflow:hidden;background:#05070b;color:#8fa0ad;display:flex;flex-direction:column;font-family:-apple-system,'SF Pro Text',Inter,system-ui,sans-serif;font-size:13px;line-height:1.35}
.ldx-pv button{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:left;cursor:pointer}
.ldx-pv .pv-screen button:focus-visible,.ldx-pv .pv-screen input:focus-visible{outline:2px solid #217BE8;outline-offset:2px}
.ldx-pv .pv-iconbtn{display:inline-flex;align-items:center;justify-content:center}
.ldx-pv .pv-sb{height:40px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 26px 0 30px;color:#eef3f5;font-size:13px;font-weight:600;position:relative;letter-spacing:-1px}
.ldx-pv .pv-island{position:absolute;left:50%;top:9px;transform:translateX(-50%);width:96px;height:26px;border-radius:14px;background:#000}
.ldx-pv .pv-chrome{flex:none;padding:6px 16px 10px;border-bottom:1px solid rgba(38,50,62,.55);display:flex;gap:8px;align-items:flex-start}
.ldx-pv .pv-addr{display:flex;align-items:center;gap:7px;color:#eef3f5;font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-addr i{width:7px;height:7px;border-radius:4px;background:#2F8CE8;flex:none}
.ldx-pv .pv-sub1{color:#a9b6bd;font-size:11px;font-weight:600;margin-top:2px;padding-left:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-scroll{position:relative;flex:1;overflow-y:auto;overflow-x:hidden;padding:12px 14px 16px;scrollbar-width:none}
.ldx-pv .pv-scroll::-webkit-scrollbar{display:none}
.ldx-pv .pv-tabs{flex:none;display:flex;border-top:1px solid rgba(38,50,62,.55);background:#05070b;padding:6px 6px 18px}
.ldx-pv .pv-tabs div{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:600;color:#6f7b82}
.ldx-pv .pv-tabs div.on{color:#EAF1FB;font-weight:800}
.ldx-pv .pv-bldg{display:flex;justify-content:center;min-height:30px;align-items:center}
.ldx-pv .pv-bldg b{color:#e8ecef;font-size:11.5px;font-weight:800;letter-spacing:1.6px;display:inline-flex;gap:4px;align-items:center}
.ldx-pv .pv-cov{display:flex;align-items:center;gap:10px;margin-top:6px;padding:12px 13px;border-radius:14px;background:#11171b;border:1px solid #222b30}
.ldx-pv .pv-cl{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.ldx-pv .pv-capS{color:#8a959c;font-size:9.5px;font-weight:800;letter-spacing:1.2px}
.ldx-pv .pv-bar6{display:block;height:5px;border-radius:3px;background:#252e33;overflow:hidden}
.ldx-pv .pv-bar6 i{display:block;height:5px;background:#EAF1FB}
.ldx-pv .pv-n{color:#eef3f5;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.ldx-pv .pv-n small{color:#7c878e;font-size:13px;font-weight:700}
.ldx-pv .pv-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
.ldx-pv .pv-tile{position:relative;min-height:88px;border-radius:14px;padding:10px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#11171b;border:1px solid #2a3439;color:#eef3f5;min-width:0}
.ldx-pv .pv-tl{color:#e6ebee;font-size:11.5px;font-weight:600;text-align:center;line-height:1.2;overflow-wrap:anywhere}
.ldx-pv .pv-add{border-style:dashed;border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.03)}
.ldx-pv .pv-add .pv-tl{color:#8a959c}
.ldx-pv .pv-lights{display:flex;gap:5px}
.ldx-pv .pv-lights i{width:8px;height:8px;border-radius:4px;background:#2a333a}
.ldx-pv .pv-lights i.r{background:#ff5a5f}.ldx-pv .pv-lights i.a{background:#f5b03c}.ldx-pv .pv-lights i.g{background:#3ecf7e}
.ldx-pv .pv-hit{outline:2px solid #217BE8;outline-offset:1px}
.ldx-pv .pv-eyebrow{color:#7c878e;font-size:9.5px;font-weight:800;letter-spacing:1.4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-sysrow{display:flex;align-items:center;gap:6px}
.ldx-pv .pv-sysrow .pv-iconbtn{margin-left:-6px}
.ldx-pv .pv-t{flex:1;min-width:0;color:#eef3f5;font-size:18px;font-weight:800;letter-spacing:-.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-c{color:#eef3f5;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.ldx-pv .pv-c small{color:#7c878e;font-size:12.5px;font-weight:700}
.ldx-pv .pv-syssub{color:#7f9197;font-size:10.5px;font-weight:600;margin-top:4px}
.ldx-pv .pv-bar3{display:block;height:3px;border-radius:2px;background:#162026;overflow:hidden;margin-top:7px}
.ldx-pv .pv-bar3 i{display:block;height:3px;border-radius:2px;background:#7dc9a0}
.ldx-pv .pv-cards{display:flex;flex-direction:column;gap:9px;margin-top:12px}
.ldx-pv .pv-card{display:flex;flex-direction:column;gap:9px;background:#0d151b;border:1px solid #1f2d37;border-radius:14px;padding:11px;width:100%}
.ldx-pv .pv-h{display:flex;align-items:center;gap:9px}
.ldx-pv .pv-ibox{width:30px;height:30px;border-radius:9px;background:#111d25;border:1px solid #1f2d37;display:flex;align-items:center;justify-content:center;flex:none}
.ldx-pv .pv-tt{flex:1;min-width:0}
.ldx-pv .pv-tt b{display:block;color:#eef3f5;font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-tt span{display:block;color:#6d7d87;font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-cnt{font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}
.ldx-pv .pv-cnt small{font-size:10.5px;font-weight:700;color:#5f7378}
.ldx-pv .pv-specs{display:flex;flex-direction:column;gap:5px}
.ldx-pv .pv-spec{display:flex;gap:10px;font-size:11px}
.ldx-pv .pv-spec span{flex:1;min-width:0;color:#8595a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-spec b{color:#e2eaef;font-weight:600;max-width:55%;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-spec b.unset{color:#5f7378;font-weight:500}
.ldx-pv .pv-more{color:#5f7378;font-size:11px;font-weight:700}
.ldx-pv .pv-empty{color:#5f7378;font-size:11.5px;line-height:1.55;padding:16px 4px;text-align:center;margin:0}
.ldx-pv .pv-crumb{display:flex;align-items:center;gap:5px;padding:4px 0;margin-bottom:6px;color:#217BE8;font-size:11.5px;font-weight:700}
.ldx-pv .pv-crumb b{color:#cfe2f8;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-phead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.ldx-pv .pv-leaf{background:#0d151b;border:1px solid #1f2d37;border-radius:12px;padding:10px;margin-bottom:8px}
.ldx-pv .pv-leaf.sel{border-color:#2F8CE8;background:#10202e}
.ldx-pv .pv-leafhead{display:flex;flex-direction:column;width:100%}
.ldx-pv .pv-ct{color:#eef3f5;font-size:14px;font-weight:600;letter-spacing:-.2px;display:flex;align-items:center;gap:6px;width:100%;min-width:0}
.ldx-pv .pv-hv{margin-left:auto;color:#8fa0ad;font-size:11.5px;font-weight:400;max-width:55%;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-hv.empty{color:#f0a020}
.ldx-pv .pv-guide{display:block;color:#6d7d87;font-size:10.5px;line-height:1.4;margin-top:2px}
.ldx-pv .pv-linkbtn{margin-top:8px;color:#6aa8f0;font-size:11px;font-weight:800;letter-spacing:.4px}
.ldx-pv .pv-sec{margin-top:12px}
.ldx-pv .pv-sec.div{border-top:1px solid rgba(143,160,173,.28);padding-top:12px}
.ldx-pv .pv-cap{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:#8a959c;font-size:10px;font-weight:800;letter-spacing:1.2px;margin-bottom:7px}
.ldx-pv .pv-cap em{font-style:normal;color:#6f7b82;font-size:10px;font-weight:600;letter-spacing:0}
.ldx-pv .pv-conds{display:flex;gap:6px}
.ldx-pv .pv-cbtn{flex:1;min-height:56px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:#12181c;border:1px solid #2a3439;color:#7c878e;font-size:11.5px;font-weight:700}
.ldx-pv .pv-cbtn span{color:#c7d0d6}
.ldx-pv .pv-cbtn.ok{background:#0f2a1d;border-color:#2f8a5a;color:#7dd3a0}.ldx-pv .pv-cbtn.ok span{color:#9fe3bb}
.ldx-pv .pv-cbtn.lim{background:#2c2210;border-color:#b7862a;color:#f0b44a}.ldx-pv .pv-cbtn.lim span{color:#f5c46a}
.ldx-pv .pv-cbtn.fnd{background:#2e1416;border-color:#b4474d;color:#ff8a8a}.ldx-pv .pv-cbtn.fnd span{color:#ffa3a3}
.ldx-pv .pv-cbtn.dis{opacity:.4;cursor:default}
.ldx-pv .pv-limline{color:#f0a020;font-size:10.5px;font-weight:600;margin-top:7px}
.ldx-pv .pv-findline{display:flex;gap:7px;align-items:flex-start;padding-top:7px;margin-top:8px;border-top:1px solid #151a1c;color:#dde6e8;font-size:11px}
.ldx-pv .pv-findline i{width:7px;height:7px;border-radius:4px;background:#ff5a5a;margin-top:4px;flex:none}
.ldx-pv .pv-ogrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ldx-pv .pv-opt{min-height:54px;border-radius:12px;padding:7px;display:flex;flex-direction:column;justify-content:space-between;background:#12181c;border:1px solid #2a3439;color:#4a5660;min-width:0}
.ldx-pv .pv-opt span{color:#c7d0d6;font-size:11.5px;font-weight:600;line-height:1.2;margin-top:5px;overflow-wrap:anywhere}
.ldx-pv .pv-opt.on{background:#0f2236;border-color:#3d8fe0;color:#8cc4ff}
.ldx-pv .pv-opt.on span{color:#eaf3fb;font-weight:700}
.ldx-pv .pv-addrow{display:flex;align-items:center;gap:7px;min-height:36px;margin-top:2px;color:#c7d0d6;font-size:12px;font-weight:600;width:100%}
.ldx-pv .pv-addrow input,.ldx-pv .pv-reading{flex:1;min-width:0;background:#12181c;border:1px solid #2a3439;border-radius:8px;color:#eaf6f7;font-size:12.5px;padding:7px 9px;font-family:inherit}
.ldx-pv .pv-reading{width:100%}
.ldx-pv .pv-sheetbg{position:absolute;inset:0;background:rgba(0,0,0,.7);display:flex;flex-direction:column;justify-content:flex-end;z-index:5}
.ldx-pv .pv-sheet{background:#090909;border-top:1px solid #1a1a1a;border-radius:22px 22px 0 0;padding-bottom:18px;max-height:78%;overflow:auto}
.ldx-pv .pv-hd{width:36px;height:4px;border-radius:2px;background:#222;margin:10px auto 4px}
.ldx-pv .pv-hh{display:flex;align-items:center;gap:10px;padding:10px 20px 12px;border-bottom:1px solid #111;color:#8fa0ad;font-size:9px;font-weight:900;letter-spacing:2.2px}
.ldx-pv .pv-hh button{margin-left:auto;color:#EAF1FB;font-size:10px;font-weight:900;letter-spacing:1.2px}
.ldx-pv .pv-cap2{color:#46525a;font-size:8.5px;font-weight:800;letter-spacing:2.2px;padding:12px 20px 4px}
.ldx-pv .pv-row{display:block;width:100%;padding:12px 20px;border-bottom:1px solid #0d0d0d;color:#ffe6bf;font-size:13px;font-weight:600}
.ldx-pv .pv-row.f{color:#e8ecef}
.ldx-pv .pv-big{display:block;margin:12px 20px 0;padding:12px;border-radius:12px;text-align:center;background:rgba(33,123,232,.16);border:1px solid rgba(33,123,232,.45);color:#9cc4f2;font-size:10px;font-weight:900;letter-spacing:.8px;width:calc(100% - 40px)}
.ldx-pv .pv-big{text-align:center}
.ldx-pv .pv-foot{color:#5f6d78;font-size:10.5px;line-height:1.5;padding:10px 20px 0;margin:0}
.ldx-pv .pv-toast{position:absolute;left:12px;right:12px;bottom:84px;z-index:6;background:rgba(14,24,34,.96);border:1px solid rgba(47,74,98,.5);border-radius:12px;padding:10px 12px;color:#eef3f5;font-size:11.5px;font-weight:600;text-align:center}
.ldx-pv .pv-big1{flex:1;min-width:0;color:#eef3f5;font-size:22px;font-weight:800;letter-spacing:-.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-guidechip{border:1px solid rgba(47,140,232,.4);border-radius:999px;padding:4px 8px;color:#2F8CE8;font-size:9.5px;font-weight:900;letter-spacing:.7px;white-space:nowrap}
.ldx-pv .pv-group{margin-top:14px}
.ldx-pv .pv-ghead{display:flex;justify-content:space-between;align-items:center;padding:0 3px 5px;border-bottom:1px solid #1b2429;color:#8a959c;font-size:9.5px;font-weight:900;letter-spacing:1.3px}
.ldx-pv .pv-ghead em{font-style:normal;color:#2F8CE8;font-size:11px;font-weight:700;letter-spacing:0}
.ldx-pv .pv-item{display:flex;align-items:center;gap:8px;width:100%;min-height:50px;padding:8px 3px;border-bottom:1px solid #131c22}
.ldx-pv .pv-dot{width:8px;height:8px;border-radius:4px;flex:none}
.ldx-pv .pv-itx{flex:1;min-width:0;display:flex;flex-direction:column}
.ldx-pv .pv-itx em{font-style:normal;color:#8cc4ff;font-size:8.5px;font-weight:900;letter-spacing:1px}
.ldx-pv .pv-itx b{color:#eef3f5;font-size:13px;font-weight:600;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-itx .pv-needs{color:#f0a020;font-size:10px;font-weight:700;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-iv{font-size:11px;font-weight:600;max-width:38%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-toprow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ldx-pv .pv-toprow .pv-eyebrow{flex:1;min-width:0}
.ldx-pv .pv-exit{border:1px solid #26363b;border-radius:999px;padding:3px 8px;color:#8fa0ad;font-size:9px;font-weight:900;letter-spacing:.7px;white-space:nowrap}
.ldx-pv .pv-sysbtn{flex:1;min-width:0;display:flex;align-items:center;margin-left:-5px}
.ldx-pv .pv-kindrow{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;color:#8cc4ff;font-size:9.5px;font-weight:900;letter-spacing:1.1px}
.ldx-pv .pv-kindrow small{color:#7f9197;font-size:9.5px}
.ldx-pv .pv-pill{border:1px solid;border-radius:999px;padding:2px 8px;font-size:9.5px;font-weight:800;letter-spacing:0;white-space:nowrap}
.ldx-pv .pv-steptitle{color:#dfe7ec;font-size:16px;font-weight:700;margin:2px 0 12px}
.ldx-pv .pv-xcap{color:#8cc4ff;font-size:10px;font-weight:900;letter-spacing:1.5px;margin-top:22px}
.ldx-pv .pv-xsys{color:#eef3f5;font-size:28px;font-weight:800;letter-spacing:-.5px;margin-top:3px}
.ldx-pv .pv-xstat{color:#8fa0ad;font-size:11.5px;font-weight:600;margin-top:5px}
.ldx-pv .pv-xcard{display:flex;flex-direction:column;gap:3px;margin-top:18px;padding:12px;border:1px solid #1f2d37;background:#0d151b;border-radius:12px}
.ldx-pv .pv-xcard em{font-style:normal;color:#7c878e;font-size:9px;font-weight:900;letter-spacing:1.3px}
.ldx-pv .pv-xcard span{color:#8cc4ff;font-size:9.5px;font-weight:900;letter-spacing:1.1px}
.ldx-pv .pv-xcard b{color:#eef3f5;font-size:15px;font-weight:700}
.ldx-pv .pv-xleave{color:#7f9197;font-size:11px;line-height:1.5;margin-top:14px}
.ldx-pv .pv-nav{flex:none;display:flex;gap:8px;padding:8px 12px;background:#05070b;border-top:1px solid rgba(38,50,62,.55)}
.ldx-pv .pv-nb,.ldx-pv .pv-nn{display:flex;align-items:center;justify-content:center;gap:4px;border-radius:11px;padding:11px 6px;font-size:11px;font-weight:900;letter-spacing:.6px;white-space:nowrap;overflow:hidden}
.ldx-pv .pv-nb{flex:1;border:1px solid #26363b;background:#0d151b;color:#c7d0d6}
.ldx-pv .pv-nb:disabled{opacity:.35;cursor:default}
.ldx-pv .pv-nn{flex:2;background:#2F8CE8;color:#04101c;text-align:center}
@media (prefers-reduced-motion:reduce){.ldx-pv *{transition:none!important}}
`;
