// ─── reportAdvisories — what is outside this inspection, and what to do about it ─────────
//
// Owner, 2026-08-14: "I don't want to check permits. I want to advise to check as signs
// indicate a remodel or addition."
//
// That distinction is the entire module. An inspector can SEE that part of a house is newer
// than the rest — mismatched siding, framing from a different era, a room the original floor
// plan does not explain. What they cannot know is whether a permit was pulled: that lives in a
// county record, not in the building. So the report states the observation and recommends the
// client verify, and never says "unpermitted".
//
// "BEYOND THE SCOPE" IS THE FRAMING (owner, 2026-08-14). It is the standard SOP phrase and it
// does more work than "Ledrix does not verify permit records": scope is a defined term an
// inspection agreement already establishes, so the sentence explains WHY the inspector is silent
// on it rather than merely stating that they are. The same phrase already appears in
// specVsFindingGuard's limitation vocabulary — one language for one idea.
//
// Same discipline as the write-up rules the owner set on 2026-08-13, and for the same reason:
// a sentence a report cannot defend is worse than no sentence. "That opening CAN ALLOW water"
// rather than "water IS getting in"; "appears to have been remodeled" rather than "was built
// without a permit".
//
// Why it matters to a buyer, which is why it is worth printing at all: permit status affects
// insurability, resale, and who carries the liability later. That is actionable in a way "there
// is a deck" is not.
//
// THE WORDING CAUGHT ITSELF. The first draft said "as unpermitted work can affect insurability"
// — a general caution, not a claim about this house, and still the wrong word to have in a
// paragraph whose whole job is not to make that accusation. "Permit status" says the same thing
// and cannot be misread. The FORBIDDEN list below flagged it before it shipped.
//
// Pure module — no imports — so the wording is one string the app and the PDF both read, and a
// guard can assert what it must never say.

export type RemodelSigns = 'Not observed' | 'Signs observed' | 'Known addition';

/** The advisory for a report, or null when there is nothing to say. `note` is the inspector's
 *  own description of what they saw; it leads, because their words are the evidence. */
export function permitAdvisory(signs?: string | null, note?: string | null): string | null {
  const seen = (note ?? '').trim();
  switch (signs) {
    case 'Signs observed':
      return [
        seen || 'Portions of the home appear to have been remodeled or added to.',
        'Verifying permit records is beyond the scope of this inspection. We recommend confirming the permit history with the local building department, as permit status can affect insurability, resale, and future liability.',
      ].join(' ');
    case 'Known addition':
      return [
        seen || 'The home includes an addition or substantially remodeled area.',
        'Verifying permit records is beyond the scope of this inspection. We recommend obtaining the permit history from the local building department and confirming the work was finalized.',
      ].join(' ');
    // 'Not observed' prints nothing on purpose. A report that says "no signs of remodeling were
    // observed" invites being read as "there was none" — a stronger claim than looking at a
    // house from the outside can support.
    default:
      return null;
  }
}

/** Words this advisory must never contain — it recommends a check, it does not make a ruling.
 *  Exported for scripts/verify-advisory.mjs. */
export const FORBIDDEN = ['unpermitted', 'without a permit', 'illegal', 'code violation', 'not permitted'];


// ─── ADVISORY CATALOG — the inspector selects; Ledrix only suggests ──────────────────────
//
// Owner, 2026-08-14, correcting a design I had already half-built: "these should all be
// limitations or recommendations that can be SELECTED by the inspector. A newer build may not
// need them, but a 1960 in the country may need a limitation about underground fuel tank."
//
// He is right, and it is his own earlier ruling: on 2026-07-18 auto-boilerplate was removed
// because "the auto list buried the inspector's real disclosures under nine identical rows on
// every report." Printing four fixed advisories on every job is a smaller version of exactly
// that. A radon recommendation on a two-year-old condo is noise; an underground fuel tank
// limitation on a 1960 rural property is the most useful sentence in the report. The set that
// applies is a property of the HOUSE, not of the software.
//
// So this is a CATALOG. The inspector picks. Ledrix marks the ones that fit — from the year
// built and what the intake already knows — and a suggestion is never a selection, which is the
// same HITL shape as every other proposal in the app.
//
// The certification page's Scope & Limitations paragraph is unaffected and still covers the
// general legal posture. These are the ACTIONABLE ones, chosen per job.

