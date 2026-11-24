'use client';

// ─── PhonePreview — the inspector's phone, drawn from the CURRENT DRAFT ─────────────────────────────────────
//
// What a Ledrix Inspect inspector would see for this template, so an owner can "use" it before publishing. It
// renders ONLY from `tree`; nothing about the house or the checklist is hardcoded except the header's sample text.
// Taps (picks, condition answers, open sheets, the current screen) are local state and are never saved.
//
// Modeled on the app (ledrix-app, read-only), screen by screen:
//   · header ................ src/app/ScopeScreen.tsx (chrome: back, blue dot + address, sub lines, menu)
//   · landing ............... src/components/inspect/CoverageGrid.tsx (building row, "n of m checkpoints" under it,
//                              three-across system tiles with the progress line (was red / amber / green lights until 2026-11-11), dashed Add system)
//   · a system's page ....... src/components/systems/ScopeWorkspace.tsx — since 2026-10-24 the system's ITEM LIST:
//                              one row per Guided Coverage step, grouped by component group (kind, name, status,
//                              what is recorded). The steps come from the app's own guidedOrder.ts (byte-identical
//                              copy), so the list and the walk are the app's.
//   · a guided step ......... src/components/systems/GuidedStep.tsx (the SYSTEM as the big heading, the item under
//                              it, Back / Next fixed above the tabs, the system-boundary card between systems) whose
//                              body is src/components/systems/ScopeRowList.tsx + scopeRowStyles.ts (CONDITION:
//                              Satisfactory / Limitation / Finding, limitation + finding sheets, value grids)
//   · value grids ........... src/components/systems/SpecChipRow.tsx (SpecOptionGrid: three-across tiles, "Add …")
//   · bottom tabs ........... src/components/inspect/InspectTabBar.tsx (Job info · Photos · Camera · Findings · Systems, 2026-11-16)
//   · colours ............... src/core/theme/starlink.ts and the literals in the files above
// The phone is ALWAYS dark, as the app is, whatever the website's theme.
//
// Condition is never a grade (app DECISIONS 2026-08-10): the only answers are Satisfactory, Limitation, Finding.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import {
  axesOf, buildIndex, findingShortcutsOf, itemApplies, leafProgress, leavesOf, limitationReasonsFor, METHOD_ATTR, pickKey,
  previewDescribe, previewDetailsKeys, previewOffered, previewRowTitle, previewSpecValue, previewSteps, prunePicks, rulesFor, shownSystems, shownSpaces, sumProgress, tilesOf, type CondPick, type Picks,
} from './phonePreviewModel';
import {
  crossesSystem, GUIDED_KIND_LABEL, positionInSystem, reconcileIndex, resumeIndex, stepIndexOf, systemSummary, type GuidedStep,
} from '@/lib/templateBuilder/core/guidedOrder';
import { previewNeeds } from '@/lib/templates/requirementModel';
import { displayLabel } from './systemLabel';
import { shotsFor } from '@/lib/scope/core/taxonomy/systemShots';
import { hvacFold, COMBINED_LABEL } from '@/lib/scope/core/taxonomy/hvacUnits';
import { HOUSE_FACTS } from '@/lib/scope/core/taxonomy/houseFacts';
import { COLOR_ICONS, COLOR_SVGS } from './colorIcons';
import { groupIconFor, itemIconFor } from './groupIcons';

export type PreviewSelection = { systemId: string | null; nodeId: string | null };

// The app's screens (2026-10-24): the Coverage grid, a system's item list, a guided step, and the system-boundary
// card that Next / Back stops on between two systems — a state of the walk, never a step.
type Screen = { kind: 'landing' } | { kind: 'facts' } | { kind: 'system'; systemId: string; group?: string } | { kind: 'step'; key: string }
  | { kind: 'cross'; from: string; to: string; dir: 'forward' | 'back' }
  /** The tour's next-system card (app 2026-11-15, TourCard). */
  | { kind: 'tour'; from: string; to: string };
type Sheet = { kind: 'limit' | 'finding' | 'camera'; nodeId: string } | null;

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

/** A tile's icon (app TileIcon, 2026-11-14): Ledrix's own color drawing (colorIcons.ts, a byte-identical copy) when there is
 *  one and the switch is on, else the white glyph. The drawings are this app's own constants, never user content. */
function TileIco({ name, size = 24, color }: { name: string; size?: number; color?: string }) {
  const xml = COLOR_ICONS ? COLOR_SVGS[name] : undefined;
  if (!xml) return <Icon name={name} size={size} color={color} />;
  const s = Math.round(size * 1.4);
  return <span className="pv-ci" style={{ width: s, height: s }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: xml }} />;
}
const UNIT_SYSTEMS = ['mini_split', 'heat_pump'];

const toneOf = (p: { met: number; total: number; finding: boolean; limited: boolean }) =>
  p.finding ? '#ff5a5a' : p.limited ? '#f0a020' : p.total && p.met >= p.total ? '#7dc9a0' : p.met ? '#217BE8' : '#8fa0ad';
const HL_MS = 1400;

