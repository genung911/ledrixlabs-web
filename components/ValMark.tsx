// ValMark — the VAL mark: the Ledrix delta + flanking "listening" arcs (V3). Distinct
// from the bare Ledrix Δ so VAL reads as its own thing. The arcs are the idle state of
// the orb; on tap the orb spreads them open into the live waveform (ValOrbVoice).
import { LedrixDelta } from './LedrixDelta';

export function ValMark({ size = 40, color = '#217BE8', sheen = false }: { size?: number; color?: string; sheen?: boolean }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LedrixDelta size={size * 0.64} color={color} sheen={sheen} />
      </div>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <path d="M23 37 Q15 50 23 63" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M14 30 Q3 50 14 70" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M77 37 Q85 50 77 63" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M86 30 Q97 50 86 70" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