export type AdvisorySuggestWhen = {
  /** Suggest when the home predates this year. */
  yearBefore?: number;
  /** Built IN or AFTER this year (owner 2026-11-06, mockup NH8eoefNScGrsemCdofANd: "They need to be able to set ranges").
   *  With `yearThrough`, a range ("built between 1965 and 1973", both included). */
  yearFrom?: number;
  /** Built IN or BEFORE this year — the upper end of a range. */
  yearThrough?: number;
  /** Suggest when the recorded utility CONTAINS any of these (case-insensitive). */
  waterSource?: string[];
  sewerType?:   string[];
  gasSupply?:   string[];
  /** Suggest on every job — for the ones that are about geology or law, not this building. */
  always?: boolean;
};

export type Advisory = {
  id: string;
  label: string;
  kind: 'recommendation' | 'limitation';
  /** The paragraph. `{year}` is replaced with the home's year built when known; a sentence using
   *  it should read acceptably without it, because an intake with no year is normal. */
  text: string;
  /** Optional alternative used when `suggestWhen` matches — how an OLDER home gets stronger
   *  wording than a newer one without needing two entries. */
  textWhenMatched?: string;
  /** Why Ledrix would suggest it. Absent = selectable but never suggested. */
  suggestWhen?: AdvisorySuggestWhen;
  /** Short reason shown on the row. `{year}` and `{value}` (the matching utility) substitute. */
  suggestWhy?: string;
  /** 'always' (owner 2026-11-06): a job that matches STARTS with it picked — "every report includes a sewer-scope
   *  recommendation for homes built before 1980" — and the inspector can still take it off that job. Absent or
   *  'suggest' = today's behaviour: marked Suggested, never picked by Ledrix. */
  mode?: 'suggest' | 'always';
};

export type AdvisoryContext = {
  yearBuilt?:   number | null;
  /** What the home is supplied BY — recorded on the details screen, not inferred. "Rural" is a
   *  guess; "well and septic" is a fact the inspector reads off the property, and it decides
   *  which advisories actually apply. */
  waterSource?: string | null;
  sewerType?:   string | null;
  gasSupply?:   string | null;
};

const hits = (v: string | null | undefined, needles?: string[]): string | null => {
  if (!needles?.length || !v) return null;
  const low = v.toLowerCase();
  return needles.some(n => low.includes(n.toLowerCase())) ? v : null;
};

/** Does this advisory apply to this house, and why. Null = selectable but not suggested. */
export function matchAdvisory(a: Advisory, ctx: AdvisoryContext): string | null {
  const w = a.suggestWhen;
  if (!w) return null;
  let value: string | null = null;
  let matched = false;
  if (w.always) matched = true;
  // Every year bound that is set must hold (a range is two bounds). No year on the job = no year match, ever.
  const bounds = [w.yearBefore, w.yearFrom, w.yearThrough].some(b => typeof b === 'number');
  if (bounds && ctx.yearBuilt
    && (w.yearBefore == null || ctx.yearBuilt < w.yearBefore)
    && (w.yearFrom == null || ctx.yearBuilt >= w.yearFrom)
    && (w.yearThrough == null || ctx.yearBuilt <= w.yearThrough)) { matched = true; value = String(ctx.yearBuilt); }
  for (const [k, v] of [['waterSource', ctx.waterSource], ['sewerType', ctx.sewerType], ['gasSupply', ctx.gasSupply]] as const) {
    const hit = hits(v, (w as any)[k]);
    if (hit) { matched = true; value = hit; }
  }
  if (!matched) return null;
  return fill(a.suggestWhy ?? 'applies to this home', ctx, value);
}

const fill = (t: string, ctx: AdvisoryContext, value?: string | null): string =>
  t.replace(/\{year\}/g, ctx.yearBuilt ? String(ctx.yearBuilt) : '')
   .replace(/\{value\}/g, value ?? '')
   .replace(/\s{2,}/g, ' ')
   .replace(/\s+\)/g, ')')
   .replace(/\(\s*\)/g, '')
   .trim();

