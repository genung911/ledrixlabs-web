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
import { loadMyCapabilities } from '@/lib/team/permissions';
import { mayEditServices, mayManagePayments } from '@/lib/office/access';

// canServices rides the context so the Company tabs (components/workspace/CompanyTabs) gate Services & prices exactly as
// the menu used to — one answer, computed once here.
type Ctx = { access: Extract<Access, { ok: true }>; companyName: string | null; signOut: () => Promise<void>; canServices: boolean };
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

  // Invoices are shown only to people the server lets read them (#79: the `invoices` permission, or an account with
  // no company, which invoices for itself). The server decides either way; this only hides a page that would be empty.
  const [canInvoice, setCanInvoice] = useState(false);
  // Contacts likewise follow the server's `crm` permission (#78; or an account with no company — its own CRM).
  const [canCrm, setCanCrm] = useState(false);
  const [canServices, setCanServices] = useState(false);
  useEffect(() => {
    if (gate.kind !== 'ready') return;
    const companyId = gate.access.companyId;
    loadMyCapabilities().then(c => {
      setCanInvoice(!companyId || c?.invoices === true);
      setCanCrm(!companyId || c?.crm === true);
      setCanServices(mayEditServices({ companyId, role: gate.access.role }, c as any));
    }).catch(() => { setCanInvoice(false); setCanCrm(false); setCanServices(false); });
  }, [gate]);

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
  const canPayments = mayManagePayments({ companyId: access.companyId, role: access.role });
  // ONE VOCABULARY WITH THE PHONE (2026-10-21, approved parity mockup): Today · Inspections · Reports · Templates · Team
  // · Company, with Account in the footer. "Dashboard" became Today (the phone's home is the same question).
  // SEVEN ITEMS (owner 2026-11-05, "Use recommendations"): Team, Services & prices and Payments are tabs of Company now
  // (components/workspace/CompanyTabs — the same gates, the same routes), so the menu is Today · Inspections · CRM ·
  // Reports · Invoices · Templates · Company. Company shows when any of its tabs would.
  const nav = [
    { href: '/app', label: 'Today', show: true },
    { href: '/app/inspections', label: 'Inspections', show: true },
    // The CRM (owner 2026-11-05, CRM home mockup): its own home with Contacts, Accounts, Schedule and the planned tabs.
    { href: '/app/crm', label: 'CRM', show: canCrm },
    { href: '/app/reports', label: 'Reports', show: true },
    { href: '/app/invoices', label: 'Invoices', show: canInvoice },
    { href: '/app/templates', label: 'Templates', show: !!access.companyId },
    { href: '/app/company', label: 'Company', show: !!access.companyId || canServices || canPayments },
  ].filter(n => n.show);
  // Company is lit on every one of its tabs, Team's page included.
  const isActive = (href: string) => href === '/app' ? pathname === '/app'
    : href === '/app/company' ? COMPANY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    : pathname === href || pathname.startsWith(href + '/');

  return (
    <WorkspaceCtx.Provider value={{ access, companyName, signOut, canServices }}>
      <div className="min-h-screen bg-ground lg:flex">
        {/* Top bar below lg (phones and tablets keep it); the icon rail at lg and above. */}
        <div className="flex h-14 items-center justify-between border-b border-hairline bg-surface px-4 lg:hidden">
          <a href="/app" className="flex items-center gap-2"><LedrixDelta size={18} /><span className="text-sm font-bold text-ink">Ledrix Inspect</span></a>
          <button aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} onClick={() => setNavOpen(o => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-ink/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {navOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {/* Below lg: today's full menu, opened from the top bar. */}
        <aside className={`${navOpen ? 'block' : 'hidden'} border-b border-hairline bg-surface lg:hidden`}>
          <nav aria-label="Workspace" className="flex flex-col gap-0.5 px-3 py-3">
            {nav.map(n => (
              <a key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive(n.href) ? 'bg-accent/10 text-accent-ink' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="border-t border-hairline px-5 py-4">
            <UserBlock name={access.name} detail={[companyName, roleLabel(access.role)].filter(Boolean).join(' · ')} signOut={signOut} />
          </div>
        </aside>

        <Rail nav={nav} isActive={isActive} name={access.name} detail={[companyName, roleLabel(access.role)].filter(Boolean).join(' · ')} signOut={signOut} />

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </WorkspaceCtx.Provider>
  );
}

/** Company's tabs live on these routes (CompanyTabs); the menu's Company item is lit on all of them. */
const COMPANY_PATHS = ['/app/company', '/app/team'];

// One line icon per menu item, in the Template Builder's style (24-grid, 1.8 stroke, round caps).
const NAV_ICON: Record<string, string> = {
  '/app': 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  '/app/inspections': 'M9 4h6l1 2h3v15H5V6h3zM9 4v3h6V4M8 12h8M8 16h5',
  '/app/crm': 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 010 6.4M18 14.4c2.1.7 3.5 2.8 3.5 5.6',
  '/app/reports': 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  '/app/invoices': 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3',
  '/app/templates': 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  '/app/company': 'M4 21V5l8-2v18M12 7l8 2v12M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20',
};
const NavIcon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0"><path d={d} /></svg>
);

function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
}

function UserBlock({ name, detail, signOut }: { name: string | null | undefined; detail: string; signOut: () => Promise<void> }) {
  return (<>
    <p className="truncate text-sm font-semibold text-ink">{name ?? 'Signed in'}</p>
    <p className="truncate text-xs text-muted">{detail}</p>
    <AppearanceSwitch />
    <button onClick={signOut} className="mt-3 block text-xs font-semibold text-body hover:text-ink focus:outline-none focus-visible:underline">Sign out</button>
  </>);
}

/**
 * THE ICON RAIL (owner 2026-11-05, "Use recommendations for main menu"): ~56px at rest on desktop; hovering it — or
 * tabbing into it — slides the full menu out OVER the page (absolute, so the page never shifts), and it tucks back on
 * mouse-leave, when focus leaves it, or on Escape. No pin. Every icon link keeps its name (aria-label + a visually
 * hidden label), the active item is marked in both states, and motion is off for prefers-reduced-motion. The name,
 * Appearance and Sign out sit behind a round initials button at the bottom.
 */
function Rail({ nav, isActive, name, detail, signOut }: {
  nav: Array<{ href: string; label: string }>; isActive: (href: string) => boolean;
  name: string | null | undefined; detail: string; signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => { setOpen(false); setMenu(false); }, []);
  return (
    <div className="relative hidden w-14 shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen" data-rail>
      <aside aria-label="Main menu" data-open={open ? 'true' : 'false'}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!menu) setOpen(false); }}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(); }}
        onKeyDown={e => { if (e.key === 'Escape') { close(); (document.activeElement as HTMLElement | null)?.blur(); } }}
        className={`absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-hairline bg-surface transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
          open ? 'w-60 shadow-xl' : 'w-14'}`}>
        <a href="/app" aria-label="Ledrix Inspect — Today" className="flex h-16 shrink-0 items-center gap-2.5 px-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
          <LedrixDelta size={20} />
          <span className={`whitespace-nowrap text-sm font-bold tracking-tight text-ink ${open ? '' : 'sr-only'}`}>Ledrix Inspect</span>
        </a>
        <nav aria-label="Workspace" className="flex flex-col gap-0.5 px-2 py-1">
          {nav.map(n => {
            const on = isActive(n.href);
            return (
              <a key={n.href} href={n.href} aria-label={n.label} title={open ? undefined : n.label} aria-current={on ? 'page' : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-[10px] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  on ? 'bg-accent/10 text-accent-ink' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
                <NavIcon d={NAV_ICON[n.href] ?? NAV_ICON['/app']} />
                <span className={`whitespace-nowrap ${open ? '' : 'sr-only'}`}>{n.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-hairline px-2 py-3">
          <button type="button" aria-haspopup="dialog" aria-expanded={menu} aria-label={`Account: ${name ?? 'Signed in'}`}
            onClick={() => { setMenu(m => !m); setOpen(true); }}
            className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-surface">{initialsOf(name)}</span>
            <span className={`min-w-0 ${open ? '' : 'sr-only'}`}>
              <span className="block truncate text-sm font-semibold text-ink">{name ?? 'Signed in'}</span>
              <span className="block truncate text-xs text-muted">{detail}</span>
            </span>
          </button>
          {menu && (
            <div role="dialog" aria-label="Account" className="mx-1 mt-2 rounded-lg border border-hairline bg-ground px-3 py-3">
              <UserBlock name={name} detail={detail} signOut={signOut} />
            </div>
          )}
        </div>
      </aside>
    </div>
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
