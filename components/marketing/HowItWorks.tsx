'use client';

// §2 — the inspection pipeline, as a staggered 3-step reveal. Capture → Draft &
// Confirm → Deliver. Draft and Confirm are ONE step: Ledrix proposes, the inspector
// confirms (the human-in-the-loop truth engine — the middle tile, gently highlighted).
// Equal-height cards on one uniform image frame; the photo fills (cover) while the two
// UI screens are contained (nothing crops), so the mismatched sizes stay balanced.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';

const STEPS = [
  {
    n: '01',
    img: '/screenshots/IMG_5571.jpeg',
    fit: 'cover' as const,
    title: 'Capture',
    body: 'Point your camera. Ledrix Vision reads the structure the way you do — roof to crawlspace.',
    icon: (
      <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L18 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
    ),
  },
  {
    n: '02',
    img: '/screenshots/IMG_5575.jpeg',
    fit: 'contain' as const,
    title: 'Draft & Confirm',
    body: 'Ledrix Intelligence drafts the finding the instant you shoot — system, priority, and the spec behind it. You stay the source of truth: Confirm, Adjust, or Reject, by tap or by voice.',
    icon: <path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3Z M9.5 11.5l1.8 1.8 3.4-3.6" />,
    featured: true,
  },
  {
    n: '03',
    img: '/screenshots/IMG_5573.jpeg',
    fit: 'contain' as const,
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
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {STEPS.map((s) => (
            <motion.li
              key={s.n}
              variants={fadeUp}
              className={[
                'group relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-colors duration-300',
                s.featured
                  ? 'border-accent/40 bg-accent/[0.04] shadow-[0_0_50px_-18px] shadow-accent/40'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-accent/30',
              ].join(' ')}
            >
              {/* hover glow wash */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

              {/* screenshot — uniform frame; photo fills, UI screens contain (no crop) */}
              <div className="relative mb-5 h-[22rem] w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0e1416] to-[#06090a]">
                <Image
                  src={s.img}
                  alt={s.title}
                  fill
                  className={[
                    'transition-transform duration-500 group-hover:scale-[1.03]',
                    s.fit === 'cover' ? 'object-cover object-[50%_35%]' : 'object-contain p-2',
                  ].join(' ')}
                  sizes="(max-width:768px) 100vw, 33vw"
                />
                <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]" />
              </div>

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

              <h3 className="mt-5 text-xl font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
