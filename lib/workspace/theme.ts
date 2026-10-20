// Workspace appearance — Light (the default), Dark, or Auto (follow the computer's setting).
//
// A per-browser preference, like a remembered filter: kept in localStorage, never on the server, and every read or
// write tolerates storage being blocked (it simply falls back to Light). It only ever affects the inspector workspace:
// the colour variables are redefined under `html[data-ws-theme="dark"] .ws-root` (app/globals.css), and only /app
// renders a .ws-root, so the marketing site and the homeowner portal stay light.

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'ledrix_ws_theme';
export const THEME_PREFS: ReadonlyArray<{ id: ThemePref; label: string }> = [
  { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'Auto' },
];

const isPref = (v: unknown): v is ThemePref => v === 'light' || v === 'dark' || v === 'system';

export function readThemePref(): ThemePref {
  try { const v = window.localStorage.getItem(THEME_KEY); return isPref(v) ? v : 'light'; } catch { return 'light'; }
}

export function writeThemePref(p: ThemePref): void {
  try { window.localStorage.setItem(THEME_KEY, p); } catch { /* blocked storage: the choice lasts for this page only */ }
}

export function systemPrefersDark(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

export const effectiveTheme = (p: ThemePref, systemDark: boolean): Theme => (p === 'system' ? (systemDark ? 'dark' : 'light') : p);

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.wsTheme = t;
}

/** Runs before the workspace hydrates (app/app/layout.tsx), so a dark preference never flashes light first.
 *  Kept in step with readThemePref / effectiveTheme above. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.wsTheme=d?'dark':'light';}catch(e){}})();`;
