'use client';

import { Spinner } from './WorkspaceShell';
import { PHASE_LABEL, SEVERITY_COLOR, SEVERITY_SHORT_LABELS, parseSeverity, type Phase } from '@/lib/workspace/model';

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-body">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, count, children, className = '' }: { title?: string; count?: number; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-hairline bg-surface ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {typeof count === 'number' && <span className="rounded-full bg-ground px-2 py-0.5 font-mono text-xs text-body">{count}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted">{children}</p>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted"><Spinner />{label}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-safety/30 bg-safety/5 px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="shrink-0 font-semibold text-accent-ink hover:underline">Try again</button>}
    </div>
  );
}

/** THE SYNC LINE (2026-10-21, approved parity mockup): where the data comes from and how fresh it is, in one line,
 *  instead of the permanent "View only" banner. What a page cannot do yet is said on that page, where you would try
 *  it. `lastSync` is the newest `inspections.updated_at` the page loaded — the last time a phone's work reached the
 *  server — or undefined while it loads. */
export function SyncLine({ lastSync }: { lastSync?: string | null }) {
  return (
    <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
      <span>Showing what phones have synced{lastSync ? ` · last phone sync ${formatWhen(lastSync)}` : lastSync === null ? ' · nothing synced yet' : ''}.</span>
      <span>Work still on a phone appears after it syncs.</span>
    </p>
  );
}

/** States, every time it matters, where the data comes from — so nobody mistakes the browser
 *  for the place the inspection is conducted. Superseded by SyncLine on every page (2026-10-21). */
export function ReadOnlyNotice() {
  return (
    <div className="mb-6 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-body">
      <span className="font-semibold text-ink">View only.</span>{' '}
      Inspections are conducted, confirmed and finalized in the Ledrix app. This workspace shows what each phone has synced, so work still on a device may not appear yet.
    </div>
  );
}

export function PhasePill({ phase }: { phase: Phase }) {
  const tone = phase === 'completed' ? 'bg-ok/10 text-ink' : phase === 'archived' ? 'bg-ground text-muted' : 'bg-accent/10 text-accent-ink';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{PHASE_LABEL[phase]}</span>;
}

export function PriorityPill({ severity }: { severity: unknown }) {
  const s = parseSeverity(severity);
  if (!s) return <span className="inline-flex rounded-full bg-ground px-2 py-0.5 text-[11px] font-semibold text-muted">UNRATED</span>;
  const c = SEVERITY_COLOR[s];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink" style={{ background: `${c}1F` }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {SEVERITY_SHORT_LABELS[s]}
    </span>
  );
}

export function formatDate(ymdOrIso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!ymdOrIso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdOrIso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(ymdOrIso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, opts);
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
