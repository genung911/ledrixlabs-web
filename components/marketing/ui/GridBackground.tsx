'use client';

// GridBackground — the animated dark-mode grid used behind the hero (and reusable
// behind other dark sections). Masked grid lines + a slow-drifting cyan aurora +
// a vignette. Respects prefers-reduced-motion (the aurora holds still).
import { motion, useReducedMotion } from 'framer-motion';

export function GridBackground({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className={`absolute inset-0 ${className}`}>
      {/* grid lines, faded toward the edges with a radial mask */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_72%)]" />

      {/* slow-drifting cyan aurora */}
      <motion.div
        className="absolute left-1/2 top-[34%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[140px]"
        animate={reduce ? undefined : { x: [-60, 60, -60], y: [-24, 24, -24], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* vignette into pure black */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,#070707_100%)]" />
    </div>
  );
}
