'use client';

// VisionOverlay — "the home as Ledrix sees it." A restrained AI-vision layer painted
// over the full-bleed exterior photo in the opener: a few finding markers pinned to the
// structure (reticle dot + pulse ring + a thin leader line), a couple of glass finding
// cards that fade in, and one slow scan sweep on load. THIS is the single justified use
// of the accent blue on the whole page — the product's eye. Everything else is monochrome.
// NOT a floor plan — markers on a real 2D photo only. Respects prefers-reduced-motion.
import { motion, useReducedMotion } from 'framer-motion';

type Marker = { top: string; left: string; delay: number; leader: number };
type Card = {
  top: string;
  side: 'left' | 'right';
  offset: string;
  priority: string;
  title: string;
  delay: number;
};

// Pinned to points on the house — roof edge, a wall/foundation corner, a window.
const MARKERS: Marker[] = [
  { top: '24%', left: '30%', delay: 0.4, leader: -32 },
  { top: '61%', left: '18%', delay: 0.7, leader: -18 },
  { top: '48%', left: '74%', delay: 1.0, leader: 30 },
];

// The finding cards — mirror the in-app card: priority chip + short title.
const CARDS: Card[] = [
  { top: '15%', side: 'left', offset: '4%', priority: 'Minor Repair', title: 'Roof flashing lifting at the edge', delay: 1.5 },
  { top: '55%', side: 'right', offset: '4%', priority: 'Maint & Improve', title: 'Trim paint weathering', delay: 1.9 },
];

export function VisionOverlay() {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden md:block">
      {/* one slow scan sweep on load — a single faint light line passing over the photo */}
      {!reduce && (
        <motion.div
          className="absolute inset-y-0 w-40 bg-[linear-gradient(90deg,transparent,rgba(33,123,232,0.10),rgba(33,123,232,0.22),rgba(33,123,232,0.10),transparent)]"
          initial={{ left: '-15%', opacity: 0 }}
          animate={{ left: ['-15%', '110%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.6, delay: 0.2, ease: 'easeInOut', times: [0, 0.1, 0.9, 1] }}
        />
      )}

      {/* markers */}
      {MARKERS.map((m, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ top: m.top, left: m.left }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: m.delay, type: 'spring', stiffness: 260, damping: 18 }}
        >
          {/* leader line into the structure */}
          <span
            className="absolute left-1/2 top-1/2 h-px origin-left bg-gradient-to-r from-accent/80 to-transparent"
            style={{ width: '2.4rem', transform: `rotate(${m.leader}deg)` }}
          />
          {/* pulse ring */}
          {!reduce && (
            <motion.span
              className="absolute -inset-2.5 rounded-full border border-accent/50"
              initial={{ scale: 0.6, opacity: 0.7 }}
              animate={{ scale: [0.6, 1.5], opacity: [0.7, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: m.delay }}
            />
          )}
          {/* reticle ring + dot */}
          <span className="relative block h-4 w-4 rounded-full border border-accent/70">
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_rgba(33,123,232,0.9)]" />
          </span>
        </motion.div>
      ))}

      {/* finding cards — glass on the dark photo, priority chip in accent blue */}
      {CARDS.map((c, i) => (
        <motion.div
          key={i}
          className="absolute w-60 max-w-[42vw] rounded-xl border border-white/15 bg-white/10 p-3 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)] backdrop-blur-md"
          style={{ top: c.top, [c.side]: c.offset }}
          initial={{ opacity: 0, x: c.side === 'left' ? -14 : 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: c.delay, duration: 0.6, ease: 'easeOut' }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
            {c.priority}
          </span>
          <p className="mt-2 text-sm font-semibold leading-snug text-white">{c.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/70">Drafted by Ledrix — confirm, adjust, or reject.</p>
        </motion.div>
      ))}
    </div>
  );
}
