'use client';

// VisionManifesto — the opener, now a Tesla-clean LIGHT stage with a coded isometric
// "digital-twin dollhouse" as the hero object. The monochrome home sits on a glowing blue
// grid with finding callouts pinned to it (the product's eye — the one place accent blue
// lives). Because the ground is light, the headline + subhead read in INK/dark. Copy is
// verbatim; the pill buttons and the finding-card bullets are preserved.
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';
import { IsometricHome } from './ui/IsometricHome';

const POINTS = [
  'Your eyes and mind locked onto the structure — not a screen. Ledrix keeps you vision first.',
  'Sorting, organizing, and checklist tracking — automated in the background.',
  'Never miss a defect, without ever forcing you to look down.',
  'Stop managing a template. Bring expert judgment back to the forefront.',
];

export function VisionManifesto() {
  return (
    <section
      id="vision"
      className="relative isolate flex min-h-[92vh] flex-col items-center overflow-hidden bg-ground text-ink"
    >
      {/* faint top bloom so the light stage has depth behind the nav */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,rgba(33,123,232,0.06),transparent_70%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pt-28 pb-6 text-center sm:pt-32">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col items-center"
        >
          <motion.span
            variants={fadeUp}
            className="mb-7 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-body"
          >
            <span className="h-px w-6 bg-muted" />
            The future of inspection
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="text-5xl font-bold leading-[1.03] tracking-tight text-ink [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            Inspect the home, not the template.
          </motion.h1>

          <motion.ul variants={fadeUp} className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 text-left">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted" />
                <span className="text-base leading-relaxed text-body md:text-lg">{p}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <GlowButton href="#demo" variant="primary" tone="light">
              Request a demo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="transition-transform duration-300 group-hover:translate-x-0.5">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </GlowButton>
            <GlowButton href="#how" variant="ghost" tone="light">
              See how it works
            </GlowButton>
          </motion.div>
        </motion.div>
      </div>

      {/* the hero object — the coded isometric digital-twin home */}
      <div className="relative z-0 -mt-2 w-full px-6 pb-16">
        <IsometricHome />
      </div>
    </section>
  );
}
