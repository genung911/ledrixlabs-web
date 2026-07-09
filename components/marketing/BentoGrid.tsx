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
  orb?: boolean; // the VAL mark, in its glass orb shell
  devices?: boolean; // the "two devices, one brain" mark
};

// A static rendition of ValOrbVoice's "light" glass shell (no interactivity needed here —
// this is a feature-grid illustration, not the live VAL button).
function StaticValOrb() {
  return (
    <div
      className="flex h-20 w-20 items-center justify-center rounded-full"
      style={{
        background: 'radial-gradient(125% 130% at 50% 0%, rgba(255,255,255,0.96), rgba(238,244,251,0.86))',
        border: '1.25px solid rgba(33,123,232,0.4)',
        boxShadow: '0 10px 30px rgba(12,28,54,0.14), 0 2px 8px rgba(12,28,54,0.08), 0 0 20px rgba(33,123,232,0.2)',
      }}
    >
      <LedrixDelta size={30} sheen />
    </div>
  );
}

// Two phone outlines flanking the Ledrix delta — "every device, one brain." Hand-drawn SVG
// to match the site's icon language (no icon-library dependency). Devices neutral; the
// brain/delta is the one place blue belongs here (it's the AI).
function DevicesOneBrain() {
  return (
    <div className="relative" style={{ width: 180, height: 72 }}>
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
    <div className="flex items-baseline gap-3 border-t border-hairline py-2.5 first:border-t-0">
      <span className="w-[76px] flex-shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted">{label}</span>
      <span className="min-w-0 text-[13px] leading-snug text-ink">{value}</span>
    </div>
  );
  return (
    <div className="rounded-xl border border-hairline bg-[#F7F9FB] p-4 sm:p-5">
      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_16px_44px_-30px_rgba(10,15,20,0.5)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-muted">Ledrix Finding · Drafted</span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#22C55E]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" /> Live
          </span>
        </div>
        <div className="mt-3 text-[15px] font-bold leading-snug text-ink">Moisture-damaged wall finish at tub side</div>
        <div className="mt-4">
          {row('System', 'Interior · Bathroom')}
          {row('Location', 'Wall adjacent to tub/shower')}
          {row('Priority', (
            <span className="rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold" style={{ color: '#64748B', borderColor: '#64748B55', backgroundColor: '#64748B14' }}>
              MAINT &amp; IMPROVE
            </span>
          ))}
          {row('Spec', 'Painted drywall — wet-area side')}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-4">
          {['Reject', 'Adjust', 'Confirm'].map((v) => (
            <span key={v} className={`rounded-lg border py-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${v === 'Confirm' ? 'border-ink bg-ink text-white' : 'border-hairline text-muted'}`}>
              {v}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-muted">One shutter press · zero typing</div>
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
  { className: '', kicker: 'Hands-free', title: 'Log by voice with VAL', body: 'Speak the finding; VAL files it to the right system and waits for your confirm.', orb: true },
  {
    className: '',
    kicker: 'Deliverable',
    title: 'A report clients read',
    body: 'A clean, legal PDF and a live client home portal — generated, not assembled.',
    shot: { src: '/sample-pdf-cover.jpg', alt: 'The Ledrix inspection report cover page' },
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
          className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[minmax(11rem,auto)]"
        >
          {TILES.map((t, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface p-7 shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/20 ${t.className}`}
            >
              {(t.kicker || t.stat) && (
                <div className="relative">
                  {t.kicker && (
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{t.kicker}</span>
                  )}
                  {t.stat && (
                    <div className="text-5xl font-bold tracking-tight text-ink">
                      {t.stat}
                    </div>
                  )}
                </div>
              )}

              <div className={`relative flex min-h-0 flex-1 flex-col ${t.kicker || t.stat ? 'mt-4' : ''}`}>
                <h3 className="text-lg font-bold text-ink">{t.title}</h3>
                {t.body && <p className="mt-2 text-sm leading-relaxed text-body">{t.body}</p>}
                {t.pills && (
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {t.pills.map((p) => (
                        <span
                          key={p.label}
                          className="rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.02em]"
                          style={{ color: p.color, borderColor: `${p.color}55`, backgroundColor: `${p.color}14` }}
                        >
                          {p.label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full border border-dashed px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.02em]"
                        style={{ color: SAFETY_COLOR, borderColor: `${SAFETY_COLOR}70`, backgroundColor: `${SAFETY_COLOR}14` }}
                      >
                        + SAFETY
                      </span>
                      <span className="text-xs text-muted">flagged separately — orthogonal to priority</span>
                    </div>
                  </div>
                )}
                {t.points && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {t.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5">
                        <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink" />
                        <span className="text-sm leading-relaxed text-body">{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {t.orb && (
                  <div className="mt-auto flex justify-start pt-6">
                    <StaticValOrb />
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
                    <div className="w-full max-w-[440px]">
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
