// LedrixDelta — the real Ledrix brand mark: an open-base delta (the signature gap
// at the bottom-center). Geometry mirrors ValDeltaSVG used in the home portal, so
// the marketing site and the app stay on one mark.
export function LedrixDelta({
  size = 22,
  color = '#00F3FF',
  className,
}: {
  size?: number;
  color?: string;
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
  // One continuous stroke so the apex + base corners are real joins (not two
  // overlapping round caps). Only the base-gap ends are open/rounded.
  const d = `M ${GL} ${by} L ${BLX} ${by} L ${TX} ${ty} L ${BRX} ${by} L ${GR} ${by}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className} aria-hidden>
      <path d={d} stroke={color} strokeWidth={size * 0.07} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