/** THE LEDRIX BASELINE. A starting point a company is expected to REPLACE — the same posture as
 *  the shipped template (DECISIONS 2026-08-12: Ledrix ships the structure, the company owns the
 *  content). The SUGGESTION VOCABULARY is the structure and stays Ledrix's; the sentences are
 *  content and are the company's the moment they edit them. */
export const LEDRIX_ADVISORIES: Advisory[] = [
  { id: 'radon', label: 'Radon testing', kind: 'recommendation',
    text: 'Radon testing is beyond the scope of this inspection. Radon is a naturally occurring gas that cannot be seen or smelled and is identified only by testing. We recommend testing regardless of the findings in this report.',
    suggestWhen: { always: true }, suggestWhy: 'applies to any home' },

  { id: 'sewer', label: 'Sewer scope', kind: 'recommendation',
    text: 'Underground sewer lines are beyond the scope of this inspection and cannot be evaluated from the fixtures. We recommend a camera scope of the sewer lateral, which is the only way to assess its condition.',
    textWhenMatched: 'Underground sewer lines are beyond the scope of this inspection. Given the age of the home ({year}), the lateral may be clay or cast iron and subject to root intrusion, offsets, or bellies that are not visible from inside. We recommend a camera scope of the sewer lateral before closing.',
    suggestWhen: { yearBefore: 1980 }, suggestWhy: '{year} — clay or cast-iron era' },

  { id: 'fuel_tank', label: 'Underground fuel tank', kind: 'limitation',
    text: 'Underground storage tanks are beyond the scope of this inspection. Homes of this era outside municipal gas service were often heated by fuel oil, and abandoned tanks may remain buried and undocumented. We recommend a tank sweep, and a review of any available records, before closing.',
    suggestWhen: { yearBefore: 1980 }, suggestWhy: '{year} — fuel-oil era' },

  { id: 'well_water', label: 'Well water testing', kind: 'recommendation',
    text: 'Water quality and quantity testing is beyond the scope of this inspection. Private wells are not subject to municipal treatment or monitoring, and potability can only be established by laboratory testing. We recommend testing for bacteria, nitrates, and any contaminants common to the area, along with a flow-rate test.',
    suggestWhen: { waterSource: ['well', 'cistern'] }, suggestWhy: '{value} — not municipally treated' },

  { id: 'septic', label: 'Septic inspection', kind: 'recommendation',
    text: 'The septic system is beyond the scope of this inspection. Tanks, distribution boxes, and drain fields are buried and cannot be evaluated visually, and a system can appear to function normally while the field is failing. We recommend a septic inspection and pumping by a qualified contractor, along with any available service records.',
    suggestWhen: { sewerType: ['septic', 'lagoon'] }, suggestWhy: '{value} — buried, cannot be seen' },

  { id: 'propane', label: 'Propane tank & supply', kind: 'limitation',
    text: 'Propane tanks, buried supply lines, and the regulator are the property of the supplier in most arrangements and are beyond the scope of this inspection. We recommend confirming ownership and lease terms of the tank, and asking the supplier for the most recent leak and pressure test.',
    suggestWhen: { gasSupply: ['propane'] }, suggestWhy: 'propane — tank often supplier-owned' },

  // ── ERA-TYPICAL STANDING DISCLOSURES ────────────────────────────────────────────────
  // Added 2026-08-15 after reading a competitor report that prints five numbered disclosures on
  // every job — asbestos, lead, original drain piping, settlement, alterations. The SUBJECTS are
  // the right ones; the delivery is not. Theirs prints all five on a 2015 build, which is how a
  // disclosure becomes wallpaper the reader learns to skip.
  //
  // So they are written fresh, in Ledrix's voice, and every one is gated on the actual year of
  // the house — a 2015 build is offered none of them. That is the owner's own ruling from
  // earlier today ("a newer build may not need them, but a 1960 in the country may need a
  // limitation about underground fuel tank"), applied to the same subject matter.
  //
  // Dates are the material-history ones, not round numbers: 1978 is the federal ban on
  // lead-based paint in housing; asbestos use in residential materials tapers through the
  // 1980s; Orangeburg and galvanized supply belong to pre-1980 construction.
  { id: 'asbestos', label: 'Asbestos-containing materials', kind: 'limitation',
    text: 'Identifying asbestos is beyond the scope of this inspection, which is visual and takes no samples. Homes of this era commonly used it in floor tile and its adhesive, pipe and duct wrap, textured ceilings, and some siding and roofing products. Undisturbed and intact, these materials are generally not considered a hazard; the risk comes from cutting, sanding, or demolition. Before any renovation that would disturb suspect materials, have them sampled by an accredited laboratory.',
    suggestWhen: { yearBefore: 1990 }, suggestWhy: '{year} — asbestos-era materials' },

  { id: 'lead_paint', label: 'Lead-based paint', kind: 'limitation',
    text: 'This inspection does not test for lead. Lead-based paint was not banned for residential use until 1978, so a home of this age may contain it under later coats. Intact paint is generally stable; deteriorating paint, friction surfaces such as windows and doors, and dust generated by renovation are the recognized exposure paths, and the risk is greatest to young children and during pregnancy. Federal law entitles a buyer to the seller\u2019s known records and a disclosure — request them, and have suspect surfaces tested before disturbing them.',
    suggestWhen: { yearBefore: 1978 }, suggestWhy: '{year} — predates the 1978 ban' },

  { id: 'original_drain_piping', label: 'Original drain & supply piping', kind: 'limitation',
    text: 'Only a limited portion of the piping in this home is visible; the rest is inside walls and below grade. Homes of this age were commonly plumbed with cast iron waste lines, galvanized steel supply, and in some regions Orangeburg sewer laterals — all of which corrode, scale, or deform from the inside, where their remaining life cannot be judged by looking at an exposed length or by running the fixtures. A camera scope of the drains, and a look at any repiping records, is the only way to establish their condition.',
    suggestWhen: { yearBefore: 1980 }, suggestWhy: '{year} — cast iron, galvanized, Orangeburg era' },

  { id: 'settlement', label: 'Foundation settlement', kind: 'limitation',
    text: 'Every structure settles, and a house of this age has been moving for decades. Hairline cracks in concrete, masonry and drywall, doors that no longer sit square, and floors that are out of level are ordinary consequences of that and are reported here as observations, not as structural failure. Distinguishing normal settlement from active movement requires measurement over time, which a single visit cannot provide. Where this report notes movement worth watching, it says so, and anything beyond monitoring warrants further evaluation by a qualified professional to assess the condition and determine any necessary corrective action.',
    suggestWhen: { yearBefore: 2000 }, suggestWhy: '{year} — decades of settlement' },

  { id: 'undocumented_work', label: 'Previous alterations', kind: 'limitation',
    text: 'A home of this age has almost certainly been altered, and this inspection can only evaluate what is visible on the day of the visit. Alterations that left no record behind often look finished while concealing the part that matters — framing that was cut, a circuit that was extended, a drain that was never vented. Where this report notes evidence of remodeling or an addition, we recommend requesting the permit history from the local authority and any invoices the seller holds, so that what is behind the finishes is a matter of record rather than assumption.',
    suggestWhen: { yearBefore: 2005 }, suggestWhy: '{year} — likely altered since built' },

  { id: 'mold', label: 'Mold & air quality', kind: 'limitation',
    text: 'Testing for mold, allergens, and air quality is beyond the scope of this inspection. Conditions that can support microbial growth — moisture, poor ventilation, or previous water entry — may exist in concealed areas. If confirmation is wanted, a qualified environmental testing firm should be engaged.' },

  { id: 'concealed', label: 'Concealed defects', kind: 'limitation',
    text: 'This inspection is visual and non-invasive. Defects concealed behind finishes, below grade, beneath floor coverings, or within walls and ceilings cannot be identified, and no representation is made about the condition of what was not visible on the day of the inspection.' },
];

