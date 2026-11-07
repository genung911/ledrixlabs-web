'use client';

// Building-type helpers for the Template Builder: the building icons, what changed since the live template, and the
// issues to show. The BUILDING TYPES TAB IS GONE (owner 2026-11-06, mockup HHfBh3wvLanc1CG4UcNxaU, "Approved"): buildings
// are the strip across the top of Systems (BuildingLens.tsx) and what is in each is switched there (buildingModel.ts).
// A template's building types are still ONE field (`structureTypes`), validated by structureTypes.validateStructureTypes.
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import { hasOwnStructureTypes, structureTypesOf, validateStructureTypes, type StructureTypeIssue } from '@/lib/templateBuilder/core/structureTypes';
import { displayLabel } from './systemLabel';

// ── icons (the building set is structureTypes.STRUCTURE_TYPE_ICONS — MaterialCommunityIcons names on the phone) ──
const BUILDING_PATHS: Record<string, string> = {
  'warehouse': 'M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10',
  'garage-variant': 'M3 21V10l9-6 9 6v11M6 21v-8h12v8M6 16h12M6 19h12',
  'home-group': 'M2 21v-8l5-4 5 4v8M12 21v-9l5-4 5 4v9M5 21v-4h4v4M15 21v-4h4v4',
  'home-variant-outline': 'M3 11 12 4l9 7M5 10v11h14V10M10 21v-6h4v6',
  'barn': 'M3 21V10l3-5h12l3 5v11M3 10h18M9 21v-6h6v6M9 15l6 6M15 15l-6 6',
  'pool': 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 22c2 0 2-1.5 4-1.5S8 22 10 22s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8',
  'office-building': 'M5 21V3h10v18M15 9h4v12M8 7h4M8 11h4M8 15h4',
  'home-city-outline': 'M4 20V9l6-4 6 4v11M16 20V12h4v8M8 13h4M8 17h4',
  'home-outline': 'M3 12 12 4l9 8M6 10v10h12V10',
  'home': 'M3 12 12 4l9 8M6 10v10h12V10M10 20v-5h4v5',
};
function Svg({ d, size = 18, className = '', color }: { d: string; size?: number; className?: string; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flex: 'none' }}><path d={d} /></svg>;
}
export const BIcon = ({ name, size, className, color }: { name: string; size?: number; className?: string; color?: string }) =>
  <Svg d={BUILDING_PATHS[name] ?? BUILDING_PATHS['home-outline']} size={size} className={className} color={color} />;

export function buildingTypeChanges(live: InspectionTemplate | null, now: InspectionTemplate): string[] {
  const liveOwn = hasOwnStructureTypes(live), nowOwn = hasOwnStructureTypes(now);
  if (!liveOwn && !nowOwn) return [];
  if (liveOwn && !nowOwn) return ['Building types go back to Ledrix’s defaults'];
  const nm = (id: string) => displayLabel(now.systems.find(s => s.id === id)?.label ?? live?.systems.find(s => s.id === id)?.label ?? id);
  const was = structureTypesOf(live).types, is = structureTypesOf(now).types;
  const out: string[] = [];
  if (!liveOwn) out.push('Building types: this template now sets its own (until now, Ledrix’s defaults)');
  for (const t of is) {
    const w = liveOwn ? was.find(l => l.id === t.id) : undefined;
    if (!w) {
      out.push(liveOwn ? `Added “${t.name}” with ${t.systems.length} system${t.systems.length === 1 ? '' : 's'}`
        : `${t.name}: ${t.systems.length ? t.systems.map(nm).join(', ') : 'no systems'}`);
      continue;
    }
    if (w.name !== t.name) out.push(`Renamed “${w.name}” to “${t.name}”`);
    if (w.icon !== t.icon) out.push(`${t.name}: new icon`);
    const add = t.systems.filter(s => !w.systems.includes(s)), rem = w.systems.filter(s => !t.systems.includes(s));
    if (add.length) out.push(`${t.name}: + ${add.map(nm).join(', ')}`);
    if (rem.length) out.push(`${t.name}: − ${rem.map(nm).join(', ')}`);
  }
  if (liveOwn) for (const l of was) if (!is.some(t => t.id === l.id)) out.push(`Removed “${l.name}”`);
  return out;
}

/** Building-type problems that block publishing, and the warnings shown with it. */
export function buildingTypeIssues(tree: InspectionTemplate): { errors: StructureTypeIssue[]; warnings: StructureTypeIssue[] } {
  const all = validateStructureTypes(tree);
  return { errors: all.filter(i => i.severity === 'error'), warnings: all.filter(i => i.severity === 'warning') };
}
