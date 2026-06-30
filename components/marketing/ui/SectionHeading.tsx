'use client';

// SectionHeading — the staggered eyebrow + title + sub used atop each section.
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
        className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent/80"
      >
        <span className="h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_#00F3FF]" />
        {eyebrow}
      </motion.span>
      <motion.h2 variants={fadeUp} className="max-w-3xl text-4xl font-bold tracking-tight text-white [text-wrap:balance] md:text-5xl">
        {title}
      </motion.h2>
      {sub && (
        <motion.p variants={fadeUp} className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400 [text-wrap:balance] md:text-lg">
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}