/** The catalog in force: a company's own list when it has authored one, else the Ledrix
 *  baseline. Same fallback shape as every other piece of template content. */
export function advisoryCatalog(companyList?: Advisory[] | null): Advisory[] {
  return companyList?.length ? companyList : LEDRIX_ADVISORIES;
}

/** Selected ids → printable text. Unknown ids are dropped rather than guessed — a retired
 *  advisory should vanish, not print half a sentence. */
export function selectedAdvisories(
  ids: string[] | undefined, ctx: AdvisoryContext, companyList?: Advisory[] | null,
): Array<{ label: string; text: string }> {
  const want = new Set(effectiveAdvisoryIds(ids, ctx, companyList));
  return advisoryCatalog(companyList).filter(a => want.has(a.id)).map(a => {
    const why = matchAdvisory(a, ctx);
    const body = why && a.textWhenMatched ? a.textWhenMatched : a.text;
    return { label: a.label.toUpperCase(), text: fill(body, ctx) };
  });
}

// ── "ALWAYS ADD" (owner 2026-11-06, mockup NH8eoefNScGrsemCdofANd) ───────────────────────────────────────────
// The job's stored list (InspectionExtras.advisories — one synced column) holds the inspector's picks AND, as "-<id>",
// the company advisories they took OFF this job. What the report carries is DERIVED, never copied: the picks, plus every
// 'always' advisory this home matches, minus the ones taken off. So a year entered later adds it, a year corrected
// removes it, and an untick sticks. Ids never start with "-" (validated), and an unknown id prints nothing.
export const OFF_PREFIX = '-';
/** The advisory ids this job carries, in catalog order. */
export function effectiveAdvisoryIds(stored: string[] | undefined, ctx: AdvisoryContext, companyList?: Advisory[] | null): string[] {
  const xs = stored ?? [];
  const off = new Set(xs.filter(x => x.startsWith(OFF_PREFIX)).map(x => x.slice(OFF_PREFIX.length)));
  const picked = new Set(xs.filter(x => !x.startsWith(OFF_PREFIX)));
  return advisoryCatalog(companyList)
    .filter(a => !off.has(a.id) && (picked.has(a.id) || (a.mode === 'always' && !!matchAdvisory(a, ctx))))
    .map(a => a.id);
}
/** Is this advisory on this job only because the company always adds it here? */
export function addedByCompany(a: Advisory, stored: string[] | undefined, ctx: AdvisoryContext): boolean {
  return a.mode === 'always' && !!matchAdvisory(a, ctx) && !(stored ?? []).includes(OFF_PREFIX + a.id);
}
/** The stored list after the inspector ticks (on) or unticks (off) one advisory. Taking off an advisory the company
 *  adds leaves "-<id>"; putting it back removes that mark. Pure. */
