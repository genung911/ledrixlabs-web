// ─── homeownerRecommendation — what a homeowner is told to do about a finding ──────────
//
// (owner decision 2026-10-13: "Ledrix should accurately describe the observed condition and
//  recommend further evaluation by a qualified professional when appropriate. A specific specialist
//  should be named only when the inspector's documented assessment or an explicitly approved rule
//  supports that recommendation.")
//
// WHY THIS EXISTS AT DISPLAY TIME. Until 2026-10-13 every analysis prompt asked the model "which
// professional should perform it", and a document fallback filled in "General Contractor" whenever
// it did not answer. So a stored `prosToCall` is, for every historical finding, the model's guess
// from the system the finding sits in — a cracked truss is framing, so it became "Structural
// Engineer". Nothing recorded says whether the inspector chose that, so it cannot be shown to a
// homeowner as a recommendation. The stored value is NOT rewritten: the inspector still sees and can
// correct it in the app. This only decides what a homeowner reads on the share page and in reports.
//
// TWIN of ledrix-app src/core/services/homeownerRecommendation.ts (the app's homeowner finding
// panel). The two repos share no code, so each keeps a copy and its own guard
// (scripts/verify-recommendation-language.mjs here). Change both together.
//
// NO IMPORTS, so the guard can load it directly.

export const FURTHER_EVALUATION_HEADING = 'Further Evaluation Recommended';
export const FURTHER_EVALUATION_TEXT =
  'Further evaluation by a qualified professional is recommended to assess the observed condition and determine any necessary corrective action.';

type FindingLike = {
  severity?: string | null;
  prosToCall?: string | null;
  unit?: string | null;
  issue?: string | null;
  description?: string | null;
  /** Legacy free-text recommendation (older AI write-ups, project copies). */
  recommendation?: string | null;
  /** The canonical finding card's bullets, when the record carries them. */
  observationBullets?: string[] | null;
};

/** Repair-tier severities. `anomaly` is the pre-build-89 alias of `deficiency`, still present in
 *  older published records. Maintenance and informational items never get the heading: telling a
 *  homeowner a filter change needs "further evaluation by a qualified professional" overstates it. */
const REPAIR_TIER = new Set(['critical', 'deficiency', 'anomaly']);

const isRealPro = (p?: string | null) => {
  const t = (p ?? '').trim();
  return !!t && !/^(n\/?a|none|null|-+|—)$/i.test(t);
};

/**
 * The recommendation block a homeowner sees in place of a stored professional, or null for none.
 * Shown only where the original write-up recommended SOMEONE (a stored prosToCall) on a repair-tier
 * finding — the neutral wording replaces a guessed specialist; it never adds a recommendation the
 * finding did not make.
 */
export function furtherEvaluation(a: FindingLike): { heading: string; text: string } | null {
  if (!isRealPro(a.prosToCall)) return null;
  if (!REPAIR_TIER.has(String(a.severity ?? '').toLowerCase())) return null;
  return { heading: FURTHER_EVALUATION_HEADING, text: FURTHER_EVALUATION_TEXT };
}

/** Where any choice of trade would itself be a diagnosis. A search for "roofing contractor" on a
 *  cracked truss tells the homeowner what is wrong; so for these, no search is offered at all. */
const STRUCTURAL = /\b(struct\w*|truss(es)?|rafters?|joists?|beams?|framing|framed|load.?bearing|headers?|sill plates?|foundations?|footings?|piers?|settle(d|ment)?|bowing|sagging|deflect\w*|girders?|posts?|columns?)\b/i;

/** The THING a finding is about, when the finding names one plainly. The search is "<thing>
 *  repair" — it names the object, never a profession, so it recommends no one. Order matters: the
 *  more specific phrase first ("water heater" before "heater"). */
