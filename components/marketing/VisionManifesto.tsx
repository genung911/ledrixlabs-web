'use client';

// VisionManifesto — the "zoom out" beat before the CTA. Sells what Ledrix means for the profession, not
// just the product: a grounded future framing (eyes amplified, judgment over data-entry), no hype. Quiet,
// centered, large type on a soft accent glow — matches the Hero's voice and motion.
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { LedrixEye } from '@/components/LedrixEye';
import { GlowButton } from './ui/GlowButton';

export function VisionManifesto() {
  return (
    <section id="vision" className="relative isolate overflow-hidden bg-ink pb-28 pt-36 text-white sm:pb-36 sm:pt-44">
      {/* soft accent glow behind the statement */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[28rem] w-[44rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[140px]" />

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center"
      >
        {/* Ledrix Vision eye — the mark for this "eyes, amplified" beat */}
        <motion.div variants={fadeUp} className="mb-8 drop-shadow-[0_0_28px_rgba(0,243,255,0.4)]">
          <LedrixEye size={112} />
        </motion.div>

        <motion.span
          variants={fadeUp}
          className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
          The future of inspection
        </motion.span>

        <motion.h2
          variants={fadeUp}
          className="text-4xl font-bold leading-[1.06] tracking-tight [text-wrap:balance] sm:text-5xl md:text-6xl"
        >
          The best inspection isn&apos;t a longer report. It&apos;s your{' '}
          <span className="bg-gradient-to-r from-accent-soft via-accent to-accent-soft bg-clip-text text-transparent [text-shadow:0_0_40px_rgba(0,243,255,0.25)]">
            eyes, amplified
          </span>
          .
        </motion.h2>

        <motion.p
          variants={fadeUp}
          className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-400 [text-wrap:balance] md:text-xl"
        >
          For a century, the job meant a clipboard and a two-hour write-up at the kitchen table. Ledrix gives
          that time back — you look, you talk, you confirm, and the documentation writes itself. Inspection
          stops being data entry and becomes what it always was: expert judgment about a home.
        </motion.p>

        {/* CTAs — this section is the page opener, so it drives action above the fold */}
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
      </motion.div>
    </section>
  );
}