export function toggleAdvisory(stored: string[] | undefined, a: Advisory, on: boolean, ctx: AdvisoryContext): string[] {
  const xs = (stored ?? []).filter(x => x !== a.id && x !== OFF_PREFIX + a.id);
  const auto = a.mode === 'always' && !!matchAdvisory(a, ctx);
  if (on) return auto ? xs : [...xs, a.id];
  return auto ? [...xs, OFF_PREFIX + a.id] : xs;
}

/** What "Create a template" ticks to begin with (the mockup's starting picks — the company's to change): sewer scope
 *  and radon added on every matching job, the rest suggested. Ids and modes only; the wording is Ledrix's below. */
export const CREATE_PRESET: ReadonlyArray<{ id: string; mode: 'suggest' | 'always' }> = [
  { id: 'sewer', mode: 'always' }, { id: 'asbestos', mode: 'suggest' }, { id: 'lead_paint', mode: 'suggest' },
  { id: 'radon', mode: 'always' }, { id: 'well_water', mode: 'suggest' }, { id: 'septic', mode: 'suggest' },
];

/** Which ones Ledrix would suggest for this house, and why. A suggestion is never a selection. */
export function suggestedAdvisories(ctx: AdvisoryContext, companyList?: Advisory[] | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of advisoryCatalog(companyList)) { const why = matchAdvisory(a, ctx); if (why) out[a.id] = why; }
  return out;
}

// SAYING "MOLD" HERE IS CORRECT, and it is the one place the never-say-mold rule
// (prohibitedTerms.ts) does not apply. That rule exists because IDENTIFYING mold is a laboratory
// determination an inspector cannot make. This paragraph makes no identification — it says
// testing was not done. And a client searching their report for "mold" must land on the sentence
// that tells them so; hiding it behind "microbial growth" reads as evasive in the one place plain
// language protects the inspector. Findings stay absolute: Ledrix never EMITS mold as an
// observation.
