'use client';

// VisionManifesto — the full-bleed image opener (Tesla model-hero energy). A single
// large photograph of the house does all the talking; a dark legibility scrim lets the
// headline reverse out in white. Monochrome chrome — no accent color, the color comes
// from the photo. Copy is verbatim; the finding-card bullets stay (dots recolored to
// silver so they read on the image).
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';
import { VisionOverlay } from './ui/VisionOverlay';

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
      className="relative isolate flex min-h-[85vh] items-center justify-center overflow-hidden bg-dark text-white"
    >
      {/* full-bleed photograph */}
      <div className="absolute inset-0 -z-20">
        <Image
          src="/cover-exterior.JPG"
          alt="A home exterior, inspected with Ledrix"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* legibility scrim — darkest through the centre where the type sits */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,14,0.55)_0%,rgba(8,12,14,0.72)_45%,rgba(8,12,14,0.82)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,12,14,0.35)_0%,transparent_65%)]" />
      </div>

      {/* AI-vision layer — the one place the accent blue lives (the product's eye) */}
      <VisionOverlay />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-24 pb-16 text-center">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col items-center"
        >
          <motion.span
            variants={fadeUp}
            className="mb-7 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-white/60"
          >
            <span className="h-px w-6 bg-white/40" />
            The future of inspection
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="text-5xl font-bold leading-[1.03] tracking-tight text-white [text-wrap:balance] sm:text-6xl md:text-7xl"
          >
            Inspect the home, not the template.
          </motion.h1>

          <motion.ul variants={fadeUp} className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 text-left">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/70" />
                <span className="text-base leading-relaxed text-white/85 md:text-lg">{p}</span>
              </li>
            ))}
          </motion.ul>

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
        </motion.div>
      </div>
    </section>
  );
}
