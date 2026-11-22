// Location suggestions on the website (ledrix-app PLAN_2026-11-21_location.md L6; SQL #138). The server decides who sees
// them (approve_locations, #139), when a custom location is common enough (1 in 25 of the last 100 inspections, at least
// 3), and what a decision does. Before #138 is applied the calls answer PGRST202 and this reads as nothing to show.
import { workspace } from '@/lib/workspace/client';

export type LocationSuggestion = { key: string; label: string; spellings: Record<string, number>;
  inspections: number; recent_total: number; inspectors: number; findings: number };
export type LocationGroup = 'inside' | 'below_above' | 'outside';
export type LocationDecision =
  | { action: 'add'; label: string; group: LocationGroup }
  | { action: 'map'; label: string; group: LocationGroup; mapsTo: string }
  | { action: 'dismiss' };

export async function loadLocationSuggestions(): Promise<LocationSuggestion[]> {
  const res = await workspace.rpc('location_suggestions_for_me');
  return !res.error && Array.isArray(res.data) ? (res.data as LocationSuggestion[]) : [];
}

export async function decideLocationSuggestion(key: string, d: LocationDecision): Promise<LocationSuggestion[]> {
  const res = await workspace.rpc('decide_location_suggestion', {
    p_key: key, p_action: d.action,
    p_label: d.action === 'dismiss' ? null : d.label, p_group: d.action === 'dismiss' ? null : d.group,
    p_maps_to: d.action === 'map' ? d.mapsTo : null,
  });
  if (res.error) throw new Error(/42501|Only someone/.test(`${res.error.code} ${res.error.message}`)
    ? 'Only someone who may approve locations can decide this.' : (res.error.message ?? 'Something went wrong.'));
  return Array.isArray(res.data) ? (res.data as LocationSuggestion[]) : [];
}