const SUBJECTS: Array<[RegExp, string]> = [
  [/water heater|hot water (tank|heater)/i,   'water heater'],
  [/heat pump/i,                              'heat pump'],
  [/furnace/i,                                'furnace'],
  [/boiler/i,                                 'boiler'],
  [/air condition|a\/c unit|\bac unit|condenser/i, 'air conditioner'],
  [/garage door|overhead door|door opener/i,  'garage door'],
  [/dishwasher/i,                             'dishwasher'],
  [/garbage disposal|disposal/i,              'garbage disposal'],
  [/sump pump/i,                              'sump pump'],
  [/gutter|downspout/i,                       'gutter'],
  [/toilet/i,                                 'toilet'],
  [/faucet/i,                                 'faucet'],
  [/(electrical|breaker|service) panel|panelboard/i, 'electrical panel'],
  [/\boutlet|receptacle/i,                    'electrical outlet'],
  [/window/i,                                 'window'],
  [/siding/i,                                 'siding'],
  [/shingle/i,                                'roof shingle'],
];

/**
 * A neutral local-pros search term derived from the finding, or null when one cannot be chosen
 * without guessing a trade. Never derived from prosToCall (historical values are guesses) and never
 * from the system alone (that is the guess this replaces).
 */
export function neutralProSearch(a: FindingLike): string | null {
  const hay = `${a.issue ?? ''} ${a.unit ?? ''} ${a.description ?? ''}`;
  if (!hay.trim() || STRUCTURAL.test(hay)) return null;
  const text = `${a.issue ?? ''} ${a.description ?? ''}`;
  for (const [re, subject] of SUBJECTS) if (re.test(text)) return `${subject} repair`;
  return null;
}

// ─── forHomeowner — the finding's TEXT as a homeowner reads it ─────────────────────────
//
// prosToCall was only half of it. The old prompts also wrote the recommendation INTO the finding:
// bullet 3 was "the recommended action and which professional should perform it", so a stored
// description reads "…No signs of water intrusion were noted around the truss. A structural
// engineer should evaluate the truss." — and an older free-text `recommendation` field carries the
// same thing. Both are shown to homeowners; neither says whether the inspector chose that person.
//
// SENTENCE BY SENTENCE, AND ONLY WHAT CAN BE CLASSIFIED. A sentence is corrected only when it is
// unmistakably a recommendation naming a specialist — it OPENS as one ("A structural engineer
// should…", "Have a roofer…", "Evaluation by a licensed plumber is recommended", "Recommend…").
// Every other sentence that merely mentions a specialist ("Previously repaired by a licensed
// electrician per the seller", "…; recommend a roofer") is left exactly as recorded and listed in
// `needsReview`, because rewriting a sentence that may be an observation would change the record.
// The stored record is never touched: this returns a view.
//
//   repair-tier finding  → the classified sentence is dropped and FURTHER_EVALUATION_* shown once;
//   any other tier       → the specialist in that sentence becomes "a qualified professional"
//                          (a gutter cleaning does not need "further evaluation").
//
// APPROVED RULES are exempt (owner, 2026-10-13): a documented recalled panel keeps its licensed
// electrician (RecallService), a documented gas leak/odour keeps its gas trade (repairTriage). Only
// when the finding's own text documents the condition; nothing is inferred.

/** A specialist or trade, with an optional article and qualifier. Generic wording — "a qualified
 *  professional", "a licensed contractor" — is not a specialist and never matches. */
const SPECIALIST_NOUN =
  '(?:structural engineer|(?:professional |licensed |structural )?engineer|electrician|electrical contractor|' +
  'plumber|plumbing contractor|roofer|roofing (?:contractor|specialist|company|professional)|' +
  'hvac (?:contractor|technician|tech|specialist|professional|company|service company)|heating (?:contractor|technician)|' +
  'general contractor|handyman|waterproofing (?:contractor|specialist|company)|' +
  'foundation (?:contractor|specialist|repair specialist|repair company|repair contractor)|siding contractor|' +
  'masonry contractor|mason|chimney (?:sweep|specialist|professional|contractor)|pest control (?:professional|company|operator)|' +
  'exterminator|septic (?:contractor|professional|company)|gas fitter|arborist|' +
  '(?:mold|microbial|environmental) (?:remediation )?(?:specialist|contractor|company|professional)|remediation contractor|' +
  'garage door (?:technician|company|specialist)|appliance (?:technician|repair (?:technician|company))|' +
  'window (?:contractor|specialist)|insulation contractor|drywall contractor|painter|landscaper|' +
  'pool (?:technician|contractor|professional)|sewer (?:specialist|contractor)|well contractor|' +
  'fireplace (?:technician|specialist|professional)|electrical engineer)';
