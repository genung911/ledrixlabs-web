'use client';

// §3 — bento grid of the things that actually matter, on light cards with hairline
// borders and a restrained hover lift (monochrome — no accent bloom). Image-first where
// it counts; the lead tile reflows its finding into scannable bullets. Honest,
// feature-grounded claims — no fabricated accuracy stats, no "monitoring device" framing.
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
  imgs?: { src: string; alt: string }[]; // lead tile: capture → drafted finding, side by side
  pills?: { label: string; color: string }[]; // priority-levels tile: the real pills, not a sentence
  shot?: { src: string; alt: string }; // a single supporting screenshot (e.g. the real review card)
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
    <svg width="180" height="72" viewBox="0 0 180 72" fill="none" aria-hidden>
      {/* connecting lines */}
      <path d="M46 36 H80" stroke="#C7D0D6" strokeWidth="1.5" strokeDasharray="3 4" />
      <path d="M134 36 H100" stroke="#C7D0D6" strokeWidth="1.5" strokeDasharray="3 4" />
      {/* left phone (iOS-ish) */}
      <rect x="14" y="8" width="32" height="56" rx="7" stroke="#0A0F14" strokeWidth="2" />
      <rect x="20" y="16" width="20" height="34" rx="1.5" stroke="#0A0F14" strokeOpacity="0.35" strokeWidth="1.4" />
      {/* right phone (Android-ish, squarer corners) */}
      <rect x="134" y="8" width="32" height="56" rx="3" stroke="#0A0F14" strokeWidth="2" />
      <rect x="140" y="16" width="20" height="34" rx="1.5" stroke="#0A0F14" strokeOpacity="0.35" strokeWidth="1.4" />
      {/* the brain — Ledrix delta, centered */}
      <circle cx="90" cy="36" r="19" fill="#217BE8" fillOpacity="0.08" stroke="#217BE8" strokeOpacity="0.35" strokeWidth="1.25" />
      <path d="M90 25 L100 47 H80 Z" stroke="#217BE8" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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
    imgs: [
      { src: '/screenshots/capture-analyze.jpg', alt: 'Isolating a defect in the Ledrix camera' },
      { src: '/screenshots/finding-drafted.jpg', alt: 'The Ledrix Finding drafted and ready to confirm' },
    ],
    title: 'The finding, drafted the moment you shoot.',
    points: [
      'Every capture becomes a structured finding — system, location, priority, and the spec behind it.',
      'Drafted while you’re still standing in front of it.',
      'No evening typing up the report.',
    ],
  },
  {
    className: '',
    stat: '100%',
    title: 'Inspector-confirmed',
    body: 'Ledrix proposes; you Confirm, Adjust, or Reject. Nothing ships you didn’t sign off on.',
    shot: { src: '/screenshots/review-card.jpg', alt: 'A Ledrix finding awaiting Reject, Edit, Combine, or Confirm' },
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
    className: 'md:col-span-2',
    kicker: 'Everywhere',
    title: 'Every device, one brain.',
    body: 'iOS and Android, old phones and new — every device runs the same Ledrix Intelligence.',
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
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-hairline bg-surface p-7 shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/20 ${t.className}`}
            >
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

              <div className="relative mt-6">
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
                  <div className="mt-5 flex justify-start">
                    <StaticValOrb />
                  </div>
                )}
                {t.devices && (
                  <div className="mt-6 flex justify-center opacity-90">
                    <DevicesOneBrain />
                  </div>
                )}
                {t.shot && (
                  <div className="relative mt-5 aspect-[1284/1530] w-full overflow-hidden rounded-xl border border-hairline ring-1 ring-white/60">
                    <Image src={t.shot.src} alt={t.shot.alt} fill className="object-contain" sizes="(max-width:768px) 100vw, 33vw" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-hairline to-transparent" />
                  </div>
                )}
                {t.imgs && (
                  <div className="relative mt-6 grid grid-cols-2 gap-3">
                    {t.imgs.map((im, j) => (
                      <div key={im.src} className="flex flex-col gap-2">
                        <span className="self-start rounded-full bg-ink px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white">
                          {j === 0 ? 'Shoot' : 'Drafted'}
                        </span>
                        <div className="relative h-64 overflow-hidden rounded-xl border border-hairline ring-1 ring-white/60 sm:h-72">
                          <Image src={im.src} alt={im.alt} fill className="object-cover object-bottom" sizes="(max-width:768px) 50vw, 33vw" />
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-hairline to-transparent" />
                        </div>
                      </div>
                    ))}
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
