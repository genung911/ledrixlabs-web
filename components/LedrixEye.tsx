// LedrixEye — the "Ledrix Vision" mark: a blue circuit-iris eye (almond outline, concentric broken iris
// rings, solid pupil, circuit-trace corner nodes). Web port of the app's react-native-svg version, as a
// plain inline SVG so it scales crisply. Same geometry (viewBox 0 0 104 80) as src/components/LedrixEye.tsx.
export function LedrixEye({ size = 96, color = '#217BE8', className = '' }: { size?: number; color?: string; className?: string }) {
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
      {/* circuit traces + nodes — left inner corner (pulled inside the almond so nothing protrudes) */}
      <line x1={34} y1={34} x2={29} y2={34} {...trace} />
      <line x1={29} y1={34} x2={25} y2={32} {...trace} />
      <circle cx={24} cy={31} r={2.3} fill={color} />
      <line x1={34} y1={46} x2={29} y2={46} {...trace} />
      <line x1={29} y1={46} x2={25} y2={48} {...trace} />
      <circle cx={24} cy={49} r={2.3} fill={color} />
      {/* circuit traces + nodes — right inner corner (mirror) */}
      <line x1={70} y1={34} x2={75} y2={34} {...trace} />
      <line x1={75} y1={34} x2={79} y2={32} {...trace} />
      <circle cx={80} cy={31} r={2.3} fill={color} />
      <line x1={70} y1={46} x2={75} y2={46} {...trace} />
      <line x1={75} y1={46} x2={79} y2={48} {...trace} />
      <circle cx={80} cy={49} r={2.3} fill={color} />
    </svg>
  );
}
