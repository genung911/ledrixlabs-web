// Report advisories a company picks and tunes (owner 2026-11-06, mockup https://claude.ai/artifact/NH8eoefNScGrsemCdofANd,
// "looks great"): Ledrix's examples (sewer scope, asbestos, lead paint, radon…) to tick, each with a rule (every home,
// built before / between / in or after a year, or a utility) and a mode (Suggest, or Always add on matching jobs), plus
// the company's own. Pure. The advisory shape, the phone's matching and "Always add" live in reportAdvisories.ts — a
// byte copy of the app's (scripts/sync-web-preview.mjs). The template stores the picked list as `advisories`.
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { CREATE_PRESET, LEDRIX_ADVISORIES, type Advisory, type AdvisorySuggestWhen } from './reportAdvisories';

export type RuleKind = 'every' | 'before' | 'between' | 'from' | 'water' | 'sewer' | 'gas' | 'never';
export type Rule = { kind: RuleKind; a?: number; b?: number };

export const RULE_LABEL: Record<RuleKind, string> = {
  every: 'Every home', before: 'Built before', between: 'Built between', from: 'Built in or after',
  water: 'Water source is well', sewer: 'Sewer is septic', gas: 'Gas is propane', never: 'Never suggested',
};
const UTIL: Record<'water' | 'sewer' | 'gas', { key: keyof AdvisorySuggestWhen; values: string[]; why: string }> = {
  water: { key: 'waterSource', values: ['well', 'cistern'], why: '{value} — not municipally treated' },
  sewer: { key: 'sewerType', values: ['septic', 'lagoon'], why: '{value} — buried, cannot be seen' },
  gas: { key: 'gasSupply', values: ['propane'], why: 'propane' },
};

/** The rule as the row says it ("Homes built before 1980") — the editor shows this, and the picker only on "Change"
 *  (owner 2026-11-06, mockup A5vbGSBfvHNfPL4F2Fm5fu: "they don't need to try and figure out a bunch of edge case scenarios"). */
export function ruleSentence(r: Rule): string {
  switch (r.kind) {
    case 'every': return 'Every home';
    case 'before': return `Homes built before ${r.a}`;
    case 'from': return `Homes built in ${r.a} or later`;
    case 'between': return `Homes built ${r.a}–${r.b}`;
    case 'water': return 'When the water source is a well';
    case 'sewer': return 'When the sewer is septic';
    case 'gas': return 'When the gas is propane';
    default: return 'Picked by the inspector';
  }
}

/** The rule an advisory carries, read back for the editor. */
export function ruleOf(a: Advisory): Rule {
  const w = a.suggestWhen;
  if (!w) return { kind: 'never' };
  if (w.always) return { kind: 'every' };
  if (typeof w.yearFrom === 'number' && typeof w.yearThrough === 'number') return { kind: 'between', a: w.yearFrom, b: w.yearThrough };
  if (typeof w.yearFrom === 'number') return { kind: 'from', a: w.yearFrom };
  if (typeof w.yearBefore === 'number') return { kind: 'before', a: w.yearBefore };
  if (w.waterSource?.length) return { kind: 'water' };
  if (w.sewerType?.length) return { kind: 'sewer' };
  if (w.gasSupply?.length) return { kind: 'gas' };
  return { kind: 'never' };
}

const yearOk = (y: unknown): y is number => Number.isInteger(y) && (y as number) >= 1600 && (y as number) <= 2200;

