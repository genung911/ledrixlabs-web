'use client';

// VisionManifesto — the opener: a full-bleed black-and-white "dollhouse" cutaway of a home
// (every room and system seen at once) behind minimal, Tesla-clean text. The image is dark
// (night exterior) so the type is white over a top-weighted legibility scrim, and the pills
// use tone="dark". Copy stays minimal on purpose — the photo carries the section.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';

export function VisionManifesto() {
  return (
    <section
      id="vision"
      className="relative isolate flex min-h-[86vh] flex-col items-center justify-start overflow-hidden bg-dark text-white"
    >
      {/* full-bleed dollhouse cutaway — the whole home as a system */}
      <Image
        src="/dollhouse-cutaway.jpg"
        alt="A cutaway of a home — every room and system, seen at once"
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />
      {/* legibility scrim — darkest at the top where the type sits, lifts over the lit rooms, settles at the base */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(8,11,13,0.86)_0%,rgba(8,11,13,0.4)_34%,rgba(8,11,13,0.12)_58%,rgba(8,11,13,0.6)_100%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-28 text-center sm:pt-32">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col items-center">
          <motion.span
            variants={fadeUp}
            className="mb-6 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70"
          >
            <span className="h-px w-6 bg-white/40" />
            The future of inspection
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="text-5xl font-bold leading-[1.03] tracking-tight [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            Inspect the home, not the template.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 [text-wrap:balance]"
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
