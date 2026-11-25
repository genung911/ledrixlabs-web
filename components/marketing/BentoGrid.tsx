'use client';

// §3 — bento grid of the things that actually matter, on light cards with hairline
// borders and a restrained hover lift (monochrome — no accent bloom). Honest,
// feature-grounded claims — no fabricated accuracy stats, no "monitoring device" framing.
// Deliberately NO phone screenshots here: HowItWorks (§2) owns the process-in-screenshots
// story; this section is proof and qualities, told through data artifacts (a rendered
// structured finding, the priority pills, the deliverable cover) so the two sections
// don't read as the same thing twice.
import type { ReactNode } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';
import { LedrixDelta } from '../LedrixDelta';

type Tile = {
  className: string;
  kicker?: string;
  stat?: string;
  title: string;
  body?: string;
  points?: string[];
  img?: string;
  draft?: boolean; // lead tile: the rendered structured-finding card (what a capture becomes)
  pills?: { label: string; color: string }[]; // priority-levels tile: the real pills, not a sentence
  shot?: { src: string; alt: string }; // a single supporting artifact image (e.g. the PDF cover)
  chips?: { label: string; on?: boolean }[]; // template tile: checklist items the house turned on (owner 2026-11-24, replaces the VAL tile)
  devices?: boolean; // the "two devices, one brain" mark
};

// Two phone outlines flanking the Ledrix delta — "every device, one brain." Hand-drawn SVG
// to match the site's icon language (no icon-library dependency). Devices neutral; the
// brain/delta is the one place blue belongs here (it's the AI).
function DevicesOneBrain() {
  return (
    <div className="relative scale-125 lg:scale-150" style={{ width: 180, height: 72 }}>
      <svg width="180" height="72" viewBox="0 0 180 72" fill="none" aria-hidden className="absolute inset-0">
        {/* connecting lines */}
        <path d="M46 36 H80" stroke="#C7D0D6" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M134 36 H100" stroke="#C7D0D6" strokeWidth="1.5" strokeDasharray="3 4" />
        {/* left phone (iOS-ish) */}
        <rect x="14" y="8" width="32" height="56" rx="7" stroke="#0A0F14" strokeWidth="2" />
        <rect x="20" y="16" width="20" height="34" rx="1.5" stroke="#0A0F14" strokeOpacity="0.35" strokeWidth="1.4" />
        {/* right phone (Android-ish, squarer corners) */}
        <rect x="134" y="8" width="32" height="56" rx="3" stroke="#0A0F14" strokeWidth="2" />
        <rect x="140" y="16" width="20" height="34" rx="1.5" stroke="#0A0F14" strokeOpacity="0.35" strokeWidth="1.4" />
        {/* the brain's glow pedestal */}
        <circle cx="90" cy="36" r="19" fill="#217BE8" fillOpacity="0.08" stroke="#217BE8" strokeOpacity="0.35" strokeWidth="1.25" />
      </svg>
      {/* the brain — the real Ledrix delta mark, centered on the pedestal */}
      <div className="absolute" style={{ left: 90 - 11, top: 36 - 11 }}>
        <LedrixDelta size={22} sheen />
      </div>
    </div>
  );
}

