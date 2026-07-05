'use client';

// GridBackground — the ambient grid behind feature sections.
//   variant="dark"  → the futuristic near-black band: white hairlines, a slow cyan
//                     aurora, and a vignette into black (the Hero "hero moment").
//   variant="light" → a whisper-quiet slate hairline grid on the off-white ground,
//                     with a faint cyan bloom. No vignette, nothing loud.
// Respects prefers-reduced-motion (the aurora holds still).
import { motion, useReducedMotion } from 'framer-motion';

export function GridBackground({
  className = '',
  variant = 'dark',
}: {
  className?: string;
  variant?: 'dark' | 'light';
}) {
  const reduce = useReducedMotion();

  if (variant === 'light') {
    return (
      <div aria-hidden className={`absolute inset-0 ${className}`}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,15,20,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,15,20,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <div className="absolute left-1/2 top-[30%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-ink/[0.03] blur-[150px]" />
      </div>
    );
  }

  return (
    <div aria-hidden className={`absolute inset-0 ${className}`}>
      {/* grid lines, faded toward the edges with a radial mask */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_72%)]" />

      {/* slow-drifting neutral glow */}
      <motion.div
        className="absolute left-1/2 top-[34%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-white/[0.06] blur-[140px]"
        animate={reduce ? undefined : { x: [-60, 60, -60], y: [-24, 24, -24], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* vignette into pure black */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,#0A0F11_100%)]" />
    </div>
  );
}
