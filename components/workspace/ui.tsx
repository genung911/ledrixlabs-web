'use client';

import React from 'react';
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

export function PriorityPill({ severity, unset, suggested }: { severity: unknown; unset?: boolean; suggested?: boolean }) {
  if (unset) return <span className="inline-flex rounded-full bg-ground px-2 py-0.5 text-[11px] font-semibold text-muted">Not set</span>;
  const s = parseSeverity(severity);
  if (!s) return <span className="inline-flex rounded-full bg-ground px-2 py-0.5 text-[11px] font-semibold text-muted">Unrated</span>;
  const c = SEVERITY_COLOR[s];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink" style={{ background: `${c}1F` }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {SEVERITY_SHORT_LABELS[s]}
      {suggested && <span className="text-[10px] font-semibold text-muted">· Ledrix suggests</span>}
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

// ── The website's kit (Apple pass, owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to: "Mock up approved") ──────────────
// The phone's kit (src/components/kit/Kit.tsx, 967) for a computer screen: grouped lists with small grey capitals
// headings and a grey footnote, rows with a value on the right and a switch on the row, a segmented control, red rows
// last, and one pinned bar for a page's one commit. Presentational only — every tap leaves through a prop.

/** Rule 3: a titled group of rows (System Settings style). */
export function Group({ heading, footnote, right, children }: { heading?: React.ReactNode; footnote?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {(heading || right) && (
        <div className="flex items-end justify-between gap-3 px-3">
          {heading ? <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{heading}</h2> : <span />}
          {right}
        </div>
      )}
      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">{children}</div>
      {footnote && <p className="px-3 text-xs leading-relaxed text-muted">{footnote}</p>}
    </section>
  );
}

/** One row: label (and a grey second line) left, value right, a chevron when it opens something. */
export function Row({ label, sub, value, valueTone, onClick, href, right, destructive, disabled }: {
  label: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; valueTone?: 'need' | 'ok' | 'bad';
  onClick?: () => void; href?: string; right?: React.ReactNode; destructive?: boolean; disabled?: boolean;
}) {
  const tone = valueTone === 'need' ? 'text-[#c47a12]' : valueTone === 'ok' ? 'text-[#1f8a5b]' : valueTone === 'bad' ? 'text-safety' : 'text-body';
  const opens = (onClick || href) && !destructive && !right;
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${destructive ? 'text-safety' : 'text-ink'}`}>{label}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {value !== undefined && value !== null && value !== '' && <span className={`shrink-0 text-sm ${tone}`}>{value}</span>}
      {right}
      {opens && <span aria-hidden className="shrink-0 text-muted">›</span>}
    </>
  );
  const cls = `flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left ${disabled ? 'opacity-50' : ''} ${(onClick || href) && !disabled ? 'hover:bg-ground' : ''}`;
  if (href && !disabled) return <a href={href} className={cls}>{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** A switch on a row. */
export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#34c759]' : 'bg-hairline'} ${disabled ? 'opacity-50' : ''}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

/** The segmented control (a period, a status). */
export function Seg<T extends string>({ options, value, onChange, label }: { options: { key: T; label: React.ReactNode }[]; value: T; onChange: (k: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-hairline/60 p-0.5">
      {options.map(o => (
        <button key={o.key} type="button" role="tab" aria-selected={o.key === value} onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1 text-sm ${o.key === value ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-body hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rule 4: the page's one commit, pinned to the bottom of the window, greyed with its reason. */
export function PinnedBar({ label, onClick, disabled, reason, busy }: { label: string; onClick: () => void; disabled?: boolean; reason?: string | null; busy?: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-end gap-4 border-t border-hairline bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {disabled && reason && <span className="mr-auto text-sm text-muted">{reason}</span>}
      <button type="button" onClick={onClick} disabled={disabled || busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:bg-hairline disabled:text-muted">
        {busy ? 'Working…' : label}
      </button>
    </div>
  );
}

/** A text field on a row that saves when you leave it (rule 5). `onSave` is called with the new value on blur. */
export function FieldRow({ label, value, onSave, placeholder, type = 'text', disabled }: { label: string; value: string; onSave: (v: string) => Promise<void> | void; placeholder?: string; type?: string; disabled?: boolean }) {
  const [v, setV] = React.useState(value);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // 2026-11-24 (owner, w8: "I do not see a save option" — two fields read only "Not saved"): the reason is shown.
  const [why, setWhy] = React.useState('');
  React.useEffect(() => { setV(value); }, [value]);
  return (
    <div>
    <label className="flex min-h-[44px] items-center gap-3 px-4 py-2">
      <span className="w-40 shrink-0 text-sm text-ink">{label}</span>
      <input type={type} value={v} placeholder={placeholder} disabled={disabled} onChange={e => setV(e.target.value)}
        onBlur={async () => {
          if (v === value) return;
          setState('saving');
          try { await onSave(v); setState('saved'); setWhy(''); }
          catch (e) { setState('error'); setWhy(e instanceof Error && e.message ? e.message : 'It could not be saved. Try again.'); }
        }}
        className="min-w-0 flex-1 rounded-md border border-hairline bg-ground/40 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent" />
      <span className="w-16 shrink-0 text-right text-xs text-muted" aria-live="polite">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? <span className="text-safety">Not saved</span> : ''}</span>
    </label>
    {state === 'error' && why && <p role="alert" className="px-4 pb-2 pl-[11.5rem] text-xs text-safety">{why}</p>}
    </div>
  );
}

/** Rule 1 (website Apple pass): no Refresh buttons — a page loads fresh when you open it and again when you come back
 *  to its window. `load` should be stable (useCallback). */
export function useReloadOnFocus(load: () => void) {
  React.useEffect(() => {
    let last = Date.now();
    const on = () => { if (document.visibilityState === 'visible' && Date.now() - last > 15_000) { last = Date.now(); load(); } };
    window.addEventListener('focus', on); document.addEventListener('visibilitychange', on);
    return () => { window.removeEventListener('focus', on); document.removeEventListener('visibilitychange', on); };
  }, [load]);
}

/** A sheet that truly commits (rule 5): Cancel and the commit at its top, like the phone's pageSheet. */
export function Sheet({ title, onCancel, onDone, doneLabel = 'Save', doneDisabled, busy, children }: {
  title: string; onCancel: () => void; onDone?: () => void; doneLabel?: string; doneDisabled?: boolean; busy?: boolean; children: React.ReactNode;
}) {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onCancel}>
      <div className="flex max-h-[84vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-ground shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3">
          <button type="button" onClick={onCancel} className="text-sm text-accent-ink hover:underline">Cancel</button>
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {onDone ? <button type="button" onClick={onDone} disabled={doneDisabled || busy} className="text-sm font-semibold text-accent-ink hover:underline disabled:text-muted disabled:no-underline">{busy ? 'Saving…' : doneLabel}</button> : <span className="w-12" />}
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
