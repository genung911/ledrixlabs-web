'use client';

// VisionManifesto — the opener: the Ledrix mark over a soft blue glow, above minimal,
// Tesla-clean white text on dark. (Owner 2026-10-19: the dollhouse cutaway read as a 3D house,
// which the site doesn't show — the logo stands in until a replacement image is chosen.)
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';
import { LedrixDelta } from '@/components/LedrixDelta';

export function VisionManifesto() {
  return (
    <section
      id="vision"
      className="relative isolate flex min-h-[86vh] flex-col items-center justify-start overflow-hidden bg-dark text-white"
    >
      {/* soft brand glow behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 34%, rgba(33,123,232,0.20), transparent 70%)' }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-28 text-center sm:pt-32">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col items-center">
          <motion.div variants={fadeUp} className="mb-10">
            <LedrixDelta size={168} sheen className="h-[120px] w-[120px] sm:h-[168px] sm:w-[168px]" />
          </motion.div>

          <motion.span
            variants={fadeUp}
            className="mb-6 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70"
          >
            <span className="h-px w-6 bg-white/40" />
            The future of inspection
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="text-5xl font-bold leading-[1.03] tracking-tight [text-shadow:0_2px_28px_rgba(0,0,0,0.6)] [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            Inspect the home, not the template.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-xl text-lg leading-relaxed text-white/90 [text-shadow:0_1px_18px_rgba(0,0,0,0.7)] [text-wrap:balance]"
          >
            You look, you talk, you confirm — Ledrix drafts the finding the moment you capture it, and writes the report.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
            <GlowButton href="#demo" variant="primary" tone="dark">
              Request a demo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="transition-transform duration-300 group-hover:translate-x-0.5">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </GlowButton>
            <GlowButton href="#how" variant="ghost" tone="dark">
              See how it works
            </GlowButton>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
