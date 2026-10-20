'use client';

// Small controls shared by the Templates overview and the template editor — same tokens as components/workspace/ui.
import { useEffect, useRef, useState } from 'react';

export const btn = {
  primary: 'inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  accent: 'inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  secondary: 'inline-flex items-center justify-center gap-1.5 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  ghost: 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-accent-ink hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  danger: 'inline-flex items-center justify-center gap-1.5 rounded-full bg-safety px-4 py-2 text-sm font-semibold text-white hover:bg-safety/90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-safety',
  icon: 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-body hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
};
export const field = 'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20';
export const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted';

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warn' | 'ok' | 'policy'; children: React.ReactNode }) {
  const t = { neutral: 'bg-ground text-body', accent: 'bg-accent/10 text-accent-ink', warn: 'bg-warn/20 text-ink', ok: 'bg-ok/15 text-ink', policy: 'bg-ink/10 text-ink' }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

export function Banner({ tone = 'info', title, children, actions }: { tone?: 'info' | 'warn' | 'error'; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  const t = { info: 'border-hairline bg-surface', warn: 'border-warn/50 bg-warn/10', error: 'border-safety/30 bg-safety/5' }[tone];
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${t}`}>
      <div className="min-w-0 text-body"><span className="font-semibold text-ink">{title}</span>{children && <> {children}</>}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button aria-label="Close" onClick={onClose} className={btn.icon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-body">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** A "⋯" menu. Disabled items stay visible with the reason, so a missing action is never a mystery. */
export function Menu({ items, label: aria = 'More actions' }: { items: Array<{ label: string; onSelect: () => void; disabled?: string | false; danger?: boolean }>; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button aria-label={aria} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={btn.icon}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-hairline bg-surface py-1 shadow-lg">
          {items.map(it => (
            <button key={it.label} role="menuitem" disabled={!!it.disabled} title={it.disabled || undefined}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={`block w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${it.danger ? 'text-safety' : 'text-ink'} hover:bg-ink/5 disabled:hover:bg-transparent`}>
              <span className={it.disabled ? 'opacity-40' : ''}>{it.label}</span>
              {it.disabled && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{it.disabled}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A list of short texts the owner edits as chips (choices, limitation reasons, finding shortcuts). */
export function ChipList({ values, onChange, addLabel, placeholder, disabled }: {
  values: string[]; onChange: (next: string[]) => void; addLabel: string; placeholder?: string; disabled?: boolean;
}) {
  const [adding, setAdding] = useState('');
  const add = () => { const v = adding.trim(); if (!v) return; if (!values.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]); setAdding(''); };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={`${v}_${i}`} className="inline-flex items-center gap-1 rounded-full border border-hairline bg-ground py-1 pl-3 pr-1 text-xs font-medium text-ink">
            {v}
            {!disabled && <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, k) => k !== i))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-ink/10 hover:text-ink">×</button>}
          </span>
        ))}
        {!values.length && <span className="text-xs text-muted">None yet.</span>}
      </div>
      {!disabled && (
        <div className="mt-2 flex gap-2">
          <input value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder ?? addLabel} aria-label={addLabel} className={`${field} py-1.5`} />
          <button onClick={add} disabled={!adding.trim()} className={btn.secondary}>Add</button>
        </div>
      )}
    </div>
  );
}

export function Toggle({ on, onChange, label: aria, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={aria} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${on ? 'bg-accent' : 'bg-hairline'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function timeAgo(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
