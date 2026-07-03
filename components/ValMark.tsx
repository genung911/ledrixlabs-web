// ValMark — the VAL mark: the Ledrix delta + flanking "listening" arcs (V3). Distinct
// from the bare Ledrix Δ so VAL reads as its own thing. The arcs are the idle state of
// the orb; on tap the orb spreads them open into the live waveform (ValOrbVoice).
import { LedrixDelta } from './LedrixDelta';

export function ValMark({ size = 40, color = '#00F3FF' }: { size?: number; color?: string }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LedrixDelta size={size * 0.64} color={color} />
      </div>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <path d="M26 37 Q18 50 26 63" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M17 30 Q6 50 17 70" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M74 37 Q82 50 74 63" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M83 30 Q94 50 83 70" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
