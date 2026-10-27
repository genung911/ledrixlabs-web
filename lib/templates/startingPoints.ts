// Template creation — the company's answers and the starting points they can lead to (2026-10-27).
//
// Templates › New template is a guided page (app/app/templates/create): the company confirms what it is (where it
// works, what it inspects, which associations it belongs to, which standards it follows, how licensing applies),
// then picks where a new template starts — one of its own templates, a Ledrix template, or blank — then names a
// private draft and lands in the Template Builder. PURE: no store, no network, no clock.
//
// HONESTY RULES (owner, 2026-10-27; DECISIONS 2026-08-12 and 2026-10-26 (second) #4):
//   · a recommendation states only facts Ledrix has: which inspection type the company already uses a template for,
//     and which service a Ledrix template is built for. It never ranks by standards, licensing or jurisdiction;
//   · REQUIREMENTS COVERAGE is reported as NOT EVALUATED, always, until a managed requirement catalog exists
//     (the CoverageState vocabulary below is the contract that catalog will fill). No score, no "covered", no
//     "compliant" — a template does not satisfy a standard because it is recommended;
//   · association MEMBERSHIP and standards FOLLOWED are separate answers; both are the company's own declaration;
//   · no individual credential is asked for here — an inspector's license stays on that inspector's profile.
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { CompanyContext, InspectionType, LiveTemplate } from './api';
import { isCovered } from './editorModel';

export type Option = { id: string; label: string };

export const SERVICES: Option[] = [
  { id: 'home', label: 'General home inspection' }, { id: 'four_point', label: '4-Point (insurance)' },
  { id: 'new_construction', label: 'New construction' }, { id: 'commercial', label: 'Commercial' }, { id: 'other', label: 'Other' },
];
/** Associations the company BELONGS to. Membership says nothing about which standards it follows. */
export const AFFILIATIONS: Option[] = [
  { id: 'internachi', label: 'InterNACHI member' }, { id: 'ashi', label: 'ASHI member' },
  { id: 'state_association', label: 'A state association' }, { id: 'other', label: 'Other' }, { id: 'none', label: 'None' },
];
/** Standards the company says it FOLLOWS. Ledrix does not supply or check any of them. */
export const STANDARDS: Option[] = [
  { id: 'internachi_sop', label: 'InterNACHI Standards of Practice' }, { id: 'ashi_sop', label: 'ASHI Standard of Practice' },
  { id: 'state_sop', label: 'Our state’s standards of practice' }, { id: 'company', label: 'Our own written standards' }, { id: 'other', label: 'Other' },
];
export const LICENSING: Array<{ id: CompanyContext['licensing'] & string; label: string }> = [
  { id: 'licensed', label: 'Our inspectors hold the license our jurisdiction requires' },
  { id: 'varies', label: 'Our inspectors have different license requirements' },
  { id: 'not_required', label: 'No general home-inspector license applies where we work' },
  { id: 'undetermined', label: 'We’re still determining this' },
];
export const US_STATES: Option[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'],
  ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'],
  ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([id, label]) => ({ id, label }));
export const labelOf = (list: Option[], id: string) => list.find(o => o.id === id)?.label ?? id;

/** Requirements coverage, per requirement and template revision — the vocabulary a future managed requirement catalog
 *  fills (authoritative source → requirement version → applicability → mapping to a template element → assessment
 *  against a template revision). Today nothing is evaluated, so every starting point reports 'not_evaluated'. */
export type CoverageState = 'not_evaluated' | 'not_mapped' | 'needs_review' | 'partially_covered' | 'covered' | 'not_applicable';

export type StartKind = 'company' | 'ledrix_default' | 'ledrix_fourpoint' | 'blank';
export type StartingPoint = {
  key: string;                       // 'company:<id>' | 'ledrix_default' | 'ledrix_fourpoint' | 'blank'
  kind: StartKind;
  title: string;
  subtitle: string;
  /** The tree the draft starts from (a copy is made at creation), or null when it cannot be offered. */
  tree: InspectionTemplate | null;
  base: string;                      // what the draft records as its lineage (the app's base ids)
  sourceId: string | null;           // the company template copied, if any
  systems: string[];                 // what a new inspection covers by default — real, from the tree
  componentCount: number;
  /** Why it suits THIS company — facts only. Empty = no recommendation can be made from what Ledrix knows. */
  reasons: string[];
  recommended: boolean;
  coverage: { state: CoverageState; text: string };
  review: string[];                  // what the company should check itself
};

const countComponents = (t: InspectionTemplate): number => {
  let n = 0; const walk = (x: { kind?: string; children?: unknown[] }) => { if (x.kind === 'component') n++; (x.children as typeof x[] | undefined)?.forEach(walk); };
  t.systems.forEach(s => walk(s as never)); return n;
};
const coveredSystems = (t: InspectionTemplate) => t.systems.filter(s => isCovered(t, s)).map(s => s.label);

