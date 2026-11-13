// ── ONE HOME: THE SYSTEMS VIEW, ONE MODEL (owner 2026-11-12: One Home approved, mockup GejuM8pyUwwkWUyVnuPFGD) ─────────
// The report link's web Home and the Ledrix Home app show the same Systems list and the same System screen: what the
// inspection recorded (its published specs), the year each unit was made against its typical service life, the manual
// Ledrix found and CHECKED from its data plate, the upkeep that manual gives, and that system's findings.
//
// PURE and copied byte-for-byte to the website (scripts/web-preview-sync.json → lib/scope/core/home/), so the two
// can't drift. It reads only the PUBLISHED record (publishedRecord.ts allow-lists), never device state.
//
// Rules (verify:home-systems-model):
//   · a system is any system the record has a spec or a finding for, in a fixed order, then the rest by name
//   · the year made comes from the Age field's stored value ("Manufactured 2011" / "Installed 2011"); an older range
//     answer or "Not determined" gives no year (unknown, never guessed)
//   · past its service life = older than the window's END (serviceLife.isPastServiceLife), age counted at the inspection
//   · a manual shows only when Ledrix checked it (a verified-at time); an unchecked link is not offered
//   · a finding belongs to the system the report printed it under (reportSystem)
import { serviceLivesOf, serviceLifeFor, isPastServiceLife, type ServiceLife } from '../taxonomy/serviceLife';

type Row = Record<string, unknown>;

export interface HomeSystemFact { label: string; value: string }
export interface HomeSystemFinding { id: string; title: string; severity: string; isSafety: boolean }
export interface HomeSystemUpkeep { task: string; intervalDays: number; notes?: string }
export interface HomeSystem {
  key: string;
  label: string;
  facts: HomeSystemFact[];
  /** The year made, and its age at the inspection; null when not recorded. */
  made: { year: number; age: number } | null;
  /** Its typical life and whether it is past it; null when the kind has no service life or the year is unknown. */
  life: { label: string; low: number; high: number; past: boolean } | null;
  manual: { url: string; verifiedAt: string } | null;
  upkeep: HomeSystemUpkeep[];
  findings: HomeSystemFinding[];
}

/** The order systems are listed in; anything else follows by name. */
export const HOME_SYSTEM_ORDER = ['roof', 'exterior', 'structure', 'foundation', 'electrical', 'heating', 'cooling', 'hvac',
  'water_heater', 'plumbing', 'fireplace', 'attic', 'insulation', 'interior', 'appliances', 'garage'] as const;

const LABELS: Record<string, string> = {
  roof: 'Roof', exterior: 'Exterior', structure: 'Structure', foundation: 'Foundation', electrical: 'Electrical',
  heating: 'Heating', cooling: 'Cooling', hvac: 'Heating & Cooling', water_heater: 'Water Heater', plumbing: 'Plumbing',
  fireplace: 'Fireplace', attic: 'Attic', insulation: 'Insulation', interior: 'Interior', appliances: 'Appliances', garage: 'Garage',
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const keyOf = (v: unknown) => str(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const titleOf = (k: string) => k.split('_').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

/** The year an Age answer records, or null ("Manufactured 2011", "Installed 2011", "Manufactured 2011 · 15 yrs"). */
export function yearMadeOf(value: unknown): number | null {
  const m = /\b(?:manufactured|installed|made)\s+(\d{4})\b/i.exec(str(value));
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1900 && y <= 2100 ? y : null;
}

const isAgeCategory = (c: string) => /^(age|system age|estimated age|age est)/i.test(c);

export function homeSystems(x: {
  specs: readonly unknown[]; findings: readonly unknown[];
  /** The inspection date (ISO) the age is counted at; today when absent. */
  inspectedAt?: string | null;
  /** The inspection's service lives; Ledrix's when absent. */
  lives?: readonly ServiceLife[] | null;
}): HomeSystem[] {
  const lives = x.lives?.length ? [...x.lives] : serviceLivesOf(null);
  const at = x.inspectedAt ? new Date(x.inspectedAt) : new Date();
  const atYear = Number.isNaN(at.getTime()) ? new Date().getFullYear() : at.getFullYear();
  const by = new Map<string, HomeSystem>();
  const get = (key: string, label?: string) => {
    let s = by.get(key);
    if (!s) { s = { key, label: label || LABELS[key] || titleOf(key), facts: [], made: null, life: null, manual: null, upkeep: [], findings: [] }; by.set(key, s); }
    return s;
  };
  const words = new Map<string, string[]>();

  for (const raw of x.specs ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Row;
    const key = keyOf(r.system);
    if (!key) continue;
    const s = get(key);
    const category = str(r.category), value = str(r.material);
    (words.get(key) ?? (words.set(key, [key.replace(/_/g, ' ')]), words.get(key)!)).push(category, value);
    if (isAgeCategory(category)) {
      const y = yearMadeOf(value);
      if (y && !s.made) s.made = { year: y, age: Math.max(0, atYear - y) };
    } else if (category && value) s.facts.push({ label: category, value });
    const url = str(r.manual_url ?? r.manualUrl), verifiedAt = str(r.manual_verified_at ?? r.manualVerifiedAt);
    if (url && verifiedAt && !s.manual) {
      s.manual = { url, verifiedAt };
      const tasks = (r.manual_maintenance ?? r.manualMaintenance) as unknown;
      if (Array.isArray(tasks)) for (const t of tasks) {
        const task = str((t as Row)?.task), days = Number((t as Row)?.intervalDays);
        if (task && Number.isFinite(days) && days > 0 && !s.upkeep.some(u => u.task === task)) s.upkeep.push({ task, intervalDays: days, ...(str((t as Row)?.notes) ? { notes: str((t as Row).notes) } : {}) });
      }
    }
  }

  for (const raw of x.findings ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Row;
    const key = keyOf(r.reportSystem) || keyOf(r.unit);
    if (!key) continue;
    const s = get(key, str(r.reportSystemLabel) || undefined);
    s.findings.push({ id: str(r.id), title: str(r.issueTitle) || str(r.issue) || 'Finding', severity: str(r.severity) || 'maintenance', isSafety: r.isSafety === true });
  }

  for (const s of by.values()) {
    if (!s.made) continue;
    const life = serviceLifeFor((words.get(s.key) ?? [s.key.replace(/_/g, ' ')]).join(' '), lives);
    if (life) s.life = { label: life.label, low: life.low, high: life.high, past: isPastServiceLife(s.made.age, life) };
  }

  const rank = (k: string) => { const i = (HOME_SYSTEM_ORDER as readonly string[]).indexOf(k); return i < 0 ? HOME_SYSTEM_ORDER.length : i; };
  return [...by.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}