export function PhonePreview({ tree, selection, onSelect, address = 'Sample inspection', answer = null }: {
  tree: InspectionTemplate;
  selection: PreviewSelection;
  onSelect: (s: PreviewSelection) => void;
  address?: string;
  /** BUILT BY TYPE (owner 2026-11-05): the type the builder is looking at, as the preview's answer to that system's type
   *  question — the preview then shows exactly what an inspector sees for that type. Null: no type is being looked at. */
  answer?: { key: string; value: string } | null;
}): JSX.Element {
  const index = useMemo(() => buildIndex(tree), [tree]);
  // A ROOM'S LINKS ARE THE TRADE'S RECORD (app 2026-11-15, x47: "one record, the room shows it"): a link row reads and
  // writes the item it points to, so a room's Condition and progress are that record's.
  const recordId = (id: string) => { const r = index.byId[id]?.node; return r?.pointsTo && index.byId[r.pointsTo.nodeId] ? r.pointsTo.nodeId : id; };
  const systems = useMemo(() => shownSystems(tree), [tree]);
  const spaces = useMemo(() => shownSpaces(tree), [tree]);

  const [screen, setScreen] = useState<Screen>({ kind: 'landing' });
  // A walk entered inside a system stays in it (app ScopeScreen walkScope, 2026-11-15); null = the whole inspection.
  const [walkScope, setWalkScope] = useState<string | null>(null);
  /** THE BAR CAMERA'S ROW (app 2026-11-15, owner: "it should follow selected row"): a tapped row name on a walk step. */
  const [camPick, setCamPick] = useState<{ id: string; keep: boolean } | null>(null);
  /** A group's Condition (layout rule screen 3): its rows only, and ‹ returns to the group. */
  const [condGrp, setCondGrp] = useState<string | null>(null);
  /** THE TOUR (app 2026-11-15): Guided coverage runs each system as Start here does, a next-system card between. */
  const [tour, setTour] = useState(false);
  const [picks, setPicks] = useState<Picks>({});
  const [typed, setTyped] = useState<Picks>({});
  const [cond, setCond] = useState<Record<string, CondPick>>({});
  // The builder's chosen type is the answer to its type question here; looking at the grid or the full list again
  // clears only the answer it set (a pick tapped in the preview itself is left alone).
  const lastAnswer = useRef<{ key: string; value: string } | null>(null);
  useEffect(() => {
    const prev = lastAnswer.current;
    lastAnswer.current = answer;
    setPicks(p => {
      const next = { ...p };
      if (prev && (!answer || prev.key !== answer.key) && (next[prev.key] ?? []).join('|') === prev.value) delete next[prev.key];
      if (answer) next[answer.key] = [answer.value];
      return next;
    });
  }, [answer?.key, answer?.value]);   // eslint-disable-line react-hooks/exhaustive-deps
  // THE RULES A NEW INSPECTION WOULD CAPTURE from this draft, evaluated against the answers tapped here — the same
  // compiler and resolver the phone runs (phonePreviewModel.rulesFor / itemApplies), so a rule-gated item appears
  // and disappears here exactly when it would on the phone.
  const rules = useMemo(() => rulesFor(tree), [tree]);
  const applies = useMemo(() => {
    const sv = previewSpecValue(index, picks, typed);
    return (id: string) => itemApplies(rules, id, sv);
  }, [rules, index, picks, typed]);
  // THE WALK — the app's step list for this draft and these answers (guidedOrder, the app's own module).
  // THE HEAT PUMP / MINI SPLIT FOLD (app hvacUnits + ScopeScreen, 2026-11-13/14): Heating and Cooling whose only type is the
  // unit fold into its tile — off the grid, walked right after it, listed on its page with their Photos & details.
  const fold = useMemo(() => {
    const sv = previewSpecValue(index, picks, typed);
    return hvacFold({ heating: sv('hvac_heating::fuel_source'), cooling: sv('hvac_cooling::spec') });
  }, [index, picks, typed]);
  const folded = fold.folded as string[];
  const tileOf = (sysId: string) => (fold.into && folded.includes(sysId) ? fold.into : sysId);
  // HEATING & COOLING (app 2026-11-14, hvacUnits): a furnace + a split AC fold into the Heating tile, named as the phone names it.
  const sysName = (x: { id: string; label: string }) => (fold.into === 'heating' && x.id === 'heating' ? COMBINED_LABEL : displayLabel(x.label));
  const tileSystems = useMemo(() => systems.filter(s => !(fold.into && folded.includes(s.id)) && (!UNIT_SYSTEMS.includes(s.id) || fold.into === s.id)),
    [systems, fold]);   // eslint-disable-line react-hooks/exhaustive-deps
  const walkSystems = useMemo(() => (fold.into
    ? systems.filter(s => !folded.includes(s.id)).flatMap(s => (s.id === fold.into ? [s, ...systems.filter(x => folded.includes(x.id))] : [s]))
    : systems), [systems, fold]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ROOMS WALK TOO (app 2026-11-16, stages 4–5): a room's page is a system's page — its item tiles, Condition · Start here,
  // its own walk. The preview's room items carry their own ids, so a room's steps sit after the systems' in one list.
  const roomIds = useMemo(() => new Set(spaces.map(sp => sp.id)), [spaces]);
  const allSteps = useMemo(() => [...previewSteps(walkSystems, applies), ...previewSteps(spaces, applies)], [walkSystems, spaces, applies]);
  // DESCRIBED IN DETAILS (app 2026-11-08): the spec fields Details asks — a description step made only of them leaves the
  // walk and folds into one line on its system page; on a card they show as one line, not a grid.
  const detailsKeys = useMemo(() => previewDetailsKeys(tree, rules), [tree, rules]);
  const describeBy = useMemo(() => previewDescribe(tree, rules, picks), [tree, rules, picks]);
  const describedStep = (st: GuidedStep): { set: boolean } | null => {
    if (st.kind !== 'description') return null;
    const rows = st.rowIds.map(id => index.byId[id]?.node).filter(Boolean) as TemplateNode[];
    if (rows.some(n => axesOf(n).attributes.some(a => !(a.values ?? []).length))) return null;
    const fields = rows.flatMap(n => axesOf(n).attributes.map(a => ({ n, a })));
    if (!fields.length || !fields.every(x => detailsKeys.has(`${x.n.id}|${x.a.id}`))) return null;
    return { set: fields.every(x => (picks[pickKey(x.n.id, x.a.id)] ?? []).length > 0) };
  };
  // START HERE = THE TILES, IN ORDER (app 2026-11-16, mockup 5NVwdqPKENDv2i6ZiENxdz): every item is a walk stop — a
  // condition-only one too — so a tile and the walk open the same card. Only an item Details asks in full is passed by.
  const steps = useMemo(() => allSteps.filter(st => !describedStep(st)), [allSteps, detailsKeys, index]);   // eslint-disable-line react-hooks/exhaustive-deps
  const prevSteps = useRef<GuidedStep[]>([]);
  const [limReason, setLimReason] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [adding, setAdding] = useState<{ key: string; text: string } | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  // DESCRIBED IN DETAILS: a group's list (`list:<group>`), items opened in it with "Change", and cards whose Details
  // grids were opened with Change (`spec:<node>`) — app ScopeWorkspace / ScopeRowList, 2026-11-08.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
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
    if (screen.kind === 'step') { const st = steps.find(x => x.key === screen.key); go(st ? { kind: 'system', systemId: tileOf(st.systemId) } : { kind: 'landing' }); }
    else if (screen.kind === 'facts') go({ kind: 'landing' });
    else if (screen.kind === 'cross') go({ kind: 'step', key: screen.from });
    else if (screen.kind === 'tour') { setTour(false); go({ kind: 'system', systemId: screen.from }); }
    else if (screen.kind === 'system') go(screen.group ? (screen.group === '__condition__' && condGrp ? { kind: 'system', systemId: screen.systemId, group: condGrp } : { kind: 'system', systemId: screen.systemId }) : { kind: 'landing' });
  };
  const reset = () => {
    setPicks({}); setTyped({}); setCond({}); setLimReason({}); setFinding({}); setReadings({});
    setSheet(null); setAdding(null); setNote(null); go({ kind: 'landing' });
  };
  // Every system opens its item list — a flat system too (the app's one-card system page is gone).
  const openSystem = (sys: TemplateNode) => { go({ kind: 'system', systemId: sys.id }); emit({ systemId: sys.id, nodeId: null }); };
  const openStep = (st: GuidedStep) => {
    if (!steps.some(x => x.key === st.key)) {   // condition alone (app 2026-11-15): its system's Condition page, on that row
      const row = st.rowIds.find(id => { const r = index.byId[id]?.node; return !!r && axesOf(r).condition; });
      if (row) setCamPick({ id: row, keep: true });
      setCondGrp(st.tileId); go({ kind: 'system', systemId: tileOf(st.systemId), group: '__condition__' }); return;
    }
    go({ kind: 'step', key: st.key }); emit({ systemId: st.systemId, nodeId: st.key });
  };
  // THE APP'S NEXT / BACK (ScopeScreen guidedNext / guidedBack): the next or previous applicable step of the same
  // sequence; a move that crosses into another system stops on the boundary card first; Next on the last step ends
  // the walk on the Coverage grid. Nothing is written by moving.
  const move = (dir: 1 | -1) => {
    if (screen.kind !== 'step') return;
    const i = steps.findIndex(x => x.key === screen.key);
    if (i >= 0 && walkScope && tileOf(steps[i].systemId) === walkScope) {
      // THIS SYSTEM'S WALK: Back from its first item to Photos & details, Next from its last back to its page.
      const pool = steps.filter(x => tileOf(x.systemId) === walkScope), k = pool.findIndex(x => x.key === screen.key) + dir;
      if (k < 0) { setOpened(o => ({ ...o, [`photos:${walkScope}`]: true })); go({ kind: 'system', systemId: walkScope }); return; }
      if (k >= pool.length) { if (tour) { finishSys(walkScope); return; } go({ kind: 'system', systemId: walkScope }); say(`End of ${displayLabel(steps[i].systemLabel)}.`); return; }
      openStep(pool[k]); return;
    }
    const j = i + dir;
    if (i < 0 || j < 0) return;
    if (j >= steps.length) { go({ kind: 'landing' }); say('End of guided coverage.'); return; }
    if (crossesSystem(steps, i, j)) { go({ kind: 'cross', from: steps[i].key, to: steps[j].key, dir: dir > 0 ? 'forward' : 'back' }); return; }
    openStep(steps[j]);
  };
  // THE STOPS (app 2026-11-16, stage 5): the systems, then the rooms, in the grid's order.
  const tourOrder = [...systems.filter(x => tileOf(x.id) === x.id).map(x => x.id), ...spaces.map(sp => sp.id)]
    .filter(id => allSteps.some(st => tileOf(st.systemId) === id) || (describeBy[id]?.total ?? 0) > 0);
  const pageOfSys = (id: string) => shotsFor(id).length > 0 || (describeBy[id]?.total ?? 0) > 0;
  const enterSys = (id: string) => {
    setWalkScope(id);
    const pool = steps.filter(x => tileOf(x.systemId) === id);
    if (pageOfSys(id)) { setOpened(o => ({ ...o, [`photos:${id}`]: true })); go({ kind: 'system', systemId: id }); return; }
    if (pool.length) { openStep(pool[0]); return; }
    finishSys(id);
  };
  function finishSys(id: string) {
    const at = tourOrder.indexOf(id), next = at >= 0 ? tourOrder[at + 1] : undefined;
    if (!next) { setTour(false); go({ kind: 'landing' }); say('Guided coverage complete.'); return; }
    go({ kind: 'tour', from: id, to: next });
  }
  const stepStat = (st: GuidedStep) => sumProgress(st.rowIds.map(id => index.byId[recordId(id)]?.node).filter(Boolean) as TemplateNode[], picks, cond, readings);
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
    return (
      <>
        <div className="pv-bldg"><b>Main structure <Glyph d={G.chevD} size={12} /></b></div>
        {/* NO COUNTS (app 2026-11-16: "lets use the status bar everywhere"): the bar says it. */}
        <div className="pv-bar3" aria-label={`${tot.met} of ${tot.total} checkpoints addressed`}><i style={{ width: `${tot.total ? Math.round((tot.met / tot.total) * 100) : 0}%`, background: '#2F8CE8' }} /></div>
        {systems.length === 0 ? <p className="pv-empty">No system starts in scope. Inspectors would add each one with Add system.</p> : null}
        {/* THE TILES (app CoverageGrid, 2026-11-13/14): four across, the icon in a square, the name below; Before you start
            pinned first; a unit tile counts what folded into it. */}
        <div className="pv-tiles">
          <button type="button" className="pv-cell" onClick={() => go({ kind: 'facts' })} aria-label="Before you start, the house facts. Open">
            <span className="pv-sq pv-pin"><TileIco name="clipboard-text-outline" /></span>
            <span className="pv-tl">Before you start</span>
          </button>
          {tileSystems.map(sys => {
            const p = [sys, ...(fold.into === sys.id ? systems.filter(x => folded.includes(x.id)) : [])].map(progressOfSystem)
              .reduce((a, q) => ({ met: a.met + q.met, total: a.total + q.total }), { met: 0, total: 0 });
            const done = p.total > 0 && p.met >= p.total;
            return (
              <button key={sys.id} type="button" data-pv-id={sys.id} className={`pv-cell${hl === sys.id ? ' pv-hit' : ''}`}
                onClick={() => openSystem(sys)} aria-label={`${sysName(sys)}, ${p.met} of ${p.total}`}>
                <span className="pv-sq"><TileIco name={sys.icon ?? 'shape-outline'} />
                  <span className="pv-prog" aria-hidden="true"><i className={done ? 'g' : ''} style={{ width: `${p.total > 0 ? Math.round((p.met / p.total) * 100) : 0}%` }} /></span></span>
                <span className="pv-tl">{sysName(sys)}</span>
              </button>
            );
          })}
          <div className="pv-cell pv-add" aria-hidden="true"><span className="pv-sq"><Glyph d={G.plain} size={24} /></span><span className="pv-tl">Add system</span></div>
        </div>
        {spaces.length ? (
          <>
            <div className="pv-bldg" style={{ marginTop: 18 }}><b>Spaces</b></div>
            <div className="pv-bmeta">Walk with the camera. Shows the systems&apos; items that live there.</div>
            <div className="pv-tiles">
              {spaces.map(sp => (
                <button key={sp.id} type="button" data-pv-id={sp.id} className={`pv-cell${hl === sp.id ? ' pv-hit' : ''}`} onClick={() => openSystem(sp)} aria-label={`${sp.label}, room. Open`}>
                  <span className="pv-sq pv-sp"><TileIco name={sp.icon ?? 'door'} /></span>
                  <span className="pv-tl">{displayLabel(sp.label)}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {/* THE GRID'S PAIR (app 2026-11-15): Review & send on the left — grey with what is left until everything is covered,
            never disabled (on the phone it opens Post-Inspect, which lists what still stands) — and Guided coverage on the
            right, naming the TILE it picks up at (a folded Heating reads Heat Pump). */}
        {(() => {
          // The Coverage page's pair reads the systems (app: Review & send counts the building's systems).
          const sysSteps = steps.filter(st => !roomIds.has(st.systemId));
          const nx = sysSteps.length && !sysSteps.every(stepDone) ? sysSteps[resumeIndex(sysSteps, stepDone, 0)] : null;
          const tile = nx ? systems.find(x => x.id === tileOf(nx.systemId)) : null;
          const rows = systems.flatMap(x => condRowsOf(x.id));
          const left = rows.filter(id => !cond[id]).length + sysSteps.filter(st => !stepDone(st)).length;
          const covered = left === 0;
          return (
            <div className="pv-walk" style={{ marginTop: 12 }}><div className="pv-areacap" style={{ margin: 0 }}>Guided coverage</div><div className="pv-pair">
              <button type="button" className={`pv-pcond${covered ? ' ready' : ' dim'}`} onClick={() => say(covered ? 'On the phone, Review & send opens Post-Inspect.' : 'On the phone, Review & send opens Post-Inspect, which lists what is still left.')}
                aria-label={covered ? 'Review and send. Everything is covered' : `Review and send: ${left} left`}><b>Review &amp; send</b><small>{covered ? 'Everything covered' : `${left} left`}</small></button>
              <button type="button" className="pv-pstart" disabled={!nx} onClick={() => { const first = tourOrder[0]; if (first) { setTour(true); enterSys(first); } }}
                aria-label={nx ? `Guided coverage, picking up at ${displayLabel(tile?.label ?? nx.systemLabel)}` : 'Guided coverage: everything walked'}>
                <span><b>Guided coverage</b><small>{nx ? `Picks up at ${displayLabel(tile?.label ?? nx.systemLabel)}` : 'Everything walked'}</small></span><i>▶</i></button>
            </div></div>
          );
        })()}
      </>
    );
  };

  // ── BEFORE YOU START (app BeforeYouStart, 2026-11-13/14): the house facts, asked first, one page each on the phone ──
  const factsPage = () => (
    <>
      <div className="pv-sysrow">
        <button type="button" className="pv-iconbtn" onClick={back} aria-label="Back to all systems"><Glyph d={G.chevL} size={22} color="#c7d0d6" /></button>
        <span className="pv-big1">Before you start</span>
      </div>
      <div className="pv-syssub">Asked first, one question per page, Next to move on. Scope is built from these.</div>
      <div className="pv-group">
        {HOUSE_FACTS.map(f => (
          <div key={f.id} className="pv-fact"><b>{f.question ?? f.label}</b><span>{f.multi ? 'Pick every one. ' : ''}{(f.hint ?? '').replace(/^Pick every one\.?\s*/, '')}</span></div>
        ))}
      </div>
    </>
  );


  // ── A SYSTEM'S PAGE: ITS ITEMS (ScopeWorkspace, 2026-10-24) ──
  // ── A SYSTEM'S PAGE: ITS GROUPS AS TILES; A GROUP OPENS ITS CARDS (app ScopeWorkspace, 2026-11-08) ──
  // Several groups → one tile per group; a one-group system opens straight on its cards. A group's page stacks each
  // item's cards (the same leafCard a guided step draws).
  const systemPage = (sysId: string, openGroup?: string) => {
    const sys = index.allSystems[sysId]; if (!sys) return null;
    // A unit tile's page lists what folded into it too (app ScopeScreen ofSys, 2026-11-14).
    const mine = allSteps.filter(st => tileOf(st.systemId) === sysId);
    const parts = [sysId, ...(fold.into === sysId ? folded : [])];
    const shots = parts.flatMap(id => shotsFor(id));
    // Photos & details (app 2026-11-08): shots or questions give the tile; its line is what is still needed.
    const dsc = parts.map(id => describeBy[id] ?? { left: 0, total: 0 }).reduce((a, d) => ({ left: a.left + d.left, total: a.total + d.total }), { left: 0, total: 0 });
    const hasTile = shots.length > 0 || dsc.total > 0;
    // app 2026-11-09 ("Shoot a system"): a preview has no photos — the tile says Start here, as the phone does before any photo.
    const photosOpen = hasTile && !!opened[`photos:${sysId}`];   // the page lists every item; the walk passes the described ones by
    const p = parts.map(id => index.allSystems[id]).filter(Boolean).map(x => progressOfSystem(x as TemplateNode))
      .reduce((a, q) => ({ ...q, met: a.met + q.met, total: a.total + q.total }));
    const isDone = (st: GuidedStep) => { const q = stepStat(st); return q.total > 0 && q.met >= q.total; };
    const isDescribed = (st: GuidedStep) => { const q = stepStat(st); const n = index.byId[st.key]?.node;
      return !!describedStep(st) && !q.finding && !q.limited && !(n && previewNeeds(n)); };
    const knownValue = (st: GuidedStep) => st.rowIds.flatMap(id => { const r = index.byId[id]?.node; return r ? axesOf(r).attributes.flatMap(a => picks[pickKey(r.id, a.id)] ?? []) : []; }).join(', ') || 'Set';
    const groups: Array<{ id: string; label: string; items: GuidedStep[] }> = [];
    mine.forEach(st => { let g = groups.find(x => x.id === st.tileId); if (!g) { g = { id: st.tileId, label: st.tileLabel, items: [] }; groups.push(g); } g.items.push(st); });
    // Every system like Heating (app ScopeWorkspace, owner 2026-11-10): tiles first, one group or many.
    const condOpen = openGroup === '__condition__';
    // ONE GROUP, ONE PAGE (app 2026-11-16): a one-group system shows its items on its own page, Details first.
    const sole = !openGroup && groups.length === 1 ? groups[0] : undefined;
    const active = groups.find(g => g.id === openGroup) ?? sole;
    const inGroup = !!active;
    const items = active ? active.items : mine;
    const done = items.filter(isDone).length;
    const pool = (inGroup ? items : mine).filter(st => steps.some(x => x.key === st.key));   // the walk (app 2026-11-15: on-the-spot items)
    const nextUp = pool.length ? pool[resumeIndex(pool, stepDone, 0)] : null;
    const start = () => { if (nextUp) { setWalkScope(sysId); openStep(nextUp); } else if (tour) finishSys(sysId); };
    const met = inGroup && active !== sole ? done : p.met, total = inGroup && active !== sole ? items.length : p.total;
    // THE DETAILS TILE (app 2026-11-16: "lets put the tile back"; named Details): first, opens the page without the camera.
    const detailsTile = hasTile ? (
      <button type="button" className="pv-cell" onClick={() => setOpened(o => ({ ...o, [`photos:${sysId}`]: true }))} aria-label="Details. Open to check or edit">
        <span className="pv-sq" style={{ borderColor: 'rgba(33,123,232,0.55)', background: 'rgba(33,123,232,0.12)' }}><TileIco name="camera-outline" /></span>
        <span className="pv-tl">Details</span>
        <span className="pv-tl" style={{ color: dsc.left ? '#f5c46a' : '#4fd88a', fontSize: 10 }}>{dsc.left ? 'To answer' : 'Check & edit'}</span>
      </button>
    ) : null;
    return (
      <>
        <div className="pv-eyebrow">{address.toUpperCase()} · MAIN STRUCTURE{inGroup ? ` · ${sysName(sys).toUpperCase()}` : ''}</div>
        <div className="pv-sysrow">
          <button type="button" className="pv-iconbtn" onClick={back} aria-label={inGroup ? `Back to ${sysName(sys)}` : 'Back to all systems'}><Glyph d={G.chevL} size={22} color="#c7d0d6" /></button>
          <span className="pv-big1">{inGroup && active !== sole ? displayLabel(active!.label) : condOpen ? 'Condition' : sysName(sys)}</span>
          {/* ⚠ BY EVERY PAGE'S TITLE (app 2026-11-16): on the phone it files or reviews this system's limitations. No counter. */}
          <span className="pv-tlim" title="Limitations on this system (on the phone)">⚠</span>
        </div>
        <div className="pv-bar3"><i style={{ width: `${total ? Math.round((met / total) * 100) : 0}%`, background: '#2F8CE8' }} /></div>
        <div className="pv-syssub">{!active ? 'Tap a group to open it' : 'Tap an item to open it'}</div>
        {!mine.length ? <p className="pv-empty">Nothing in scope for this category yet.</p> : null}
        {/* THE PHOTOS TILE (app ScopeWorkspace, 2026-11-08): the system's named shots first — on the phone Ledrix reads them
            and suggests the Details answers to confirm; here it lists the shots this draft asks for. */}
        {photosOpen ? (
          <div className="pv-group">
            <div className="pv-ghead"><span>Details · photos that help Ledrix</span><button type="button" className="pv-linkbtn" onClick={() => setOpened(o => ({ ...o, [`photos:${sysId}`]: false }))}>Back</button></div>
            <div className="pv-shots">
              {shots.map(sh => <div key={sh.id} className="pv-shot"><b>{sh.label}</b><span>{sh.hint}</span></div>)}
            </div>
            <div className="pv-guide">On the phone, Ledrix reads these photos and suggests this system's Details answers for the inspector to confirm; whatever they don't settle is listed under Still needed.</div>
            {/* LAYOUT RULE screen 4 (app 2026-11-15): one equal row — 📷 Shoot (on the phone) · Next into the items. */}
            <div className="pv-nav">
              <button type="button" className="pv-nb" style={{ flex: 1 }} onClick={() => say('On the phone, Shoot opens the camera for this system.')} aria-label="Shoot (on the phone)">📷 SHOOT</button>
              <button type="button" className="pv-nn" style={{ flex: 1 }} onClick={() => { setOpened(o => ({ ...o, [`photos:${sysId}`]: false })); start(); }} aria-label="Next step">NEXT<Glyph d={G.chevR} size={16} /></button>
            </div>
          </div>
        ) : null}
        {/* ONE LIST (app 2026-11-22, launch list n8; mockup 3yWuh6jruKT8Ra6sfNCAwr): the system's items once — the circle =
            Satisfactory, the type under the name ("Choose type" while unanswered), the camera = a finding; each section ends
            with "Mark the rest Satisfactory", its type items first; one count. An item is done when its condition and its
            type are answered (app core/taxonomy/oneList.ts). */}
        {condOpen ? (() => {
          const rows = condRowsOf(sysId, condGrp);
          const grpOf = (id: string) => allSteps.find(x => tileOf(x.systemId) === sysId && x.rowIds.includes(id))?.tileLabel ?? '';
          const typeOf = (id: string) => {
            const r = index.byId[id]!.node;
            const attrs = axesOf(r).attributes;
            if (!attrs.length) return null;
            const value = attrs.flatMap(a => picks[pickKey(r.id, a.id)] ?? []).join(', ');
            return { value, need: !value };
          };
          const doneOf = (id: string) => (!!cond[id]) && !typeOf(id)?.need;
          const sections: { name: string; ids: string[] }[] = [];
          for (const id of rows) { const g = grpOf(id); const last = sections[sections.length - 1]; if (last && last.name === g) last.ids.push(id); else sections.push({ name: g, ids: [id] }); }
          for (const sec of sections) sec.ids = [...sec.ids.filter(id => !!typeOf(id)), ...sec.ids.filter(id => !typeOf(id))];
          const doneN = rows.filter(doneOf).length;
          return (
            <div className="pv-group">
              <div className="pv-1count">{doneN} of {rows.length} done</div>
              <div className="pv-1bar"><i style={{ width: `${rows.length ? Math.round((doneN / rows.length) * 100) : 0}%` }} /></div>
              {!rows.length ? <p className="pv-empty">Nothing to judge yet.</p> : null}
              {sections.map((sec, si) => {
                const rest = sec.ids.filter(id => !cond[id]);
                return (
                  <Fragment key={`sec:${si}:${sec.name}`}>
                    {sec.name ? <div className="pv-1cap">{displayLabel(sec.name).toUpperCase()}</div> : null}
                    <div className="pv-1card">
                      {sec.ids.map(id => {
                        const r = index.byId[id]!.node;
                        const t = typeOf(id);
                        const c = cond[id];
                        return (
                          <div key={id} data-pv-id={id} className="pv-1row">
                            <button type="button" className={`pv-1dot${c === 'ok' ? ' ok' : ''}${c === 'fnd' ? ' fnd' : ''}${c === 'lim' ? ' lim' : ''}`} disabled={c === 'fnd'} aria-pressed={c === 'ok'}
                              aria-label={`${c === 'ok' ? 'Clear Satisfactory for' : 'Mark Satisfactory:'} ${r.label}`}
                              onClick={e => { e.stopPropagation(); setCond(p => { const o = { ...p }; if (o[id] === 'ok') delete o[id]; else o[id] = 'ok'; return o; }); }}>
                              {c === 'ok' ? <Glyph d={G.check} size={14} color="#000" /> : null}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <b>{displayLabel(r.label)}</b>
                              {t?.need ? <small className="choose">Choose type</small> : t?.value ? <small>{t.value}</small> : null}
                              {c === 'fnd' ? <small className="fnd">Finding</small> : c === 'lim' ? <small className="lim">{limReason[id] ?? 'Couldn’t inspect'}</small> : null}
                            </div>
                            <button type="button" className="pv-1cam" aria-label={`Shoot a finding on ${r.label}`} onClick={() => setSheet({ kind: 'camera', nodeId: id })}><Glyph d={G.camera} size={20} /></button>
                          </div>
                        );
                      })}
                      {rest.length ? (
                        <button type="button" className="pv-1rest" onClick={() => setCond(p => { const o = { ...p }; rest.forEach(id => { if (!o[id]) o[id] = 'ok'; }); return o; })}>Mark the rest Satisfactory</button>
                      ) : null}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          );
        })() : photosOpen ? null : !active ? (
          <div className="pv-tiles">
            <div className="pv-areacap">System components</div>
            {detailsTile}
            {groups.map(g => {
              const d = g.items.filter(isDone).length;
              const all = g.items.length > 0 && d === g.items.length;
              return (
                <button key={g.id} type="button" data-pv-id={g.id !== sysId ? g.id : undefined} className={`pv-cell${hl === g.id ? ' pv-hit' : ''}`}
                  onClick={() => go({ kind: 'system', systemId: sysId, group: g.id })} aria-label={`${g.label}. Open its checklist`}>
                  <span className="pv-sq"><TileIco name={groupIconFor(g.label, () => 'shape-outline')} />
                    <span className="pv-prog" aria-hidden="true"><i className={all ? 'g' : ''} style={{ width: `${g.items.length ? Math.round((d / g.items.length) * 100) : 0}%` }} /></span></span>
                  <span className="pv-tl">{displayLabel(g.label)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pv-group">
            <div className="pv-ghead" data-pv-id={active.id !== sysId ? active.id : undefined}><span>{active.label.toUpperCase()}</span><em>+ Item</em></div>
            {/* ITEM TILES (app 2026-11-15): GROUP START HERE first (mockup UECFWqxWVPYRhPKppCNUwP) — this group's Details
                questions, then its first open item — then every item, a described one opening Photos & details. */}
            <div className="pv-itiles">
              {active === sole ? detailsTile : null}
              {/* The items to inspect only (app 2026-11-15, build 872): a described item is Photos & details'; Start here and
                  Condition are the bottom pair. */}
              {active.items.filter(st => !isDescribed(st)).map(st => {
                const q = stepStat(st);
                const state = q.finding ? 'fnd' : q.limited ? 'lim' : q.total > 0 && q.met >= q.total ? 'ok' : '';
                const sub = state === 'fnd' ? 'FINDING' : state === 'lim' ? 'LIMITATION' : state === 'ok' ? '✓ OK' : 'NOT YET';
                const open = () => { setWalkScope(sysId); openStep(st); };
                return (
                  <button key={st.key} type="button" data-pv-id={st.key} className={`pv-itile ${state}${hl === st.key ? ' pv-hit' : ''}`} onClick={open}
                    aria-label={`${st.label}, ${sub.toLowerCase()}. Open`}>
                    <span className="pv-iico"><TileIco name={itemIconFor(st.label, () => 'shape-outline')} /></span><b>{st.label}</b><small>{sub}</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Off the grid Guided is the first tile (app 2026-11-15); the thin bar is the grid's only. */}
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

  // THE BAR CAMERA'S TARGET (app ScopeRowList walkCam, 2026-11-15): the picked row while still open (one picked when already
  // addressed stays), else the first open row of the step, else its first row.
  const camStep = screen.kind === 'step' ? steps.find(x => x.key === screen.key) ?? null : null;
  const onCond = screen.kind === 'system' && screen.group === '__condition__';
  const condRowsOf = (sysId: string, grp?: string | null) => allSteps.filter(st => tileOf(st.systemId) === sysId && (!grp || st.tileId === grp)).flatMap(st => st.rowIds.map(recordId))
    .filter((id, i, all) => all.indexOf(id) === i && (() => { const r = index.byId[id]?.node; return !!r && !r.pointsTo && axesOf(r).condition; })());
  const camRows = camStep ? camStep.rowIds.filter(id => { const r = index.byId[id]?.node; return !!r && axesOf(r).condition; })
    : screen.kind === 'system' && onCond ? condRowsOf(screen.systemId) : [];
  const camTarget = !camStep && !onCond ? null
    : camPick && camRows.includes(camPick.id) && (camPick.keep || !cond[camPick.id]) ? camPick.id
    : camRows.find(id => !cond[id]) ?? camRows[0] ?? null;
  const camLabel = camTarget ? (index.byId[camTarget]?.node.label ?? '') : (camStep?.label ?? '');

  // ✓ + 📷 (app build 789, owner 2026-11-11: "a satisfactory and a camera button to open the camera and then shutter is
  // chosen"). The preview has no camera: 📷 opens a sheet with the camera's Finding / Limitation shutters.
  const conditionRow = (n: TemplateNode) => {
    const c = cond[n.id];
    return (
      <>
        <div className="pv-conds pv-icons">
          {c === 'fnd' ? <span className="pv-verdict fnd">⚑ Finding</span> : c === 'lim' ? <span className="pv-verdict lim">⚠ Limited</span> : null}
          <button type="button" className={`pv-ibtn${c === 'ok' ? ' ok' : ''}${c === 'fnd' ? ' dis' : ''}`} disabled={c === 'fnd'} aria-pressed={c === 'ok'} aria-label="Satisfactory"
            onClick={() => setCond(p => { const o = { ...p }; if (o[n.id] === 'ok') delete o[n.id]; else o[n.id] = 'ok'; return o; })}>
            <Glyph d={G.check} size={30} />
          </button>
          {/* In the walk the bar holds the camera (app 2026-11-15): the row draws none. */}
          <button type="button" className="pv-ibtn cam" aria-label="Camera" onClick={() => setSheet({ kind: 'camera', nodeId: n.id })}>
            <Glyph d={G.camera} size={30} />
          </button>
        </div>
        {c === 'lim' && limReason[n.id] ? <div className="pv-limline">{limReason[n.id]}</div> : null}
        {c === 'fnd' && finding[n.id] ? <div className="pv-findline"><i /><span>{finding[n.id]} — drafted for Review</span></div> : null}
      </>
    );
  };

  const leafCard = (sysId: string, n: TemplateNode, showSpecs = false) => {
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
    // DESCRIBED IN DETAILS (app ScopeRowList 2026-11-08): a field Details asks shows no grid — one line, its answer · from
    // Details · Change (opens the grid), or "Not described yet · Details".
    const moved = ax.attributes.filter(a => detailsKeys.has(`${n.id}|${a.id}`));
    const specOpen = showSpecs || !!opened[`spec:${n.id}`];
    const gridAttrs = ax.attributes.filter(a => specOpen || !moved.includes(a));
    const movedVals = moved.flatMap(a => picks[pickKey(n.id, a.id)] ?? []);
    const movedMissing = moved.some(a => !(picks[pickKey(n.id, a.id)] ?? []).length);
    const first = ax.attributes[0];
    const headVal = first ? (picks[pickKey(n.id, first.id)] ?? []).join(', ') : '';
    const named = ax.attributes.length > 1;
    const sel = hl === n.id;
    return (
      <div key={n.id} data-pv-id={n.id} className={`pv-leaf${sel ? ' sel pv-hit' : ''}${screen.kind === 'step' && camTarget === n.id ? ' campick' : ''}`}>
        <button type="button" className="pv-leafhead" onClick={() => { if (screen.kind === 'step') setCamPick({ id: n.id, keep: !!cond[n.id] }); emit({ systemId: sysId, nodeId: n.id }); flash(n.id); }} aria-label={`Select ${n.label} in the editor`}>
          {/* Company Tips open from the blue ⓘ on the phone, never as a line under the name (owner 2026-11-05). */}
          <span className="pv-ct">{previewRowTitle(n, picks)}{n.description?.trim() ? <span className="pv-tips" title={`Tips: ${n.description.trim()}`} aria-label="Has tips from your company">i</span> : null}{first && !named ? <span className={`pv-hv${headVal ? '' : ' empty'}`}>{headVal || 'Not set'}</span> : null}
            {/* 📋 (app build 792; y11 + y17 2026-11-17): amber = not described, blue = described. A tap is the name's tap — on the
                phone it enters the item, described or not ("I can't tap on the icon"; "it should take me to that individual
                row, not the system detail page"), here it selects the item, as the name does. */}
            {moved.length ? <span className={`pv-dicon${movedMissing ? ' miss' : ''}`} aria-label={movedMissing ? 'Not described yet' : `Described: ${movedVals.join(', ')}`}>
              <Glyph d="M9 4h6v3H9zM6 6h3M15 6h3v15H6V6M9 12h6M9 16h4" size={15} /></span> : null}
          </span>
        </button>
        {moved.length && !showSpecs && specOpen ? (
          <div className="pv-dline">
            <span>{movedVals.length ? <b>{movedVals.join(' · ')}</b> : 'Changing details'}</span>
            <button type="button" onClick={() => setOpened(o => ({ ...o, [`spec:${n.id}`]: false }))}>Done</button>
          </div>
        ) : null}
        {ax.condition ? <div className="pv-sec">{conditionRow(n)}</div> : null}
        {gridAttrs.map((a, i) => (
          <div key={a.id} className={`pv-sec${ax.condition || i > 0 ? ' div' : ''}`}>
            {optionGrid(n, pickKey(n.id, a.id), named ? a.label.toUpperCase() : 'MATERIAL / TYPE', previewOffered(n, a.id, a.values, picks), !!a.multi, named ? `Add ${a.label.toLowerCase()}` : 'Add a material')}
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
          <button type="button" className="pv-exit" onClick={() => go({ kind: 'landing' })}>Exit guided</button></div>
        <div className="pv-sysrow" style={{ marginTop: 4 }}>
          <button type="button" className="pv-sysbtn" onClick={() => go({ kind: 'system', systemId: st.systemId })} aria-label={`Open the ${displayLabel(st.systemLabel)} page`}>
            <Glyph d={G.chevL} size={20} color="#2F8CE8" /><span className="pv-big1">{displayLabel(st.systemLabel)}</span>
          </button>
        </div>
        <div className="pv-bar3"><i style={{ width: `${pos.of ? Math.round((pos.n / pos.of) * 100) : 0}%`, background: '#2F8CE8' }} /></div>
        <div className="pv-kindrow"><span>{GUIDED_KIND_LABEL[st.kind]}{sub ? <small>{`  ·  ${sub}`}</small> : null}</span>
          <span className="pv-pill" style={{ color: c, borderColor: c }}>{state}</span></div>
        <div className="pv-steptitle">{st.label} <span className="pv-tlim" title="Limitation on this item (on the phone)">⚠</span></div>
        {st.rowIds.map(id => { const n = index.byId[id]?.node; return n ? leafCard(st.systemId, n) : null; })}
      </>
    );
  };

  // ── THE SYSTEM BOUNDARY (GuidedTransitionView) ──
  // ── THE NEXT-SYSTEM CARD (app TourCard, 2026-11-15) — the system left's Condition as a link, never a stop ──
  const tourPage = (from: string, to: string) => {
    const name = (id: string) => sysName(index.allSystems[id]!);
    const toPool = steps.filter(x => tileOf(x.systemId) === to), fromPool = steps.filter(x => tileOf(x.systemId) === from);
    const rows = condRowsOf(from), doneN = rows.filter(id => !!cond[id]).length, finds = rows.filter(id => cond[id] === 'fnd').length;
    const condTxt = !rows.length ? 'Nothing yet' : doneN < rows.length ? `${doneN ? 'Part reviewed' : 'To review'} · do it now or come back any time` : finds ? `⚑ Finding${finds === 1 ? '' : 's'}` : 'All OK';
    // STILL TO DO (app 2026-11-16, stage 5): every other stop not done, in the grid's order, a bar each.
    const others = tourOrder.filter(id => id !== to && id !== from && !steps.filter(x => tileOf(x.systemId) === id).every(stepDone));
    const pctOf = (id: string) => { const pl = steps.filter(x => tileOf(x.systemId) === id); return pl.length ? Math.round((pl.filter(stepDone).length / pl.length) * 100) : 0; };
    return (
      <>
        <div className="pv-eyebrow">{address.toUpperCase()} · MAIN STRUCTURE</div>
        <div className="pv-xcap">Suggested next</div>
        <div className="pv-xsys">{name(to)}</div>
        <div className="pv-bar3"><i style={{ width: `${pctOf(to)}%`, background: '#2F8CE8' }} /></div>
        <div className="pv-xcard"><em>Starts with</em><b>{pageOfSys(to) ? 'Details' : toPool[0]?.label ?? 'Condition'}</b></div>
        {others.length ? (<>
          <div className="pv-xcap" style={{ marginTop: 12 }}>Still to do</div>
          {others.map(id => (
            <button key={id} type="button" className="pv-crow" style={{ width: '100%', textAlign: 'left', font: 'inherit' }} onClick={() => enterSys(id)} aria-label={`Go to ${name(id)}`}>
              <div style={{ flex: 1, minWidth: 0 }}><b>{name(id)}</b></div>
              <span className="pv-bar3" style={{ width: 64, margin: 0 }}><i style={{ width: `${pctOf(id)}%`, background: '#2F8CE8' }} /></span>
              <span style={{ color: '#9cc4f2', fontWeight: 800 }}>›</span>
            </button>
          ))}
        </>) : null}
        <div className="pv-xleave">Leaving {name(from)} · {!fromPool.length || fromPool.every(stepDone) ? 'Every item done' : fromPool.some(stepDone) ? 'Some items left' : 'Items not started'}</div>
        <button type="button" className="pv-crow" style={{ width: '100%', textAlign: 'left', font: 'inherit', marginTop: 8 }}
          onClick={() => { setTour(false); setCondGrp(null); go({ kind: 'system', systemId: from, group: '__condition__' }); }}>
          <div style={{ flex: 1, minWidth: 0 }}><b>✓ Condition</b><small>{condTxt}</small></div><span style={{ color: '#9cc4f2', fontWeight: 800 }}>Open ›</span>
        </button>
      </>
    );
  };

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
        <div className="pv-bar3"><i style={{ width: `${toSum.steps ? Math.round((toSum.done / toSum.steps) * 100) : 0}%`, background: '#2F8CE8' }} /></div>
        <div className="pv-xcard"><em>{dir === 'forward' ? 'STARTS WITH' : 'RETURNS TO'}</em><span>{GUIDED_KIND_LABEL[t.kind]}</span><b>{t.label}</b></div>
        <div className="pv-xleave">Leaving {displayLabel(fromSum.systemLabel)}. Nothing changes by moving on.</div>
      </>
    );
  };

  // ── BACK / NEXT, FIXED ABOVE THE TABS (GuidedNavBar in the rail's `above` slot) ──
  const navBar = () => {
    if (screen.kind === 'tour') {
      const from = screen.from, to = screen.to;
      return (
        <div className="pv-nav">
          <button type="button" className="pv-nb" onClick={() => { setTour(false); go({ kind: 'system', systemId: from }); }}><Glyph d={G.chevL} size={16} />{sysName(index.allSystems[from]!).toUpperCase()}</button>
          <button type="button" className="pv-nn" onClick={() => enterSys(to)}>BEGIN {sysName(index.allSystems[to]!).toUpperCase()}<Glyph d={G.chevR} size={16} /></button>
        </div>
      );
    }
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
    // THE CONDITION PAGE (layout rule screen 7): a list — no bottom bar; each row is ✓ + 📷.
    if (screen.kind === 'system' && screen.group === '__condition__') return null;
    // THE GUIDED WALK PAIR on a system page (app 2026-11-15, mockup 1gRjaYCeiaRfLtfvAJh662): Condition on the left, Start
    // here on the right — Photos & details, then the system's walk, else Condition.
    // …and on a group page (app 2026-11-15): Start here asks the group's Details questions, then walks from its first open item.
    if (screen.kind === 'system' && screen.group !== '__condition__' && !opened[`photos:${screen.systemId}`] && index.allSystems[screen.systemId]) {
      const sysId = screen.systemId, grp = screen.group;
      const parts = [sysId, ...(fold.into === sysId ? folded : [])];
      const hasPage = parts.some(id => shotsFor(id).length > 0 || (describeBy[id]?.total ?? 0) > 0);
      const dLeft = parts.reduce((n, id) => n + (describeBy[id]?.left ?? 0), 0);
      const pool = steps.filter(x => tileOf(x.systemId) === sysId && (!grp || x.tileId === grp));
      const nextUp = pool.length && !pool.every(stepDone) ? pool[resumeIndex(pool, stepDone, 0)] : null;
      const gLeft = grp ? allSteps.filter(x => tileOf(x.systemId) === sysId && x.tileId === grp && describedStep(x) && !describedStep(x)!.set).length : 0;
      const startMeta = grp ? (gLeft ? 'Details to answer' : nextUp ? `Walk: ${displayLabel(nextUp.label)}` : 'All done') : hasPage && dLeft ? '✦ Details to answer' : nextUp ? `Walk: ${displayLabel(nextUp.label)}` : 'All done';
      const rows = condRowsOf(sysId, grp), doneN = rows.filter(id => !!cond[id]).length, finds = rows.filter(id => cond[id] === 'fnd').length;
      const condMeta = !rows.length ? 'Nothing yet' : doneN < rows.length ? (doneN ? 'Part reviewed' : 'To review') : finds ? `Finding${finds === 1 ? '' : 's'}` : 'All OK';
      return (
        <div className="pv-walk"><div className="pv-areacap" style={{ margin: 0 }}>Guided walk</div><div className="pv-pair">
          <button type="button" className={`pv-pcond${doneN === rows.length && rows.length ? (finds ? ' fnd' : ' ok') : ''}`} onClick={() => { setCondGrp(grp ?? null); go({ kind: 'system', systemId: sysId, group: '__condition__' }); }}
            aria-label={`Condition: ${condMeta}. Open`}><b>Condition</b><small>{condMeta}</small></button>
          <button type="button" className="pv-pstart" aria-label={`Start here: ${startMeta}`} onClick={() => {
            setTour(false);
            if (grp ? gLeft > 0 : hasPage) { setOpened(o => ({ ...o, [`photos:${sysId}`]: true })); if (grp) go({ kind: 'system', systemId: sysId }); return; }
            if (pool.length) { setWalkScope(sysId); openStep(nextUp ?? pool[0]); return; }
            setCondGrp(grp ?? null); go({ kind: 'system', systemId: sysId, group: '__condition__' });
          }}><span><b>Start here</b><small>{startMeta}</small></span><i>▶</i></button>
        </div></div>
      );
    }
    if (screen.kind !== 'step') return null;
    const i = steps.findIndex(x => x.key === screen.key);
    const scoped = i >= 0 && !!walkScope && tileOf(steps[i].systemId) === walkScope;
    const pool = scoped ? steps.filter(x => tileOf(x.systemId) === walkScope) : steps;
    const at = pool.findIndex(x => x.key === screen.key);
    const last = at >= pool.length - 1;
    const sysHasPhotos = scoped && [walkScope!, ...(fold.into === walkScope ? folded : [])].some(id => shotsFor(id).length > 0 || (describeBy[id]?.total ?? 0) > 0);
    // THE WALK'S KEYS (app WalkKeys, 2026-11-15): ⚠ + the item's camera (on the phone), then Back · Skip · Next — Next
    // dim until the item is addressed, Skip moves on and leaves it open.
    const here = i >= 0 ? steps[i] : null;
    const done = here ? stepDone(here) : true;
    return (
      <div className="pv-walk">
        {/* LAYOUT RULE screen 6: Back · Skip · Next only — ⚠ by the item's title, 📷 on each row. */}
        <div className="pv-nav">
          <button type="button" className="pv-nb" disabled={at <= 0 && !sysHasPhotos} onClick={() => move(-1)} aria-label="Previous step"><Glyph d={G.chevL} size={16} />BACK</button>
          <button type="button" className="pv-nb" onClick={() => move(1)} aria-label="Skip: leave this one open and move on">SKIP</button>
          <button type="button" className={`pv-nn${done ? '' : ' pv-dim'}`} onClick={() => (done ? move(1) : say('Mark it OK, a finding or a limitation — or Skip.'))}
            aria-label={!done ? 'Not done yet' : last ? 'Finish guided coverage' : 'Next step'}>{last ? 'FINISH' : 'NEXT'}<Glyph d={G.chevR} size={16} /></button>
        </div>
      </div>
    );
  };

  const sheetView = () => {
    if (!sheet) return null;
    const loc = index.byId[sheet.nodeId]; if (!loc) return null;
    const n = loc.node; const title = n.label.toUpperCase();
    const close = () => setSheet(null);
    if (sheet.kind === 'camera') {
      return (
        <div className="pv-sheetbg" onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="pv-sheet" role="dialog" aria-label={`${n.label} — camera`}>
            <div className="pv-hd" />
            <div className="pv-hh">{title} — Camera<button type="button" onClick={close}>Cancel</button></div>
            <button type="button" className="pv-row" onClick={() => setSheet({ kind: 'finding', nodeId: n.id })}>Finding</button>
            <button type="button" className="pv-row" onClick={() => setSheet({ kind: 'limit', nodeId: n.id })}>Limitation</button>
            <p className="pv-foot">In the app, the camera opens on this item with three shutters: Coverage, Finding, Limitation. Holding the camera icon asks Finding or Limitation, then shows that quick list — these are those lists.</p>
          </div>
        </div>
      );
    }
    if (sheet.kind === 'limit') {
      const pick = (r: string) => { setCond(p => ({ ...p, [n.id]: 'lim' })); setLimReason(p => ({ ...p, [n.id]: r })); close(); };
      return (
        <div className="pv-sheetbg" onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="pv-sheet" role="dialog" aria-label={`${n.label} — limitation`}>
            <div className="pv-hd" />
            <div className="pv-hh">{title} — Limitation<button type="button" onClick={close}>Cancel</button></div>
            {limitationReasonsFor(n).map(r => <button key={r} type="button" className="pv-row" onClick={() => pick(r)}>{r}</button>)}
            <button type="button" className="pv-big" onClick={() => pick('Photographed — Ledrix drafts it for Review')}>PHOTOGRAPH IT — LEDRIX DRAFTS IT FOR REVIEW</button>
            <p className="pv-foot">In the app, holding the camera icon and choosing Limitation shows this list (saved without a photo).</p>
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
          <div className="pv-hh">{title} — New finding<button type="button" onClick={close}>Cancel</button></div>
          <div className="pv-cap2">Tap what you see</div>
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
  else if (screen.kind === 'facts') body = factsPage();
  else if (screen.kind === 'system') body = systemPage(screen.systemId, screen.group);
  else if (screen.kind === 'step') body = stepPage(screen.key);
  else if (screen.kind === 'tour') body = tourPage(screen.from, screen.to);
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
          </div>
          <div className="pv-scroll" ref={scrollRef}>{body}</div>
          {navBar()}
          {/* THE SLIM RAIL ON EVERY PAGE (app 2026-11-16): Job info · Photos · Camera (raised; the whole-inspection camera) ·
              Findings · Systems, under the page's own keys. */}
          <nav className="pv-tabs pv-rail" aria-label="Inspect tabs">
            <button type="button" onClick={() => say('On the phone, Job info opens the job’s access, contacts and property.')}><Glyph d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01" size={18} />Job info</button>
            <button type="button" onClick={() => say('On the phone, Photos opens every photo of the job.')}><Glyph d={G.images} size={18} />Photos</button>
            <button type="button" className="pv-railcam" onClick={() => say('On the phone, the Camera opens on the whole inspection: Building and System pills, Coverage · Finding · Limitation.')} aria-label="Camera"><span><Glyph d={G.camera} size={22} color="#ffffff" /></span></button>
            <button type="button" onClick={() => say('On the phone, Findings opens the findings to review.')}><Glyph d={G.flag} size={18} />Findings</button>
            <button type="button" className={screen.kind === 'landing' ? 'on' : ''} onClick={() => go({ kind: 'landing' })}><Glyph d={G.grid} size={18} />Systems</button>
          </nav>
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
.ldx-pv .pv-rail{align-items:flex-end;padding:4px 6px 16px}
.ldx-pv .pv-rail button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font:600 9.5px/1.2 inherit;color:#6f7b82;background:none;border:0;padding:0;cursor:pointer}
.ldx-pv .pv-rail button.on{color:#EAF1FB;font-weight:800}
.ldx-pv .pv-rail .pv-railcam span{width:44px;height:44px;border-radius:50%;background:#217BE8;display:flex;align-items:center;justify-content:center;margin-top:-16px;border:3px solid #05070b}
.ldx-pv .pv-bldg{display:flex;justify-content:center;min-height:30px;align-items:center}
.ldx-pv .pv-bldg b{color:#e8ecef;font-size:11.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;display:inline-flex;gap:4px;align-items:center}
.ldx-pv .pv-bmeta{text-align:center;color:#8a959c;font-size:11px;font-weight:600;margin-top:-2px;font-variant-numeric:tabular-nums}
.ldx-pv .pv-cov{display:flex;align-items:center;gap:10px;margin-top:6px;padding:12px 13px;border-radius:14px;background:#11171b;border:1px solid #222b30}
.ldx-pv .pv-cl{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.ldx-pv .pv-capS{color:#8a959c;font-size:9.5px;font-weight:800;letter-spacing:1.2px}
.ldx-pv .pv-bar6{display:block;height:5px;border-radius:3px;background:#252e33;overflow:hidden}
.ldx-pv .pv-bar6 i{display:block;height:5px;background:#EAF1FB}
.ldx-pv .pv-n{color:#eef3f5;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.ldx-pv .pv-n small{color:#7c878e;font-size:13px;font-weight:700}
.ldx-pv .pv-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 8px;margin-top:14px}
.ldx-pv .pv-areacap{grid-column:1/-1;color:#6f8088;font-size:9.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:-4px}
.ldx-pv .pv-pair{display:flex;gap:7px}
.ldx-pv .pv-iico{display:flex;justify-content:center;transform:scale(.8)}
.ldx-pv .pv-pcond,.ldx-pv .pv-pstart{display:flex;align-items:center;justify-content:space-between;gap:6px;border-radius:12px;padding:9px 11px;font:inherit;text-align:left;cursor:pointer}
.ldx-pv .pv-pcond{flex:1;flex-direction:column;align-items:flex-start;border:1px solid #26363b;background:#0d151b;color:#fff}
.ldx-pv .pv-pcond.ok{border-color:rgba(47,197,110,.5)}.ldx-pv .pv-pcond.ready{background:#2fc56e;border-color:#2fc56e}.ldx-pv .pv-pcond.ready small{color:#eafff2}.ldx-pv .pv-pcond.dim{background:#0a0f13;border-color:#1c262c}.ldx-pv .pv-pcond.dim b{color:#6f7d84}.ldx-pv .pv-pcond.fnd{border-color:rgba(232,90,79,.55)}
.ldx-pv .pv-pstart{flex:1.25;border:0;background:#217BE8;color:#fff}.ldx-pv .pv-pstart span{display:flex;flex-direction:column}
.ldx-pv .pv-pcond b,.ldx-pv .pv-pstart b{font-size:12.5px;font-weight:800}.ldx-pv .pv-pcond small{font-size:9.5px;color:#8fa0ad}.ldx-pv .pv-pstart small{font-size:9.5px;color:#d6e7fb}
.ldx-pv .pv-pstart i{font-style:normal;font-size:14px}
.ldx-pv .pv-gridkey{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #26363b;border-radius:8px;color:#c7d0d6}
.ldx-pv .pv-1count{font-size:12px;font-weight:600;color:#eef2f4;margin:2px 0 4px}
.ldx-pv .pv-1bar{height:3px;border-radius:2px;background:#2c2c2e;overflow:hidden;margin-bottom:12px}.ldx-pv .pv-1bar i{display:block;height:3px;background:#30d158}
.ldx-pv .pv-1cap{font-size:10px;letter-spacing:.3px;color:#8e8e93;margin:0 0 5px 10px}
.ldx-pv .pv-1card{background:#1c1c1e;border-radius:9px;overflow:hidden;margin-bottom:14px}
.ldx-pv .pv-1row{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 6px 4px 9px;border-top:1px solid rgba(84,84,88,.45)}.ldx-pv .pv-1row:first-child{border-top:none}
.ldx-pv .pv-1row b{display:block;font-size:12px;font-weight:400;color:#fff}.ldx-pv .pv-1row small{display:block;font-size:10px;color:#8e8e93}
.ldx-pv .pv-1row small.choose{color:#ff9f0a;font-weight:600}.ldx-pv .pv-1row small.fnd{color:#ff6961;font-weight:600}.ldx-pv .pv-1row small.lim{color:#ff9f0a}
.ldx-pv .pv-1dot{width:20px;height:20px;border-radius:50%;border:2px solid #5a5a5f;background:none;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;cursor:pointer}
.ldx-pv .pv-1dot.ok{background:#30d158;border-color:#30d158}.ldx-pv .pv-1dot.fnd{border-color:#ff6961;background:#ff6961}.ldx-pv .pv-1dot.lim{border-color:#ff9f0a}
.ldx-pv .pv-1cam{background:none;border:none;color:#0a84ff;padding:6px;cursor:pointer}
.ldx-pv .pv-1rest{display:block;width:100%;text-align:left;background:none;border:none;border-top:1px solid rgba(84,84,88,.45);color:#0a84ff;font-size:12px;padding:10px 9px 10px 37px;cursor:pointer}
.ldx-pv .pv-crow{display:flex;align-items:center;gap:8px;border:1px solid #1f2d37;border-radius:11px;background:#0d151b;padding:8px 10px;margin-bottom:6px;cursor:pointer}
.ldx-pv .pv-crow b{display:block;font-size:12px;color:#eef2f4}.ldx-pv .pv-crow small{display:block;font-size:10px;color:#8a959c}.ldx-pv .pv-crow small.lim{color:#f5c46a}
.ldx-pv .pv-crow.campick{border-color:#217BE8;box-shadow:inset 0 0 0 1px #217BE8}
.ldx-pv .pv-tlim{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:6px;border:1px solid #5a4520;border-radius:7px;color:#f5c46a;font-size:11px;vertical-align:middle}
.ldx-pv .pv-guided{background:#217BE8;border-color:#217BE8;display:flex;align-items:center;justify-content:center;font-size:22px}
.ldx-pv .pv-itiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0 10px}
.ldx-pv .pv-itile{display:flex;flex-direction:column;justify-content:space-between;min-height:72px;text-align:left;border:1px solid #1d2a31;border-radius:11px;background:#0c1117;padding:8px 8px 7px;color:#e6ecef;font:inherit;cursor:pointer}
.ldx-pv .pv-itile b{font-size:9.5px;line-height:1.25;font-weight:700}.ldx-pv .pv-itile small{font-size:8.5px;font-weight:800;letter-spacing:.7px;color:#5f7378;margin-top:5px}
.ldx-pv .pv-itile.ok{border-color:rgba(47,197,110,.45)}.ldx-pv .pv-itile.ok small{color:#4fd88a}
.ldx-pv .pv-itile.fnd{border-color:rgba(232,90,79,.55)}.ldx-pv .pv-itile.fnd small{color:#f07a6e}
.ldx-pv .pv-itile.lim{border-color:rgba(245,166,35,.55)}.ldx-pv .pv-itile.lim small{color:#f5b94a}
.ldx-pv .pv-itile.start{border-color:#217BE8;background:#217BE8}.ldx-pv .pv-itile.start b,.ldx-pv .pv-itile.start small{color:#fff}
.ldx-pv .pv-itile.dsc{border-color:rgba(106,168,240,.45)}.ldx-pv .pv-itile.dsc small{color:#6aa8f0}
.ldx-pv .pv-leaf.campick{border-color:#217BE8;box-shadow:inset 0 0 0 1px #217BE8}
.ldx-pv .pv-cell{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer}
.ldx-pv .pv-sq{position:relative;width:100%;aspect-ratio:1/1;border-radius:15px;background:#11171b;border:1px solid #2a3439;display:flex;align-items:center;justify-content:center;color:#eef3f5;box-sizing:border-box}
.ldx-pv .pv-sq .pv-prog{position:absolute;left:5px;right:5px;bottom:7px;margin:0}
.ldx-pv .pv-sq > svg,.ldx-pv .pv-sq > .pv-ci{margin-bottom:6px}
.ldx-pv .pv-ci{display:inline-flex;flex:none}.ldx-pv .pv-ci svg{width:100%;height:100%}
.ldx-pv .pv-pin{background:#0f1a24;border-color:#2b4a6a}.ldx-pv .pv-photo{border-color:rgba(33,123,232,0.55);background:rgba(33,123,232,0.12)}.ldx-pv .pv-sp{background:rgba(33,123,232,0.10);border-color:rgba(33,123,232,0.45)}
.ldx-pv .pv-add .pv-sq{border-style:dashed;border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.03);color:#8a959c}
.ldx-pv .pv-cell .pv-tl{font-size:10.5px;line-height:1.25}.ldx-pv .pv-cell .pv-iv2{font-size:9.5px;color:#9cc4f2;margin-top:-3px}
.ldx-pv .pv-review{background:#217BE8;border-color:#217BE8;animation:none}.ldx-pv .pv-review b,.ldx-pv .pv-review small,.ldx-pv .pv-review span{color:#fff}
.ldx-pv .pv-fact{display:flex;flex-direction:column;gap:2px;padding:9px 2px;border-top:1px solid #1b252d}.ldx-pv .pv-fact:first-child{border-top:0}.ldx-pv .pv-fact b{color:#eef3f5;font-size:12.5px}.ldx-pv .pv-fact span{color:#8a99a6;font-size:11px}
.ldx-pv .pv-tile{position:relative;min-height:88px;border-radius:14px;padding:10px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#11171b;border:1px solid #2a3439;color:#eef3f5;min-width:0}
.ldx-pv .pv-tl{color:#e6ebee;font-size:11.5px;font-weight:600;text-align:center;line-height:1.2;overflow-wrap:anywhere}
.ldx-pv .pv-add .pv-tl{color:#8a959c}
/* THE PROGRESS LINE (app 2026-11-11, replaces the three lights): a 3px line filled with the reviewed share, green when done. */
.ldx-pv .pv-prog{display:block;align-self:stretch;margin:0 10px;height:3px;border-radius:2px;background:#2a333a;overflow:hidden}
.ldx-pv .pv-prog i{display:block;height:3px;border-radius:2px;background:#5B9DF0}.ldx-pv .pv-prog i.g{background:#3ecf7e}
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
.ldx-pv .pv-ct{color:#eef3f5;font-size:16px;font-weight:600;letter-spacing:-.2px;display:flex;align-items:center;gap:6px;width:100%;min-width:0}
.ldx-pv .pv-hv{margin-left:auto;color:#8fa0ad;font-size:11.5px;font-weight:400;max-width:55%;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-hv.empty{color:#f0a020}
.ldx-pv .pv-tips{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;margin-left:5px;border-radius:50%;background:#217BE8;color:#fff;font:italic 800 8.5px Georgia,serif;vertical-align:1px}
.ldx-pv .pv-guide{display:block;color:#6d7d87;font-size:10.5px;line-height:1.4;margin-top:2px}
.ldx-pv .pv-linkbtn{margin-top:8px;color:#6aa8f0;font-size:11px;font-weight:800;letter-spacing:.4px}
.ldx-pv .pv-sec{margin-top:12px}
.ldx-pv .pv-sec.div{border-top:1px solid rgba(143,160,173,.28);padding-top:12px}
.ldx-pv .pv-cap{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:#8a959c;font-size:10px;font-weight:800;letter-spacing:1.2px;margin-bottom:7px}
.ldx-pv .pv-cap em{font-style:normal;color:#6f7b82;font-size:10px;font-weight:600;letter-spacing:0}
.ldx-pv .pv-conds{display:flex;gap:6px}
.ldx-pv .pv-icons{justify-content:flex-end;align-items:center;gap:8px}
.ldx-pv .pv-ibtn{width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#8a959c}
.ldx-pv .pv-ibtn.ok{color:#7dd3a0}
.ldx-pv .pv-ibtn.cam{color:#9cc4f2}
.ldx-pv .pv-ibtn.dis{opacity:.35}
.ldx-pv .pv-verdict{font-size:12px;font-weight:800;margin-right:auto}.ldx-pv .pv-verdict.fnd{color:#ffa3a3}.ldx-pv .pv-verdict.lim{color:#f5c46a}
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
.ldx-pv .pv-cap2{color:#46525a;font-size:8.5px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;padding:12px 20px 4px}
.ldx-pv .pv-row{display:block;width:100%;padding:12px 20px;border-bottom:1px solid #0d0d0d;color:#ffe6bf;font-size:13px;font-weight:600}
.ldx-pv .pv-row.f{color:#e8ecef}
.ldx-pv .pv-big{display:block;margin:12px 20px 0;padding:12px;border-radius:12px;text-align:center;background:rgba(33,123,232,.16);border:1px solid rgba(33,123,232,.45);color:#9cc4f2;font-size:10px;font-weight:900;letter-spacing:.8px;width:calc(100% - 40px)}
.ldx-pv .pv-big{text-align:center}
.ldx-pv .pv-foot{color:#5f6d78;font-size:10.5px;line-height:1.5;padding:10px 20px 0;margin:0}
.ldx-pv .pv-toast{position:absolute;left:12px;right:12px;bottom:84px;z-index:6;background:rgba(14,24,34,.96);border:1px solid rgba(47,74,98,.5);border-radius:12px;padding:10px 12px;color:#eef3f5;font-size:11.5px;font-weight:600;text-align:center}
.ldx-pv .pv-big1{flex:1;min-width:0;color:#eef3f5;font-size:22px;font-weight:800;letter-spacing:-.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-gsend{margin-left:auto;padding:2px 7px;border:1px solid #2b4a6b;border-radius:7px;color:#9cc7f2;font-size:9px;font-weight:700;white-space:nowrap}
.pv-gbar{display:flex;align-items:center;gap:7px;width:100%;margin-top:12px;height:32px;padding:0 10px;border-radius:9px;background:#0d1620;border:1px solid rgba(47,140,232,.33);color:#4a5a60;font-size:11px;text-align:left;animation:pv-gpulse 2.8s ease-in-out infinite}
.ldx-pv .pv-gbar b{color:#cfe2f8;font-weight:700;white-space:nowrap}.ldx-pv .pv-gbar small{flex:1;min-width:0;color:#7f9197;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ldx-pv .pv-gplay{color:#2F8CE8;font-size:10px}
@keyframes pv-gpulse{0%,100%{border-color:rgba(47,140,232,.33);box-shadow:0 0 0 0 rgba(47,140,232,0)}50%{border-color:rgba(47,140,232,.9);box-shadow:0 0 0 2px rgba(47,140,232,.14)}}
@media (prefers-reduced-motion: reduce){.ldx-pv .pv-gbar{animation:none}}
.ldx-pv .pv-group{margin-top:14px}
.ldx-pv .pv-known{margin-top:8px;border:1px solid #24313B;border-radius:10px;overflow:hidden;background:#11171b}
.ldx-pv .pv-knownh{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border:0;background:#0e1714;color:#7fe0a8;font-size:9px;font-weight:800;letter-spacing:1.2px;text-align:left}
.ldx-pv .pv-knownh span{flex:1;min-width:0}
.ldx-pv .pv-knownh em{font-style:normal;color:#8fc0f2;letter-spacing:0;font-size:10.5px}
.ldx-pv .pv-known.left{border-color:#4a3a17}
.ldx-pv .pv-known.left .pv-knownh{background:#2a1f0b;color:#f5b03c}
.ldx-pv .pv-knownr b.miss{color:#f5b03c}
.ldx-pv .pv-dicon{display:inline-flex;color:#6aa8f0;cursor:pointer}.ldx-pv .pv-dicon.miss{color:#f0b44a}
.ldx-pv .pv-dline{display:flex;align-items:center;gap:10px;padding:5px 0 3px;font-size:11px;color:#8a959c}
.ldx-pv .pv-dline span{flex:1;min-width:0}
.ldx-pv .pv-dline span.miss{color:#f0a020;font-weight:600}
.ldx-pv .pv-dline b{color:#e6ebee;font-weight:600}
.ldx-pv .pv-dline em,.ldx-pv .pv-dline button{font-style:normal;color:#8fc0f2;font-weight:800;font-size:10.5px;background:none;border:0;padding:0}
.ldx-pv .pv-knownr{display:flex;align-items:center;gap:8px;width:100%;padding:8px 9px;border:0;border-top:1px solid #24313B;background:transparent;color:#8a959c;font-size:11px;text-align:left}
.ldx-pv .pv-knownr b{flex:1;min-width:0;color:#e6ebee;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-knownr em,.ldx-pv .pv-knownr button{font-style:normal;color:#8fc0f2;font-weight:800;font-size:10.5px;background:none;border:0;margin-left:auto}
.ldx-pv .pv-ghead{display:flex;justify-content:space-between;align-items:center;padding:0 3px 5px;border-bottom:1px solid #1b2429;color:#8a959c;font-size:9.5px;font-weight:900;letter-spacing:1.3px}
.ldx-pv .pv-ghead > span{text-transform:uppercase}
.ldx-pv .pv-ghead em{font-style:normal;color:#2F8CE8;font-size:11px;font-weight:700;letter-spacing:0}
.ldx-pv .pv-itiles{margin-top:8px}
.ldx-pv .pv-itile{height:100px;min-height:0;gap:3px;cursor:pointer;font:inherit}
.ldx-pv .pv-phototile{border-color:rgba(33,123,232,0.55);background:rgba(33,123,232,0.12)}
.ldx-pv .pv-phototile .pv-iv2{color:#9cc4f2}
.ldx-pv .pv-shots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.ldx-pv .pv-shot{border:1px dashed rgba(33,123,232,0.45);border-radius:10px;padding:7px;display:flex;flex-direction:column;gap:3px;min-height:72px}
.ldx-pv .pv-shot b{font-size:10.5px;color:#e6ebee}
.ldx-pv .pv-shot span{font-size:9px;color:#8a959c;line-height:1.3}
.ldx-pv .pv-iv2{font-size:10px;font-weight:600;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldx-pv .pv-ix{color:#f0a020;font-size:9px;font-weight:700;min-height:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.ldx-pv .pv-xcap{color:#8cc4ff;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;margin-top:22px}
.ldx-pv .pv-xsys{color:#eef3f5;font-size:28px;font-weight:800;letter-spacing:-.5px;margin-top:3px}
.ldx-pv .pv-xstat{color:#8fa0ad;font-size:11.5px;font-weight:600;margin-top:5px}
.ldx-pv .pv-xcard{display:flex;flex-direction:column;gap:3px;margin-top:18px;padding:12px;border:1px solid #1f2d37;background:#0d151b;border-radius:12px}
.ldx-pv .pv-xcard em{font-style:normal;color:#7c878e;font-size:9px;font-weight:900;letter-spacing:1.3px}
.ldx-pv .pv-xcard span{color:#8cc4ff;font-size:9.5px;font-weight:900;letter-spacing:1.1px}
.ldx-pv .pv-xcard b{color:#eef3f5;font-size:15px;font-weight:700}
.ldx-pv .pv-xleave{color:#7f9197;font-size:11px;line-height:1.5;margin-top:14px}
.ldx-pv .pv-nav{flex:none;display:flex;gap:8px;padding:8px 12px;background:#05070b;border-top:1px solid rgba(38,50,62,.55)}
.ldx-pv .pv-walk{flex:none;background:#05070b;border-top:1px solid rgba(38,50,62,.55)}
.ldx-pv .pv-walk .pv-nav{border-top:0}
.ldx-pv .pv-keys{display:flex;gap:8px;padding:8px 12px 0}
.ldx-pv .pv-klim{width:44px;border-radius:11px;border:1px solid #5a4520;color:#f5c46a;background:transparent;padding:9px 0}
.ldx-pv .pv-kcam{flex:1;border-radius:11px;border:1px solid #26363b;background:#0d151b;color:#eef3f5;font-size:11.5px;font-weight:800;padding:9px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldx-pv .pv-dim{background:#13283f!important;color:#7fa6d2!important}
.ldx-pv .pv-nb,.ldx-pv .pv-nn{display:flex;align-items:center;justify-content:center;gap:4px;border-radius:11px;padding:11px 6px;font-size:11px;font-weight:900;letter-spacing:.6px;white-space:nowrap;overflow:hidden}
.ldx-pv .pv-nb{flex:1;border:1px solid #26363b;background:#0d151b;color:#c7d0d6}
.ldx-pv .pv-nb:disabled{opacity:.35;cursor:default}
.ldx-pv .pv-nn{flex:2;background:#2F8CE8;color:#04101c;text-align:center}
@media (prefers-reduced-motion:reduce){.ldx-pv *{transition:none!important}}
`;
