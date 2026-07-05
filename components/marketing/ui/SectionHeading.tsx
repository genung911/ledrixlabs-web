'use client';

// SectionHeading — the staggered eyebrow + title + sub atop each light section.
// Mono uppercase MUTED-GREY eyebrow with a precise grey tick; near-black title; slate
// sub. Monochrome — no accent color.
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = 'center',
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  align?: 'center' | 'left';
}) {
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left';

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      className={`flex flex-col ${alignment}`}
    >
      <motion.span
        variants={fadeUp}
        className="mb-5 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted"
      >
        <span className="h-px w-6 bg-muted/50" />
        {eyebrow}
      </motion.span>
      <motion.h2 variants={fadeUp} className="max-w-3xl text-4xl font-bold tracking-tight text-ink [text-wrap:balance] md:text-5xl">
        {title}
      </motion.h2>
      {sub && (
        <motion.p variants={fadeUp} className="mt-5 max-w-2xl text-base leading-relaxed text-body [text-wrap:balance] md:text-lg">
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}
