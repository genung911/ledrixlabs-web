'use client';

// Hero — THE dark full-bleed "hero moment" on an otherwise light page. A real home
// photo sits behind a near-black scrim, white type reverses out, and the accent word
// glows cyan. The subhead is reflowed into scannable bullets (the finding-card voice).
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';
import { GridBackground } from './ui/GridBackground';

const POINTS = [
  'Ledrix drafts the finding the moment you capture the photo — you confirm, adjust, or reject.',
  'Always inspector-verified findings.',
  'An instant legal report and a client home portal to blow agents and clients away.',
];

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[92svh] items-center overflow-hidden bg-dark text-white">
      {/* full-bleed photograph behind a near-black scrim */}
      <div className="absolute inset-0 -z-20">
        <Image src="/cover-living-room.JPG" alt="" fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,15,17,0.86),rgba(10,15,17,0.78)_40%,rgba(10,15,17,0.94))]" />
      </div>
      <GridBackground variant="dark" className="-z-10 opacity-70" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} className="flex flex-col items-center">
          {/* eyebrow */}
          <motion.span
            variants={fadeUp}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
            Ledrix Intelligence
          </motion.span>

          {/* headline */}
          <motion.h2
            variants={fadeUp}
            className="max-w-4xl text-5xl font-bold leading-[1.04] tracking-tight [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            The future of inspecting is{' '}
            <span className="bg-gradient-to-r from-accent-soft via-accent to-accent-soft bg-clip-text text-transparent [text-shadow:0_0_40px_rgba(0,243,255,0.25)]">
              finally here
            </span>
            !
          </motion.h2>

          {/* subhead → bullets */}
          <motion.ul variants={fadeUp} className="mx-auto mt-8 flex max-w-xl flex-col gap-3 text-left">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-[8px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
                <span className="text-lg leading-relaxed text-slate-200 [text-wrap:balance]">{p}</span>
              </li>
            ))}
          </motion.ul>

          {/* CTAs */}
          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
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

          {/* trust line */}
          <motion.p variants={fadeUp} className="mt-12 font-mono text-xs uppercase tracking-[0.25em] text-slate-500">
            Built for home inspectors · iOS &amp; Android · Powered by Ledrix Intelligence
          </motion.p>
        </motion.div>
      </div>

      {/* fade the dark band back into the light ground on both edges */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-ground to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-b from-transparent to-ground" />
    </section>
  );
}
