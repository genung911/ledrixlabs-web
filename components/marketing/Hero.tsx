'use client';

// Hero — bold typography over the animated grid, staggered reveal, glowing CTAs.
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[92svh] items-center overflow-hidden bg-ink text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col items-center">
          {/* eyebrow */}
          <motion.span
            variants={fadeUp}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
            Ledrix Intelligence
          </motion.span>

          {/* headline */}
          <motion.h1
            variants={fadeUp}
            className="max-w-4xl text-5xl font-bold leading-[1.04] tracking-tight [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            Inspect the house, not the{' '}
            <span className="bg-gradient-to-r from-accent-soft via-accent to-accent-soft bg-clip-text text-transparent [text-shadow:0_0_40px_rgba(0,243,255,0.25)]">
              template
            </span>
            .
          </motion.h1>

          {/* subhead */}
          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 [text-wrap:balance] md:text-xl"
          >
            Ledrix drafts the finding the moment you capture the photo — you confirm, adjust, or reject.
            Inspector-verified findings, an instant legal report, and a client home portal.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <GlowButton href="#demo" variant="primary">
              Request a demo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="transition-transform duration-300 group-hover:translate-x-0.5">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </GlowButton>
            <GlowButton href="#how" variant="ghost">
              See how it works
            </GlowButton>
          </motion.div>

          {/* trust line */}
          <motion.p variants={fadeUp} className="mt-12 text-xs uppercase tracking-[0.25em] text-slate-600">
            Built for home inspectors · iOS &amp; Android · Powered by Ledrix Intelligence
          </motion.p>
        </motion.div>
      </div>

      {/* fade into the next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-b from-transparent to-ink" />
    </section>
  );
}
