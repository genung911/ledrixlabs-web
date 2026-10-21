'use client';

// Inspector workspace shell — session gate + persistent navigation for every /app route except
// /app/login. The gate is presentation only: an unauthenticated or unauthorized browser simply has
// nothing to show, because every query below it runs as the user under row-level security.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LedrixDelta } from '@/components/LedrixDelta';
import { workspace } from '@/lib/workspace/client';
import { loadCompanyName, loadProfile } from '@/lib/workspace/data';
import { decideAccess, type Access } from '@/lib/workspace/model';
import { THEME_PREFS, applyTheme, effectiveTheme, readThemePref, systemPrefersDark, writeThemePref, type ThemePref } from '@/lib/workspace/theme';

type Ctx = { access: Extract<Access, { ok: true }>; companyName: string | null; signOut: () => Promise<void> };
const WorkspaceCtx = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error('useWorkspace outside WorkspaceShell');
  return c;
}

type Gate =
  | { kind: 'loading' }
  | { kind: 'ready'; access: Extract<Access, { ok: true }>; companyName: string | null }
  | { kind: 'refused' }
  | { kind: 'error'; message: string };

export function WorkspaceRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  // .ws-root scopes the optional dark theme to the workspace (app/globals.css).
  return <div className="ws-root">{pathname === '/app/login' ? children : <WorkspaceShell>{children}</WorkspaceShell>}</div>;
}

/** The saved appearance, applied; Auto follows the computer's setting live. */
function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>('light');
  useEffect(() => { setPref(readThemePref()); }, []);
  useEffect(() => {
    applyTheme(effectiveTheme(pref, systemPrefersDark()));
    if (pref !== 'system') return;
    let mql: MediaQueryList | null = null;
    try { mql = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
    const on = () => applyTheme(effectiveTheme('system', mql!.matches));
    mql.addEventListener?.('change', on);
    return () => mql?.removeEventListener?.('change', on);
  }, [pref]);
  const choose = useCallback((p: ThemePref) => { writeThemePref(p); setPref(p); }, []);
  return [pref, choose];
}

function AppearanceSwitch() {
  const [pref, choose] = useThemePref();
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Appearance</p>
      <div role="radiogroup" aria-label="Appearance" className="mt-1.5 inline-flex rounded-lg border border-hairline bg-ground p-0.5">
        {THEME_PREFS.map(t => (
          <button key={t.id} role="radio" aria-checked={pref === t.id} onClick={() => choose(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              pref === t.id ? 'bg-surface text-ink shadow-sm' : 'text-body hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [navOpen, setNavOpen] = useState(false);

  const toLogin = useCallback(() => {
    const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/app';
    router.replace(`/app/login?next=${encodeURIComponent(next)}`);
  }, [router]);

  const resolve = useCallback(async () => {
    const { data } = await workspace.auth.getSession();
    const user = data.session?.user;
    if (!user) { toLogin(); return; }
    try {
      const access = decideAccess(await loadProfile(user.id));
      if (!access.ok) { setGate({ kind: 'refused' }); return; }
      setGate({ kind: 'ready', access, companyName: await loadCompanyName(access.companyId) });
    } catch (e) {
      setGate({ kind: 'error', message: e instanceof Error ? e.message : 'The workspace could not load.' });
    }
  }, [toLogin]);

  useEffect(() => {
    resolve();
    // An expired or revoked session (refresh fails → SIGNED_OUT), or a sign-out in another tab,
    // returns this tab to the sign-in screen instead of leaving stale data on it.
    const { data: sub } = workspace.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') toLogin();
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve, toLogin]);

  useEffect(() => { setNavOpen(false); }, [pathname]);

  const signOut = useCallback(async () => {
    await workspace.auth.signOut();
    router.replace('/app/login');
  }, [router]);

  if (gate.kind === 'loading') return <Centered><Spinner /> <span className="ml-3 text-sm text-muted">Opening your workspace…</span></Centered>;
  if (gate.kind === 'error') return (
    <Centered>
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-ink">The workspace could not load</p>
        <p className="mt-2 text-sm text-body">{gate.message}</p>
        <button onClick={() => { setGate({ kind: 'loading' }); resolve(); }} className="mt-5 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-surface hover:bg-ink/85">Try again</button>
      </div>
    </Centered>
  );
  if (gate.kind === 'refused') return (
    <Centered>
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-ink">This sign-in is for inspection companies</p>
        <p className="mt-2 text-sm text-body">Your account has no inspector profile. Homeowners open their report from the link their inspector sent.</p>
        <button onClick={signOut} className="mt-5 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-surface hover:bg-ink/85">Sign out</button>
      </div>
    </Centered>
  );

  const { access, companyName } = gate;
  // ONE VOCABULARY WITH THE PHONE (2026-10-21, approved parity mockup): Today · Inspections · Reports · Templates · Team
  // · Company, with Account in the footer. "Dashboard" became Today (the phone's home is the same question).
  const nav = [
    { href: '/app', label: 'Today', show: true },
    { href: '/app/inspections', label: 'Inspections', show: true },
    { href: '/app/reports', label: 'Reports', show: true },
    { href: '/app/templates', label: 'Templates', show: !!access.companyId },
    { href: '/app/team', label: 'Team', show: !!access.companyId },
    { href: '/app/company', label: 'Company', show: !!access.companyId },
  ].filter(n => n.show);
  const isActive = (href: string) => href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  return (
    <WorkspaceCtx.Provider value={{ access, companyName, signOut }}>
      <div className="min-h-screen bg-ground lg:flex">
        {/* Top bar below lg; the sidebar is persistent at lg and above. */}
        <div className="flex h-14 items-center justify-between border-b border-hairline bg-surface px-4 lg:hidden">
          <a href="/app" className="flex items-center gap-2"><LedrixDelta size={18} /><span className="text-sm font-bold text-ink">Ledrix Inspect</span></a>
          <button aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} onClick={() => setNavOpen(o => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-ink/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {navOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        <aside className={`${navOpen ? 'block' : 'hidden'} border-b border-hairline bg-surface lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r`}>
          <div className="flex h-full flex-col">
            <a href="/app" className="hidden h-16 items-center gap-2.5 px-5 lg:flex">
              <LedrixDelta size={20} />
              <span className="text-sm font-bold tracking-tight text-ink">Ledrix Inspect</span>
            </a>
            <nav aria-label="Workspace" className="flex flex-col gap-0.5 px-3 py-3 lg:py-1">
              {nav.map(n => (
                <a key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isActive(n.href) ? 'bg-accent/10 text-accent-ink' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
                  {n.label}
                </a>
              ))}
            </nav>
            <div className="mt-auto border-t border-hairline px-5 py-4">
              <p className="truncate text-sm font-semibold text-ink">{access.name ?? 'Signed in'}</p>
              <p className="truncate text-xs text-muted">{[companyName, roleLabel(access.role)].filter(Boolean).join(' · ')}</p>
              <AppearanceSwitch />
              <button onClick={signOut} className="mt-3 block text-xs font-semibold text-body hover:text-ink focus:outline-none focus-visible:underline">Sign out</button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </WorkspaceCtx.Provider>
  );
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'ledrix_admin': return 'Ledrix admin';
    case 'owner': return 'Owner';
    case 'admin': return 'Admin';
    case 'manager': return 'Manager';
    case 'office': return 'Office';
    default: return 'Inspector';
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-ground px-4">{children}</div>;
}

export function Spinner() {
  return <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-accent" />;
}
