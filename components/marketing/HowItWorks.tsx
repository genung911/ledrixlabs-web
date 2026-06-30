'use client';

// §2 — the inspection pipeline, as a staggered 4-step reveal. Capture → Draft →
// Confirm → Deliver. (Human-in-the-loop: Ledrix proposes, the inspector confirms.)
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';

const STEPS = [
  {
    n: '01',
    title: 'Capture',
    body: 'Point your camera. Ledrix Vision reads the structure the way you do — roof to crawlspace.',
    icon: (
      <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L18 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
    ),
  },
  {
    n: '02',
    title: 'Draft',
    body: 'Ledrix Intelligence drafts the finding the instant you shoot — system, priority, and the spec behind it.',
    icon: <path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3Z" />,
  },
  {
    n: '03',
    title: 'Confirm',
    body: 'You stay the source of truth — Confirm, Adjust, or Reject every finding, by tap or by voice.',
    icon: <path d="M20 6 9 17l-5-5" />,
  },
  {
    n: '04',
    title: 'Deliver',
    body: 'It compiles into a clean, legal PDF and a client home portal — before you leave the driveway.',
    icon: <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4Z M9 13l2 2 4-4" />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative bg-ink py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="How it works"
          title="From the photo to the report, in one pass."
          sub="Ledrix proposes; you confirm. The human-in-the-loop truth engine is the product — not a setting."
        />

        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STEPS.map((s) => (
            <motion.li
              key={s.n}
              variants={fadeUp}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-colors duration-300 hover:border-accent/30"
            >
              {/* hover glow wash */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-widest text-accent/70">{s.n}</span>
                <svg
                  width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  className="text-accent transition-transform duration-300 group-hover:scale-110"
                >
                  {s.icon}
                </svg>
              </div>

              <h3 className="mt-6 text-xl font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