const QUAL = '(?:(?:licensed|qualified|certified|professional|experienced|reputable|registered|competent|state[- ]licensed)\\s+)*';
const SP = `(?:a|an|the)\\s+${QUAL}${SPECIALIST_NOUN}`;
const SPECIALIST_ANY = new RegExp(`\\b${QUAL}${SPECIALIST_NOUN}s?\\b`, 'i');

/** Opens as a recommendation that names a specialist. Anchored at the start of the sentence on
 *  purpose — a sentence that opens as an observation is never classified. */
const REC_OPENERS: RegExp[] = [
  new RegExp(`^${SP}\\s+(?:should|must|is (?:needed|required|recommended|advised)|can|will need to|needs to|ought to)\\b`, 'i'),
  new RegExp(`^(?:please\\s+)?(?:have|hire|consult(?: with)?|contact|engage|call|retain|obtain|seek)\\s+${SP}\\b`, 'i'),
  new RegExp(`^(?:we\\s+|the inspector\\s+)?(?:recommends?|recommended|suggests?|advises?)\\b`, 'i'),
  new RegExp(`^(?:it is |it's )?(?:recommended|advisable|advised|suggested)\\s+(?:that|to)\\b`, 'i'),
  new RegExp(`^recommendation\\s*:`, 'i'),
  new RegExp(`^(?:further |additional |professional )?(?:evaluation|assessment|inspection|review|repairs?|correction|replacement|service|servicing|remediation)` +
    `(?:\\s+and\\s+(?:repairs?|correction|replacement|service|evaluation|remediation))*` +
    `(?:\\s+(?:is|are)\\s+(?:recommended|advised|needed|required|warranted))?\\s+by\\s+${SP}\\b`, 'i'),
  new RegExp(`^(?:requires?|needs?)\\s+(?:(?:further\\s+)?(?:evaluation|repair|service|attention|correction)\\s+)?(?:by\\s+)?${SP}\\b`, 'i'),
];

const RECALLED_PANEL = /federal pacific|\bfpe\b|stab-?lok|zinsco|pushmatic|bulldog|challenger/i;
const GAS_DOCUMENTED = /gas (?:leak|odou?r|smell)|smell(?:ed|ing)? (?:of )?(?:natural )?gas|odou?r of gas|leaking gas/i;
const ELECTRICIAN = /electrician|electrical contractor/i;
const GAS_TRADE = /gas fitter|plumber|hvac (?:contractor|technician|tech|specialist|professional)/i;

/** True when an approved rule covers naming this specialist in this finding. */
function approved(sentence: string, findingText: string): boolean {
  if (ELECTRICIAN.test(sentence) && RECALLED_PANEL.test(findingText)) return true;
  if (GAS_TRADE.test(sentence) && GAS_DOCUMENTED.test(findingText)) return true;
  return false;
}

