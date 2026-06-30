'use client';

// ValOrbVoice — the VAL button. Idle, it's the VAL mark (delta + listening arcs) in a
// dark-glass orb with a breathing glow. On tap it plays a crisp Web Audio chime, opens
// the mic, and SPREADS into the live cyan waveform — the orb literally becoming the
// waveform IS the "I'm listening" signal (no toast). The bars light up with your voice
// (idle = calm ripple, speaking = bounce). Tap again to collapse back to the mark.
//
// Web-only (Web Audio + Framer Motion). The RN app uses the expo-av/reanimated twin.

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import ValVoiceVisualizer from './ValVoiceVisualizer';
import { ValMark } from './ValMark';

const CYAN = '#00F3FF';

// Short, crisp, tech-forward chime — generated, no asset hosting.
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.075;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 700);
  } catch {
    /* audio unavailable — non-fatal */
  }
}

export default function ValOrbVoice({ size = 66 }: { size?: number }) {
  const [listening, setListening] = useState(false);
  const reduce = useReducedMotion();

  const toggle = () => {
    setListening((on) => {
      if (!on) playChime(); // chime only on tap-to-start
      return !on;
    });
  };

  return (
    <motion.button
      type="button"
      onClick={toggle}
      aria-label={listening ? 'Stop listening' : 'Talk to VAL'}
      aria-pressed={listening}
      initial={false}
      animate={{ width: listening ? size * 3 : size }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      style={{
        height: size,
        borderRadius: size,
        padding: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'radial-gradient(120% 130% at 50% 0%, rgba(22,51,59,0.92), rgba(6,10,12,0.97))',
        border: `1.5px solid rgba(0,243,255,${listening ? 0.9 : 0.55})`,
        boxShadow: `0 0 ${listening ? 34 : 16}px rgba(0,243,255,${listening ? 0.5 : 0.3})`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* idle breathing glow ring */}
      {!listening && !reduce && (
        <motion.span
          aria-hidden
          style={{ position: 'absolute', inset: -2, borderRadius: size, border: `1.5px solid ${CYAN}` }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.96, 1.12, 0.96] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {listening ? (
          <motion.div
            key="wave"
            initial={{ opacity: 0, scaleX: 0.5 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.5 }}
            transition={{ duration: 0.22 }}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <ValVoiceVisualizer active bars={7} color={CYAN} height={Math.round(size * 0.46)} barWidth={4} gap={5} />
          </motion.div>
        ) : (
          <motion.div
            key="mark"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.22 }}
          >
            <ValMark size={Math.round(size * 0.66)} color={CYAN} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
