'use client';

// VisionManifesto — the light, image-first opener. Big airy headline, the accent word
// in a deeper-cyan gradient, the "eyes, amplified" beat reflowed into scannable bullets
// (the in-app finding-card voice), and a large piece of real photography leading the eye.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { LedrixEye } from '@/components/LedrixEye';
import { GlowButton } from './ui/GlowButton';
import { GridBackground } from './ui/GridBackground';

const POINTS = [
  'Your eyes and mind locked onto the structure — not a screen. Ledrix keeps you vision first.',
  'Sorting, organizing, and checklist tracking — automated in the background.',
  'Never miss a defect, without ever forcing you to look down.',
  'Stop managing a template. Bring expert judgment back to the forefront.',
];

export function VisionManifesto() {
  return (
    <section id="vision" className="relative isolate overflow-hidden bg-ground pb-24 pt-36 sm:pb-32 sm:pt-44">
      <GridBackground variant="light" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Left — the statement, reflowed to a finding card: eyebrow → headline → bullets */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col items-start"
        >
          <motion.div variants={fadeUp} className="mb-6 flex items-center gap-3">
            <LedrixEye size={44} color="#0891A8" />
            <span className="inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-ink">
              <span className="h-px w-6 bg-accent-ink/70" />
              The future of inspection
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-5xl font-bold leading-[1.02] tracking-tight text-ink [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            Inspect the home, not the{' '}
            <span className="bg-gradient-to-r from-[#0aa8c4] via-accent-ink to-[#066f82] bg-clip-text text-transparent">
              template
            </span>
            .
          </motion.h1>

          <motion.ul variants={fadeUp} className="mt-9 flex flex-col gap-3.5">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-ink shadow-[0_0_8px_rgba(8,145,168,0.5)]" />
                <span className="text-base leading-relaxed text-body md:text-lg">{p}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
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

        {/* Right — the lead photograph. Image-first, hairline-framed, soft cyan bloom. */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="relative"
        >
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-accent/[0.10] blur-[80px]" />
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-hairline bg-surface shadow-[0_30px_80px_-40px_rgba(10,15,20,0.45)] ring-1 ring-white/60">
            <Image
              src="/cover-exterior.JPG"
              alt="A home exterior, inspected with Ledrix"
              fill
              priority
              className="object-cover"
              sizes="(max-width:1024px) 100vw, 46vw"
            />
            {/* precise cyan hairline accent along the top edge */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