/** The advisory with this rule. Ledrix's own reason line is kept when the rule is Ledrix's; otherwise it says the rule. */
export function withRule(a: Advisory, r: Rule): Advisory {
  const { suggestWhen: _w, suggestWhy: _y, ...rest } = a;
  const ledrix = LEDRIX_ADVISORIES.find(x => x.id === a.id);
  const same = ledrix && JSON.stringify(ruleOf(ledrix)) === JSON.stringify(r);
  const put = (w: AdvisorySuggestWhen | undefined, why: string | undefined): Advisory => ({ ...rest, ...(w ? { suggestWhen: w } : {}), ...(w && why ? { suggestWhy: same ? ledrix!.suggestWhy ?? why : why } : {}) });
  switch (r.kind) {
    case 'never': return put(undefined, undefined);
    case 'every': return put({ always: true }, 'applies to any home');
    case 'before': return yearOk(r.a) ? put({ yearBefore: r.a }, `{year} — built before ${r.a}`) : a;
    case 'from': return yearOk(r.a) ? put({ yearFrom: r.a }, `{year} — built ${r.a} or later`) : a;
    case 'between': return yearOk(r.a) && yearOk(r.b) && r.a <= r.b ? put({ yearFrom: r.a, yearThrough: r.b }, `{year} — built ${r.a}–${r.b}`) : a;
    default: { const u = UTIL[r.kind]; return put({ [u.key]: [...u.values] } as AdvisorySuggestWhen, u.why); }
  }
}

/** The list "Create a template" starts with: Ledrix's preset picks, in Ledrix's order, with their modes. */
export function presetAdvisories(): Advisory[] {
  const mode = new Map(CREATE_PRESET.map(p => [p.id, p.mode]));
  return LEDRIX_ADVISORIES.filter(a => mode.has(a.id)).map(a => ({ ...clone(a), mode: mode.get(a.id)! }));
}

/** Every row the editor shows: Ledrix's examples (picked or not, in Ledrix's order), then the company's own. */
export function editorRows(list: readonly Advisory[]): Array<{ a: Advisory; picked: boolean; ledrix: boolean }> {
  const byId = new Map(list.map(a => [a.id, a]));
  const ledrix = LEDRIX_ADVISORIES.map(a => ({ a: byId.get(a.id) ?? a, picked: byId.has(a.id), ledrix: true }));
  const own = list.filter(a => !LEDRIX_ADVISORIES.some(x => x.id === a.id)).map(a => ({ a, picked: true, ledrix: false }));
  return [...ledrix, ...own];
}

/** Tick or untick one: a ticked Ledrix example joins the list (Suggest), unticked it leaves; the company's own leave too. */
export function pick(list: readonly Advisory[], a: Advisory, on: boolean): Advisory[] {
  const rest = list.filter(x => x.id !== a.id);
  if (!on) return rest;
  const order = (x: Advisory) => { const i = LEDRIX_ADVISORIES.findIndex(y => y.id === x.id); return i < 0 ? 1000 : i; };
  return [...rest, clone({ ...a, mode: a.mode ?? 'suggest' })].sort((x, y) => order(x) - order(y) || list.indexOf(x) - list.indexOf(y));
}
/** One advisory replaced in place (rule, mode, wording). */
export const replace = (list: readonly Advisory[], a: Advisory): Advisory[] => list.map(x => (x.id === a.id ? a : x));

/** A slug id for the company's own advisory, unique in the list and never one of Ledrix's. */
export function slugFor(name: string, list: readonly Advisory[]): string {
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'advisory').slice(0, 40);
  const taken = new Set([...list.map(a => a.id), ...LEDRIX_ADVISORIES.map(a => a.id)]);
  let id = /^[a-z0-9]/.test(base) ? base : `a_${base}`, n = 2;
  while (taken.has(id)) id = `${base}_${n++}`;
  return id;
}
/** The company's own advisory, from the add form. Null when the name or sentence is empty. */
export function newAdvisory(list: readonly Advisory[], name: string, kind: Advisory['kind'], text: string, rule: Rule, mode: 'suggest' | 'always'): Advisory | null {
  if (!name.trim() || !text.trim()) return null;
  return withRule({ id: slugFor(name, list), label: name.trim(), kind, text: text.trim(), mode }, rule);
}

/** "Should Ledrix suggest advisories to your inspector from the home's details?" — Yes removes the field (the default),
 *  No stores false. */
export const suggestOps = (on: boolean): TemplateOp[] => [{ op: 'setTemplateField', field: 'suggestAdvisories', value: on ? null : false }];

/** The Template Builder's one write: the whole list (none → the field removed, so reports use Ledrix's list). */
export const advisoryOps = (list: readonly Advisory[]): TemplateOp[] => [{ op: 'setTemplateField', field: 'advisories', value: list.length ? list.map(clone) : null }];

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T; }