// The lead tile's artifact: a structured finding rendered as data, not a phone screenshot.
// Content mirrors a real drafted finding from the app (same fields, same HITL verbs) so the
// claim stays honest — this is exactly what a capture becomes.
function StructuredFindingCard() {
  const row = (label: string, value: ReactNode) => (
    // Stacks label-over-value when the tile is narrow; side-by-side once there's room —
    // the fixed label column was clipping ("LOCATIO…") on small screens.
    <div className="flex flex-col gap-1 border-t border-hairline py-3.5 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:w-[100px]">{label}</span>
      <span className="min-w-0 text-base leading-snug text-ink">{value}</span>
    </div>
  );
  return (
    <div className="rounded-xl border border-hairline bg-[#F7F9FB] p-5 sm:p-6">
      <div className="rounded-lg border border-hairline bg-surface p-6 shadow-[0_16px_44px_-30px_rgba(10,15,20,0.5)] sm:p-7">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Ledrix Finding · Drafted</span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#22C55E]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" /> Live
          </span>
        </div>
        <div className="mt-4 text-xl font-bold leading-snug text-ink">Corrosion at water heater connection</div>
        <div className="mt-5">
          {row('Filed on', 'Water Heater › Water Heater')}
          {row('Location', 'Utility closet')}
          {row('Priority', (
            <span className="rounded-full border px-3 py-1 font-mono text-xs font-bold" style={{ color: '#EAB308', borderColor: '#EAB30855', backgroundColor: '#EAB30814' }}>
              MINOR REPAIR
            </span>
          ))}
          {row('Spec', 'Tank — natural gas, 50 gallon')}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-5">
          {['Reject', 'Adjust', 'Confirm'].map((v) => (
            <span key={v} className={`rounded-lg border py-2.5 text-center font-mono text-xs font-bold uppercase tracking-[0.1em] ${v === 'Confirm' ? 'border-ink bg-ink text-white' : 'border-hairline text-muted'}`}>
              {v}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted">One shutter press · zero typing</div>
    </div>
  );
}

// Exact palette from src/core/theme/SeverityConfig.ts — keep in sync with the app.
const PRIORITY_PILLS = [
  { label: 'MAJOR REPAIR',    color: '#F97316' },
  { label: 'MINOR REPAIR',    color: '#EAB308' },
  { label: 'MAINT & IMPROVE', color: '#64748B' },
  { label: 'TYPICAL WEAR',    color: '#38BDF8' },
  { label: 'GOOD',            color: '#22C55E' },
];
const SAFETY_COLOR = '#D9706E';

const TILES: Tile[] = [
  {
    className: 'md:col-span-2 md:row-span-2',
    kicker: 'In the field',
    draft: true,
    title: 'Every photo becomes structured data.',
    points: [
      'Not a photo note to sort later — a finding with system, location, priority, and the spec behind it.',
      'Drafted while you’re still standing in front of it.',
      'No evening typing up the report.',
    ],
  },
  {
    className: '',
    stat: '100%',
    title: 'Inspector-confirmed',
    body: 'Ledrix proposes; you Confirm, Adjust, or Reject. What you approve is exactly what ships — never quietly rewritten.',
  },
  { className: '', stat: '5', title: 'Priority levels', pills: PRIORITY_PILLS },
  {
    className: '',
    kicker: 'Your company',
    title: 'Your template, your checklist.',
    body: 'Scope is built from your company’s template and adapts to the house — gas or all-electric, crawlspace or slab.',
    chips: [
      { label: 'Gas furnace', on: true }, { label: 'Heat pump' }, { label: 'Crawlspace', on: true },
      { label: 'Slab' }, { label: 'Detached garage', on: true },
    ],
  },
  {
    className: '',
    kicker: 'Deliverable',
    title: 'A report clients read',
    body: 'A clean, professional PDF and a live client home portal — generated, not assembled.',
    shot: { src: '/screenshots/site-2026-11/s6-report-cover.jpg', alt: 'The Ledrix inspection report cover page' },
  },
  {
    // Single-width so the six tiles tessellate exactly (2×2 lead + 2 stacked right = rows 1-2;
    // these three complete row 3). A 2-wide tile here left a permanent hole in the grid.
    className: '',
    kicker: 'Everywhere',
    title: 'Every device, one brain.',
    body: 'Old phones and new all run the same Ledrix Intelligence — built on a cloud-baseline architecture, not tied to whatever hardware you carry.',
    devices: true,
  },
];

export function BentoGrid() {
  return (
    <section id="features" className="relative bg-ground py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Why Ledrix"
          title="Less paperwork. More caught."
          sub="The backup that drafts, structures, and delivers — so you spend your attention on the structure, not the keyboard."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[minmax(15rem,auto)]"
        >
          {TILES.map((t, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface p-7 shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/20 lg:p-8 ${t.className}`}
            >
              {(t.kicker || t.stat) && (
                <div className="relative">
                  {t.kicker && (
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted">{t.kicker}</span>
                  )}
                  {t.stat && (
                    <div className="text-6xl font-bold tracking-tight text-ink lg:text-7xl">
                      {t.stat}
                    </div>
                  )}
                </div>
              )}

              <div className={`relative flex min-h-0 flex-1 flex-col justify-center ${t.kicker || t.stat ? 'mt-5' : ''}`}>
                <h3 className="text-xl font-bold text-ink lg:text-2xl">{t.title}</h3>
                {t.body && <p className="mt-3 text-base leading-relaxed text-body">{t.body}</p>}
                {t.pills && (
                  <div className="mt-5 flex flex-1 flex-col justify-center gap-4">
                    <div className="flex flex-wrap gap-2">
                      {t.pills.map((p) => (
                        <span
                          key={p.label}
                          className="rounded-full border px-3.5 py-1.5 font-mono text-xs font-bold tracking-[0.02em]"
                          style={{ color: p.color, borderColor: `${p.color}55`, backgroundColor: `${p.color}14` }}
                        >
                          {p.label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="rounded-full border border-dashed px-3.5 py-1.5 font-mono text-xs font-bold tracking-[0.02em]"
                        style={{ color: SAFETY_COLOR, borderColor: `${SAFETY_COLOR}70`, backgroundColor: `${SAFETY_COLOR}14` }}
                      >
                        + SAFETY
                      </span>
                      <span className="text-sm text-muted">flagged separately — orthogonal to priority</span>
                    </div>
                  </div>
                )}
                {t.points && (
                  <ul className="mt-4 flex flex-col gap-3">
                    {t.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink" />
                        <span className="text-base leading-relaxed text-body">{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {t.chips && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-6">
                    {t.chips.map((c) => (
                      <span key={c.label}
                        className={`rounded-full border px-3 py-1 text-sm ${c.on ? 'border-[#217BE8] text-[#217BE8]' : 'border-hairline text-muted'}`}>
                        {c.on ? '✓ ' : ''}{c.label}
                      </span>
                    ))}
                  </div>
                )}
                {t.devices && (
                  <div className="mt-auto flex justify-center pt-6 opacity-90">
                    <DevicesOneBrain />
                  </div>
                )}
                {t.shot && (
                  /* Not a full phone screen (a cropped review card / a document cover) — a flat
                     screenshot frame reads honestly where a bezel + notch would look mangled.
                     Bottom-pinned so visuals align across a row even when the grid stretches. */
                  <div className="mt-auto pt-5">
                    <div className="relative aspect-[1284/1530] w-full overflow-hidden rounded-xl border border-hairline shadow-[0_14px_36px_-24px_rgba(10,15,20,0.45)]">
                      <Image src={t.shot.src} alt={t.shot.alt} fill className="object-cover object-top" sizes="(max-width:768px) 100vw, 33vw" />
                    </div>
                  </div>
                )}
                {t.draft && (
                  /* Vertically centered in the leftover row-span space — the artifact floats in
                     the tile instead of leaving a dead band beneath it. */
                  <div className="flex flex-1 items-center justify-center py-6">
                    <div className="w-full max-w-[440px] lg:max-w-[540px]">
                      <StructuredFindingCard />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