const sentencesOf = (t: string): string[] =>
  (t ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"'(])/).map(x => x.trim()).filter(Boolean);

/** "A licensed roofer should clean…" → "A qualified professional should clean…" — inside an
 *  ALREADY-CLASSIFIED recommendation sentence only. */
function neutralise(sentence: string): string {
  return sentence
    .replace(new RegExp(`\\b(a|an|the)\\s+${QUAL}${SPECIALIST_NOUN}\\b`, 'gi'), (_m, art: string) => (/^[A-Z]/.test(art) ? 'A' : 'a') + ' qualified professional')
    .replace(new RegExp(`\\b${QUAL}${SPECIALIST_NOUN}\\b`, 'gi'), 'qualified professional');
}

export type HomeownerFinding = {
  /** The recorded observations, minus any sentence classified as an unsupported specialist
   *  recommendation (repair tier) or with that specialist neutralised (other tiers). */
  observations: string[];
  /** The same, as one string — what a homeowner reads where a description was shown. */
  description: string;
  /** The legacy recommendation field after the same rule, or null when it is withheld. */
  recommendation: string | null;
  /** FURTHER_EVALUATION_* when a repair-tier finding recommended someone, else null. */
  evaluation: { heading: string; text: string } | null;
  /** Sentences that mention a specialist but could not be classified — shown UNCHANGED. */
  needsReview: string[];
  /** True when anything the homeowner reads differs from the stored text. */
  changed: boolean;
};

export function forHomeowner(a: FindingLike): HomeownerFinding {
  const repairTier = REPAIR_TIER.has(String(a.severity ?? '').toLowerCase());
  const bullets = (a.observationBullets ?? []).filter(b => typeof b === 'string' && b.trim());
  const source = bullets.length ? bullets : [a.description ?? ''];
  const findingText = `${a.issue ?? ''} ${a.unit ?? ''} ${source.join(' ')}`;
  const needsReview: string[] = [];
  let dropped = false;
  let changed = false;

  const isRec = (x: string) => REC_OPENERS.some(re => re.test(x));
  const fix = (s: string): string | null => {
    if (!SPECIALIST_ANY.test(s) || approved(s, findingText)) return s;
    if (isRec(s)) {
      changed = true;
      if (repairTier) { dropped = true; return null; }
      return neutralise(s);
    }
    // "Cracked joist observed; recommend evaluation by a structural engineer." — a clause after a
    // semicolon that OPENS as a recommendation is classified the same way; the observation clause
    // before it is kept word for word. Anything else stays as recorded, for review.
    const clauses = s.split(/;\s+/);
    const isRecClause = (c: string, i: number) => i > 0 && SPECIALIST_ANY.test(c) && isRec(c);
    const recIdx = clauses.map((c, i) => (isRecClause(c, i) ? i : -1)).filter(i => i >= 0);
    const others = clauses.filter((c, i) => !recIdx.includes(i));
    if (recIdx.length && others.every(c => !SPECIALIST_ANY.test(c))) {
      changed = true;
      if (repairTier) {
        dropped = true;
        const kept = others.join('; ').replace(/[\s,;:.]+$/, '');
        return `${kept}${/[!?]$/.test(kept) ? '' : '.'}`;
      }
      return clauses.map((c, i) => (recIdx.includes(i) ? neutralise(c) : c)).join('; ');
    }
    needsReview.push(s);
    return s;
  };

  const cleaned = source
    .map(b => sentencesOf(b).map(fix).filter((x): x is string => x !== null).join(' '))
    .filter(b => b.trim());
  // Without bullets the description is one block; give the caller sentences to list.
  const observations = bullets.length ? cleaned : sentencesOf(cleaned.join(' '));

  let recommendation: string | null = (a.recommendation ?? '').trim() || null;
  if (recommendation && SPECIALIST_ANY.test(recommendation) && !approved(recommendation, findingText)) {
    // The field IS a recommendation by definition, so naming a specialist in it is classifiable.
    changed = true;
    if (repairTier) { dropped = true; recommendation = null; } else recommendation = neutralise(recommendation);
  }

  const evaluation = repairTier && (dropped || isRealPro(a.prosToCall))
    ? { heading: FURTHER_EVALUATION_HEADING, text: FURTHER_EVALUATION_TEXT }
    : null;
  return { observations, description: observations.join(' '), recommendation, evaluation, needsReview, changed };
}
