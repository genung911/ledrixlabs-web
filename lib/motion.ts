// Shared Framer Motion variants — one source of truth for the marketing site so
// every section animates with the same elegant timing. Keep it calm, not busy.
import type { Variants } from 'framer-motion';

// A soft, premium ease-out (cubic) used across reveals.
export const EASE = [0.22, 1, 0.36, 1] as const;

// Fade + rise. The default for almost everything (<Reveal/>).
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

// Parent that staggers its children's entry. Pair with `fadeUp` items.
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};

// Gentle scale-in for cards / media.
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
};
