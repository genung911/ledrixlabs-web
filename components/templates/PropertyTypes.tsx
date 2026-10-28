'use client';
// What kind of property a template is for (2026-10-27) — a label and a filter, picked on the template's Overview and when
// it is created, shown on the Templates page. Not how an inspection runs: multi-unit inspecting is a separate proposal.
import { PROPERTY_TYPES, type PropertyTypeId } from '@/lib/templateBuilder/core/propertyTypes';

/** Multi-select chips. `value` in any order; `onChange` gets the canonical order. */
export function PropertyTypePicker({ value, onChange, disabled }: { value: readonly string[]; onChange: (next: PropertyTypeId[]) => void; disabled?: boolean }) {
  const on = new Set(value);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Property types">
      {PROPERTY_TYPES.map(p => (
        <button key={p.id} type="button" aria-pressed={on.has(p.id)} disabled={disabled} title={p.hint}
          onClick={() => onChange(PROPERTY_TYPES.map(x => x.id).filter(id => (id === p.id ? !on.has(id) : on.has(id))))}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${on.has(p.id) ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body hover:text-ink'}`}>
          {on.has(p.id) ? '✓ ' : ''}{p.label}
        </button>
      ))}
    </div>
  );
}