/** A Ledrix template as a company's own new copy: its own name and the app's 'custom' id, exactly as the app forks one
 *  (ledrix-app templateLibraryService.createTemplate). The source object is never changed. */
export function forkTree(tree: InspectionTemplate, name: string): InspectionTemplate {
  return { ...JSON.parse(JSON.stringify(tree)), id: 'custom', name };
}

/** What the company has to check itself, given what it declared. Ledrix verifies none of it today. */
export function reviewItems(c: CompanyContext): string[] {
  const out: string[] = [];
  const standards = c.standards.filter(s => s !== 'other').map(s => labelOf(STANDARDS, s));
  if (standards.length) out.push(`Ledrix hasn’t mapped ${standards.join(' or ')} to template items — check the template against them yourself.`);
  if (c.jurisdictions.length) out.push(`Requirements for ${c.jurisdictions.join(', ')} haven’t been evaluated by Ledrix.`);
  if (c.notes.trim()) out.push('Your written company requirements aren’t checked against templates automatically.');
  if (c.licensing === 'varies') out.push('Your inspectors have different license requirements — a template can’t tell whose license applies.');
  return out;
}

/** Every starting point available to this company, with facts-only reasons. Ledrix templates appear only when their
 *  trees are available; the import card is not a starting point (no self-service import exists). */
export function startingPoints(args: {
  context: CompanyContext; templates: LiveTemplate[]; types: InspectionType[];
  ledrixDefault: InspectionTemplate | null; ledrixFourPoint: InspectionTemplate | null;
}): StartingPoint[] {
  const { context: c, templates, types } = args;
  const svc = new Set(c.services);
  const review = reviewItems(c);
  const coverage = { state: 'not_evaluated' as const, text: 'Not evaluated — Ledrix has no verified requirement data to check this template against yet.' };
  const usedFor = (id: string) => types.filter(t => t.templateId === id).map(t => t.name);
  const typeForService = (s: string) => (s === 'four_point' ? /4[- ]?point/i : s === 'home' ? /full home|home inspection/i : null);
  const out: StartingPoint[] = [];

  for (const t of templates) {
    if (!t.tree) continue;
    const uses = usedFor(t.id);
    const reasons: string[] = [];
    if (uses.length) reasons.push(`Your company already uses it for ${uses.join(', ')}.`);
    for (const s of svc) { const re = typeForService(s); if (re && uses.some(u => re.test(u))) reasons.push(`Matches the ${labelOf(SERVICES, s)} service you selected.`); }
    out.push({ key: `company:${t.id}`, kind: 'company', title: t.name, subtitle: 'A copy of one of your templates — the original is not changed.',
      tree: t.tree, base: t.base ?? 'custom', sourceId: t.id, systems: coveredSystems(t.tree), componentCount: countComponents(t.tree),
      reasons: [...new Set(reasons)], recommended: false, coverage, review });
  }
  if (args.ledrixDefault) out.push({ key: 'ledrix_default', kind: 'ledrix_default', title: 'Ledrix Default',
    subtitle: 'Ledrix’s residential starting point — a starting point, not a certified standard.', tree: args.ledrixDefault, base: 'internachi', sourceId: null,
    systems: coveredSystems(args.ledrixDefault), componentCount: countComponents(args.ledrixDefault),
    reasons: svc.has('home') ? ['Built for general home inspections, a service you selected.'] : [], recommended: false, coverage, review });
  if (args.ledrixFourPoint) out.push({ key: 'ledrix_fourpoint', kind: 'ledrix_fourpoint', title: 'Ledrix 4-Point',
    subtitle: 'The systems a 4-Point insurance inspection covers, on by default; every other system stays available.', tree: args.ledrixFourPoint, base: 'fourpoint', sourceId: null,
    systems: coveredSystems(args.ledrixFourPoint), componentCount: countComponents(args.ledrixFourPoint),
    reasons: svc.has('four_point') ? ['Built for 4-Point inspections, a service you selected.'] : [], recommended: false, coverage, review });
  out.push({ key: 'blank', kind: 'blank', title: 'Blank template', subtitle: 'No systems yet — build your own from scratch.',
    tree: { id: 'custom', name: '', version: 1, systems: [] }, base: 'blank', sourceId: null, systems: [], componentCount: 0, reasons: [], recommended: false,
    coverage: { state: 'not_evaluated', text: 'Not evaluated — a blank template has nothing to check yet.' }, review });

  // ONE recommendation at most: a company template already used for a selected service beats a Ledrix template for it.
  const pick = out.find(p => p.kind === 'company' && p.reasons.some(r => r.startsWith('Matches the')))
    ?? out.find(p => (p.kind === 'ledrix_default' || p.kind === 'ledrix_fourpoint') && p.reasons.length);
  if (pick) pick.recommended = true;
  return out;
}
