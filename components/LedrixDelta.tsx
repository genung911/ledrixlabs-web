'use client';

// LedrixDelta — the SINGLE canonical Ledrix brand mark. A calligraphic open-base
// delta: the left wall is thin, the right wall + base are thicker (typographic
// contrast), with our signature gap in the base — drawn off-center toward the
// thin side. Used everywhere (landing, home portal, homepage) so the mark never
// drifts.
//
// Because the walls have *different* weights, this is a FILLED outline (each edge
// offset inward by its own thickness), not a uniform stroke. All the look lives in
// the TUNABLES below — iterate the design by changing those ratios in this one file.

import { useId } from 'react';

type P = [number, number];

export function LedrixDelta({
  size = 22,
  color = '#217BE8',
  sheen = false,
  className,
}: {
  size?: number;
  color?: string;
  /** Premium logo finish: top-lit blue gradient fill + glow. Leave off for small
   *  functional icons (e.g. the VAL orb), which want a flat `color`. */
  sheen?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const S = size;

  // ── TUNABLES (ratios of size) — the whole design is here ──
  const PAD = 0.1; // outer breathing room
  const W_LEFT = 0.045; // left wall thickness (thin)
  const W_RIGHT = 0.09; // right wall thickness (thick)
  const W_BASE = 0.09; // base thickness (thick)
  const GAP_FROM = 0.24; // base-gap start, as a fraction of base width (off-center, left)
  const GAP_TO = 0.5; // base-gap end

  // ── Outer triangle (equilateral, padded) ──
  const pad = S * PAD;
  const W = S - pad * 2;
  const H = W * (Math.sqrt(3) / 2);
  const ty = (S - H) / 2;
  const by = ty + H;
  const A: P = [S / 2, ty]; // apex
  const L: P = [pad, by]; // bottom-left
  const R: P = [pad + W, by]; // bottom-right
  const G: P = [(A[0] + L[0] + R[0]) / 3, (A[1] + L[1] + R[1]) / 3]; // centroid

  // Offset an edge (P1→P2) inward (toward the centroid) by t → a point + direction.
  const offset = (P1: P, P2: P, t: number): { p: P; d: P } => {
    const ex = P2[0] - P1[0];
    const ey = P2[1] - P1[1];
    const len = Math.hypot(ex, ey) || 1;
    const ux = ex / len;
    const uy = ey / len;
    let nx = -uy;
    let ny = ux;
    if ((G[0] - P1[0]) * nx + (G[1] - P1[1]) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p: [P1[0] + nx * t, P1[1] + ny * t], d: [ux, uy] };
  };

  const det = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
  const intersect = (l1: { p: P; d: P }, l2: { p: P; d: P }): P => {
    const denom = det(l1.d, l2.d) || 1e-6;
    const diff: P = [l2.p[0] - l1.p[0], l2.p[1] - l1.p[1]];
    const s = det(diff, l2.d) / denom;
    return [l1.p[0] + l1.d[0] * s, l1.p[1] + l1.d[1] * s];
  };

  const eAL = offset(A, L, S * W_LEFT);
  const eAR = offset(A, R, S * W_RIGHT);
  const eLR = offset(L, R, S * W_BASE);
  const Ai = intersect(eAL, eAR); // inner apex
  const Li = intersect(eAL, eLR); // inner bottom-left
  const Ri = intersect(eAR, eLR); // inner bottom-right

  const f = (p: P) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  // Outer loop + inner loop; evenodd fills the band between them (the outline).
  const d = `M ${f(A)} L ${f(R)} L ${f(L)} Z M ${f(Ai)} L ${f(Li)} L ${f(Ri)} Z`;

  // Off-center base gap — a masked-out slice across the base band.
  const gx0 = pad + W * GAP_FROM;
  const gx1 = pad + W * GAP_TO;
  const maskId = `ld${uid}`;
  const sheenId = `lds${uid}`;

  return (
    <svg
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      fill="none"
      className={className}
      style={{ display: 'block', ...(sheen ? { filter: `drop-shadow(0 0 ${(S * 0.1).toFixed(1)}px rgba(33,123,232,0.55))` } : null) }}
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect x="0" y="0" width={S} height={S} fill="white" />
          <rect x={gx0} y={by - S * W_BASE - 1} width={gx1 - gx0} height={S * W_BASE + 3} fill="black" />
        </mask>
        {sheen && (
          <linearGradient id={sheenId} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#C9E2FF" />
            <stop offset="0.45" stopColor="#217BE8" />
            <stop offset="1" stopColor="#1A63C8" />
          </linearGradient>
        )}
      </defs>
      <path d={d} fill={sheen ? `url(#${sheenId})` : color} fillRule="evenodd" mask={`url(#${maskId})`} />
    </svg>
  );
}

// ─── The three official treatments of the mark ───────────────────────────────
//   Blue (brand, on dark)  →  <LedrixDelta sheen />            top-lit blue gradient + glow
//   White (mono, on dark)  →  <LedrixDelta color="#ffffff" />  favicons, watermarks, photos
//   Ink   (mono, on light) →  <LedrixDelta color="#070707" />  print, the report PDF, light UI
