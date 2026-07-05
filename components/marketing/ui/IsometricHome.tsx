'use client';

// IsometricHome — the coded "digital-twin dollhouse" hero. A stylized monochrome modern
// home (a taller main volume + a lower wing, flat/low roofs) built entirely from 3D BOXES
// projected with a fixed 2:1 dimetric transform, so the geometry is deterministic and never
// lopsided. It sits on a subtle glowing blue grid platform, with a soft bloom + contact
// shadow beneath it. Three FINDING CALLOUTS are pinned to real points on the house (roof
// edge, a wall, a foundation corner) with a reticle marker + pulse ring + a thin leader line
// out to a floating glass card. The house is pure greyscale; the ONLY accent blue on the
// page lives here — the grid glow, the markers, the leaders, and the card priority chips.
// All motion is gated behind prefers-reduced-motion. NOT a floor plan — a coded object.
import { motion, useReducedMotion } from 'framer-motion';

// ── Iso projection ──────────────────────────────────────────────────────────
// A 3D point (x = right, y = up, z = depth) → screen. 2:1 dimetric:
//   sx = OX + (x - z) * U
//   sy = OY + (x + z) * (U/2) - y * U
// +x heads down-right, +z heads down-left, +y heads up. The visible faces of any
// box are therefore its TOP (y = max), its RIGHT (+x) wall, and its LEFT (+z) wall.
const U = 52;
const OX = 400;
const OY = 250;
const VW = 900;
const VH = 640;

type P3 = [number, number, number];
const proj = (x: number, y: number, z: number): [number, number] => [
  OX + (x - z) * U,
  OY + (x + z) * (U / 2) - y * U,
];
const poly = (cs: P3[]) =>
  cs.map(([x, y, z]) => proj(x, y, z).map((n) => n.toFixed(1)).join(',')).join(' ');

// A box's three visible faces (top / left = +z wall / right = +x wall).
function boxFaces(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return {
    top: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] as P3[],
    left: [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]] as P3[], // z = z1
    right: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] as P3[], // x = x1
  };
}
// A window on a +z (left) wall — a parallelogram in the x/y plane at z = const.
const winLeft = (x0: number, x1: number, y0: number, y1: number, z: number): P3[] => [
  [x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z],
];
// A window on a +x (right) wall — a parallelogram in the y/z plane at x = const.
const winRight = (y0: number, y1: number, z0: number, z1: number, x: number): P3[] => [
  [x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1],
];

// ── Flat-shade palette (monochrome depth cue) ───────────────────────────────
const TOP = '#F4F6F8';
const LEFT = '#DBE1E8';
const RIGHT = '#C4CCD6';
const ROOF_TOP = '#EDF1F4';
const WIN_L = '#AEB8C4';
const WIN_R = '#9AA6B4';
const EDGE = '#0A0F14';
const ACCENT = '#217BE8';

// ── The two-volume home, drawn far → near (painter's order) ──────────────────
// Main block (taller) sits back-left; the lower wing sits front-right (larger x+z = nearer).
const MAIN = boxFaces(0, 3, 0, 2.1, 0, 2.6);
const MAIN_ROOF = boxFaces(-0.12, 3.06, 2.1, 2.28, -0.12, 2.72);
const WING = boxFaces(3, 5.2, 0, 1.25, 0.4, 2.9);
const WING_ROOF = boxFaces(2.96, 5.32, 1.25, 1.4, 0.28, 3.02);

// Faces in draw order, each with its flat shade.
const FACES: { pts: string; fill: string }[] = [
  { pts: poly(MAIN.top), fill: TOP },
  { pts: poly(MAIN.left), fill: LEFT },
  { pts: poly(MAIN.right), fill: RIGHT },
  { pts: poly(MAIN_ROOF.left), fill: LEFT },
  { pts: poly(MAIN_ROOF.right), fill: RIGHT },
  { pts: poly(MAIN_ROOF.top), fill: ROOF_TOP },
  { pts: poly(WING.top), fill: TOP },
  { pts: poly(WING.left), fill: LEFT },
  { pts: poly(WING.right), fill: RIGHT },
  { pts: poly(WING_ROOF.left), fill: LEFT },
  { pts: poly(WING_ROOF.right), fill: RIGHT },
  { pts: poly(WING_ROOF.top), fill: ROOF_TOP },
];

// Windows — recessed, respect each face's iso skew.
const WINDOWS: { pts: string; fill: string }[] = [
  { pts: poly(winLeft(0.4, 1.0, 0.7, 1.5, 2.6)), fill: WIN_L },
  { pts: poly(winLeft(1.6, 2.2, 0.7, 1.5, 2.6)), fill: WIN_L },
  { pts: poly(winRight(1.3, 1.9, 0.8, 1.6, 3)), fill: WIN_R },
  { pts: poly(winLeft(3.5, 4.15, 0.4, 0.95, 2.9)), fill: WIN_L },
  { pts: poly(winLeft(4.45, 5.0, 0.15, 0.9, 2.9)), fill: WIN_L },
  { pts: poly(winRight(0.4, 0.9, 1.2, 2.0, 5.2)), fill: WIN_R },
];

