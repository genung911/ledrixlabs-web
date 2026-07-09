'use client';

// ValOrbVoice — the VAL button. Idle, it's the VAL mark (delta + listening arcs) in a
// premium glass orb with a breathing blue glow. On tap it plays a crisp Web Audio chime,
// opens the mic, and SPREADS into the live blue waveform — the orb literally becoming the
// waveform IS the "I'm listening" signal (no toast). The bars light up with your voice
// (idle = calm ripple, speaking = bounce). Tap again to collapse back to the mark.
//
// Two premium shells via the `tone` prop, so the orb never reads as a heavy black blob:
//   • tone="light" — frosted-white glass, hairline blue ring, blue mark, a real drop
//     shadow that lifts it off the page + a soft blue hover halo. For light grounds
//     (the home portal, the light marketing sections).
//   • tone="dark"  — dark translucent glass, blue/white mark, a subtle blue glow ring.
//     For dark grounds (the dollhouse hero, dark app-like contexts). This is the default,
//     so existing call sites stay backward-compatible.
//
// Web-only (Web Audio + Framer Motion). The RN app uses the expo-av/reanimated twin.

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import ValVoiceVisualizer from './ValVoiceVisualizer';
import { LedrixDelta } from './LedrixDelta';

const ACCENT = '#217BE8'; // brand blue

type Tone = 'light' | 'dark';

// Per-tone premium treatments. `mark` is the delta/waveform color; `ring` is the solid
// breathing-ring color; `shell()` and `shadow()` build the glass + lift/glow.
const TONES: Record<Tone, {
  mark: string;
  ring: string;
  shell: string;
  border: (listening: boolean) => string;
  shadow: (listening: boolean, hovered: boolean) => string;
}> = {
  light: {
    mark: ACCENT,
    ring: ACCENT,
    shell: 'radial-gradient(125% 130% at 50% 0%, rgba(255,255,255,0.96), rgba(238,244,251,0.86))',
    border: (l) => `1.25px solid rgba(33,123,232,${l ? 0.6 : 0.35})`,
    // real drop shadow (lifts off the page) + a soft blue halo that blooms on hover / listen
    shadow: (l, h) =>
      `0 10px 30px rgba(12,28,54,${h ? 0.22 : 0.14}), 0 2px 8px rgba(12,28,54,0.08), 0 0 ${
        l ? 30 : h ? 26 : 14
      }px rgba(33,123,232,${l ? 0.3 : h ? 0.28 : 0.15})`,
  },
  dark: {
    mark: '#7FB4F0', // accent.soft — reads bright on dark glass
    ring: ACCENT,
    shell: 'radial-gradient(125% 130% at 50% 0%, rgba(34,52,78,0.86), rgba(8,13,20,0.94))',
    border: (l) => `1.5px solid rgba(33,123,232,${l ? 0.9 : 0.55})`,
    shadow: (l, h) =>
      `0 8px 26px rgba(0,0,0,0.45), 0 0 ${l ? 34 : h ? 26 : 16}px rgba(33,123,232,${
        l ? 0.5 : h ? 0.4 : 0.3
      })`,
  },
};

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

// Controlled mode: the parent owns the listening state + the mic stream (e.g. the
// home portal, which records + transcribes itself). Omit `controlled` for the
// self-managed demo orb.
type Controlled = { listening: boolean; onToggle: () => void; stream?: MediaStream | null };

export default function ValOrbVoice({
  size = 66,
  tone = 'dark',
  controlled,
  quiet = false,   // structural placement (e.g. a docked anchor) — no lift shadow unless actively listening
}: {
  size?: number;
  tone?: Tone;
  controlled?: Controlled;
  quiet?: boolean;
}) {
  const [selfListening, setSelfListening] = useState(false);
  const [hovered, setHovered] = useState(false);
  const listening = controlled ? controlled.listening : selfListening;
  const reduce = useReducedMotion();
  const t = TONES[tone];

  const toggle = () => {
    if (!listening) playChime(); // chime only on tap-to-start
    if (controlled) controlled.onToggle();
    else setSelfListening((on) => !on);
  };

  return (
    <motion.button
      type="button"
      onClick={toggle}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
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
        background: t.shell,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: t.border(listening),
        boxShadow: quiet && !listening ? 'none' : t.shadow(listening, hovered),
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* idle breathing glow ring */}
      {!listening && !reduce && (
        <motion.span
          aria-hidden
          style={{ position: 'absolute', inset: -2, borderRadius: size, border: `1.5px solid ${t.ring}` }}
          animate={{ opacity: [0, tone === 'light' ? 0.35 : 0.5, 0], scale: [0.96, 1.12, 0.96] }}
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
            <ValVoiceVisualizer active={controlled ? !!controlled.stream : true} stream={controlled?.stream ?? undefined} bars={7} color={t.mark} height={Math.round(size * 0.46)} barWidth={4} gap={5} />
          </motion.div>
        ) : (
          <motion.div
            key="mark"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.22 }}
          >
            <LedrixDelta size={Math.round(size * 0.42)} color={t.mark} sheen={tone === 'light'} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
