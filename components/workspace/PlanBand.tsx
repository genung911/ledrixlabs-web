'use client';

// The plan band at the top of every workspace page (b7; plan mockup 13QNuHGzRGv2t2GdyextR4 screen 6, "Approved"):
// yellow for the 7 days of grace after a failed payment, red once the company is read-only, blue to the owner in the
// last 3 days of a trial. Owners get the action; everyone else is told who can. The server enforces read-only (#158);
// this only says so.
import { useEffect, useState } from 'react';
import { loadPlanState } from '@/lib/billing/api';
import { planBand, type Band } from '@/lib/billing/model';

const TONE: Record<string, string> = {
  blue: 'border-accent/30 bg-accent/10', yellow: 'border-[#D98C00]/30 bg-[#D98C00]/12', red: 'border-[#C0392B]/30 bg-[#C0392B]/10',
};

export function PlanBand() {
  const [band, setBand] = useState<Band>(null);
  useEffect(() => { loadPlanState().then(p => setBand(planBand(p, Date.now()))).catch(() => setBand(null)); }, []);
  if (!band) return null;
  return (
    <div role={band.tone === 'red' ? 'alert' : 'status'} className={`mx-4 mt-4 rounded-xl border px-4 py-3 text-sm text-ink sm:mx-6 ${TONE[band.tone]}`}>
      <b>{band.title}</b> {band.body}{' '}
      {band.action && <a href={band.action.href} className="font-semibold text-accent-ink hover:underline">{band.action.label}</a>}
    </div>
  );
}
