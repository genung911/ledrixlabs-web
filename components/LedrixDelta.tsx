// LedrixDelta — the SINGLE canonical Ledrix brand mark. An open-base delta with the
// signature gap at the bottom-center, drawn as one continuous stroke so the apex and
// base corners are clean joins (only the gap ends are rounded). Used everywhere —
// landing, home portal, homepage — so the mark never drifts again.
//
// Line thickness scales with the mark via `strokeRatio` (default 0.06), so the stroke
// stays proportional at any size. Change it here once to restyle every delta.
export function LedrixDelta({
  size = 22,
  color = '#00F3FF',
  strokeRatio = 0.06,
  className,
}: {
  size?: number;
  color?: string;
  strokeRatio?: number;
  className?: string;
}) {
  const pad = size * 0.1;
  const W = size - pad * 2;
  const H = W * (Math.sqrt(3) / 2);
  const ty = (size - H) / 2;
  const by = ty + H;
  const TX = size / 2;
  const BLX = pad;
  const BRX = pad + W;
  const GL = BLX + W * 0.3; // base gap — left edge
  const GR = BLX + W * 0.7; // base gap — right edge
  const d = `M ${GL} ${by} L ${BLX} ${by} L ${TX} ${ty} L ${BRX} ${by} L ${GR} ${by}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className} style={{ display: 'block' }} aria-hidden>
      <path d={d} stroke={color} strokeWidth={size * strokeRatio} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