// ── Ground grid (blue, on the y = 0 plane) ───────────────────────────────────
const GX0 = -2, GX1 = 7, GZ0 = -2, GZ1 = 5;
const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
for (let x = GX0; x <= GX1; x++) {
  const a = proj(x, 0, GZ0), b = proj(x, 0, GZ1);
  gridLines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
}
for (let z = GZ0; z <= GZ1; z++) {
  const a = proj(GX0, 0, z), b = proj(GX1, 0, z);
  gridLines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
}

// ── Finding callouts — pins on real house points → floating cards ────────────
type Callout = {
  pin: [number, number];
  card: [number, number]; // leader endpoint / card anchor (SVG coords)
  side: 'left' | 'right';
  priority: string;
  title: string;
  line: string;
  delay: number;
};
const CALLOUTS: Callout[] = [
  {
    pin: proj(3.06, 2.28, 1.4), // roof edge, right-front
    card: [712, 150],
    side: 'right',
    priority: 'Minor Repair',
    title: 'Roof flashing lifting at the edge',
    line: 'Drafted by Ledrix — confirm, adjust, or reject.',
    delay: 0.9,
  },
  {
    pin: proj(1.0, 1.2, 2.6), // main-block wall
    card: [150, 372],
    side: 'left',
    priority: 'Maint & Improve',
    title: 'Trim paint weathering',
    line: 'Drafted by Ledrix — confirm, adjust, or reject.',
    delay: 1.15,
  },
  {
    pin: proj(5.2, 0.05, 2.9), // foundation corner, wing front
    card: [712, 442],
    side: 'right',
    priority: 'Note',
    title: 'Foundation hairline, monitor',
    line: 'Drafted by Ledrix — confirm, adjust, or reject.',
    delay: 1.4,
  },
];

export function IsometricHome() {
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-[900px]">
      {/* SVG stage — grid + glow + house + markers + leaders. Entrance fade/scale. */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        whileInView={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '50% 60%' }}
      >
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="block h-auto w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <radialGradient id="ih-bloom" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
              <stop offset="45%" stopColor={ACCENT} stopOpacity="0.12" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="ih-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0A0F14" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#0A0F14" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#0A0F14" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ih-leader" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.85" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* blue bloom under the platform */}
          <ellipse cx={455} cy={360} rx={300} ry={140} fill="url(#ih-bloom)" />

          {/* isometric grid platform */}
          <g stroke={ACCENT} strokeOpacity={0.14} strokeWidth={1}>
            {gridLines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
            ))}
          </g>

          {/* soft contact shadow just under the house */}
          <ellipse cx={455} cy={352} rx={215} ry={92} fill="url(#ih-shadow)" />

          {/* the house — gentle float bob */}
          <motion.g
            animate={reduce ? undefined : { y: [0, -7, 0] }}
            transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            {FACES.map((f, i) => (
              <polygon
                key={`f${i}`}
                points={f.pts}
                fill={f.fill}
                stroke={EDGE}
                strokeOpacity={0.12}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            ))}
            {WINDOWS.map((w, i) => (
              <polygon
                key={`w${i}`}
                points={w.pts}
                fill={w.fill}
                stroke={EDGE}
                strokeOpacity={0.18}
                strokeWidth={0.75}
              />
            ))}
          </motion.g>

          {/* leader lines + reticle markers */}
          {CALLOUTS.map((c, i) => (
            <motion.g
              key={`m${i}`}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: c.delay, duration: 0.5 }}
            >
              <line
                x1={c.pin[0]}
                y1={c.pin[1]}
                x2={c.card[0]}
                y2={c.card[1]}
                stroke="url(#ih-leader)"
                strokeWidth={1.25}
              />
              <circle cx={c.card[0]} cy={c.card[1]} r={2.5} fill={ACCENT} />
              {/* pulse ring */}
              {!reduce && (
                <motion.circle
                  cx={c.pin[0]}
                  cy={c.pin[1]}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.25}
                  initial={{ r: 5, opacity: 0.55 }}
                  animate={{ r: [5, 18], opacity: [0.55, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: c.delay }}
                />
              )}
              {/* reticle: ring + core */}
              <circle cx={c.pin[0]} cy={c.pin[1]} r={7} fill="none" stroke={ACCENT} strokeOpacity={0.7} strokeWidth={1.5} />
              <circle cx={c.pin[0]} cy={c.pin[1]} r={3.2} fill={ACCENT} />
            </motion.g>
          ))}
        </svg>
      </motion.div>

      {/* floating glass finding cards — overlay exactly on the SVG box (same aspect).
          Hidden on small screens (markers + leaders on the house carry the story). */}
      <div className="pointer-events-none absolute inset-0 hidden md:block">
        {CALLOUTS.map((c, i) => {
          const leftPct = (c.card[0] / VW) * 100;
          const topPct = (c.card[1] / VH) * 100;
          const anchor =
            c.side === 'left'
              ? 'translate(calc(-100% - 10px), -50%)'
              : 'translate(10px, -50%)';
          return (
            <motion.div
              key={`c${i}`}
              className="absolute w-56 rounded-xl border border-hairline bg-white/85 p-3 shadow-[0_18px_44px_-22px_rgba(10,15,20,0.45)] backdrop-blur-md"
              style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: anchor }}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: c.delay + 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                {c.priority}
              </span>
              <p className="mt-2 text-sm font-semibold leading-snug text-ink">{c.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-body">{c.line}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
