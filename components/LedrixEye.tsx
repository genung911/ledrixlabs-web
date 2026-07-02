// LedrixEye — the "Ledrix Vision" mark: a cyan circuit-iris eye (almond outline, concentric broken iris
// rings, solid pupil, circuit-trace corner nodes). Web port of the app's react-native-svg version, as a
// plain inline SVG so it scales crisply. Same geometry (viewBox 0 0 104 80) as src/components/LedrixEye.tsx.
export function LedrixEye({ size = 96, color = '#00F3FF', className = '' }: { size?: number; color?: string; className?: string }) {
  const common = { stroke: color, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const trace = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const };
  return (
    <svg width={size} height={(size * 80) / 104} viewBox="0 0 104 80" className={className} aria-hidden="true">
      {/* almond outline — tall bulge top & bottom */}
      <path d="M 8 40 C 30 8, 74 8, 96 40 C 74 72, 30 72, 8 40 Z" strokeWidth={3} {...common} />
      {/* iris — concentric rings (mid + inner broken to read "scanning") */}
      <circle cx={52} cy={40} r={22} strokeWidth={2.8} {...common} />
      <circle cx={52} cy={40} r={15.5} strokeWidth={2.6} strokeDasharray="74 22" {...common} />
      <circle cx={52} cy={40} r={9.5} strokeWidth={2.4} strokeDasharray="40 16" {...common} />
      {/* pupil */}
      <circle cx={52} cy={40} r={4.6} fill={color} />
      {/* circuit traces + nodes — left inner corner */}
      <line x1={34} y1={33} x2={26} y2={33} {...trace} />
      <line x1={26} y1={33} x2={21} y2={28} {...trace} />
      <circle cx={19.5} cy={27} r={2.3} fill={color} />
      <line x1={34} y1={47} x2={26} y2={47} {...trace} />
      <line x1={26} y1={47} x2={21} y2={52} {...trace} />
      <circle cx={19.5} cy={53} r={2.3} fill={color} />
      {/* circuit traces + nodes — right inner corner (mirror) */}
      <line x1={70} y1={33} x2={78} y2={33} {...trace} />
      <line x1={78} y1={33} x2={83} y2={28} {...trace} />
      <circle cx={84.5} cy={27} r={2.3} fill={color} />
      <line x1={70} y1={47} x2={78} y2={47} {...trace} />
      <line x1={78} y1={47} x2={83} y2={52} {...trace} />
      <circle cx={84.5} cy={53} r={2.3} fill={color} />
    </svg>
  );
}
