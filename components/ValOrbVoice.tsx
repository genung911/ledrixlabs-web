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
// Web-only (Web Audio + CSS). The RN app uses the expo-av/reanimated twin.
// CSS, not Framer Motion (2026-11-25, approval pack item 6 "share page loads faster"): framer-motion was ~40 kB gzipped of
// the Home Record's first visit for these four motions alone — the spread (a width transition), the breathing ring and
// the mark / waveform fade (keyframes). Reduced motion turns them off (the media query below).

import { useState } from 'react';
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
  const t = TONES[tone];

  const toggle = () => {
    if (!listening) playChime(); // chime only on tap-to-start
    if (controlled) controlled.onToggle();
    else setSelfListening((on) => !on);
  };

  return (
    <button
      type="button"
      className="vov"
      onClick={toggle}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-label={listening ? 'Stop listening' : 'Talk to VAL'}
      aria-pressed={listening}
      style={{
        width: listening ? size * 3 : size,
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
        WebkitTapHighlightColor: 'transparent',
        ['--vov-ring' as string]: t.ring,
        ['--vov-peak' as string]: tone === 'light' ? 0.35 : 0.5,
      }}
    >
      <style>{VOV_CSS}</style>
      {/* idle breathing glow ring */}
      {!listening && <span aria-hidden className="vov-ring" style={{ borderRadius: size }} />}
      {listening ? (
        <div key="wave" className="vov-in vov-wave" style={{ display: 'flex', alignItems: 'center' }}>
          <ValVoiceVisualizer active={controlled ? !!controlled.stream : true} stream={controlled?.stream ?? undefined} bars={7} color={t.mark} height={Math.round(size * 0.46)} barWidth={4} gap={5} />
        </div>
      ) : (
        <div key="mark" className="vov-in vov-mark">
          <LedrixDelta size={Math.round(size * 0.42)} color={t.mark} sheen={tone === 'light'} />
        </div>
      )}
    </button>
  );
}

// The motions, as they were: the spread springs a little past and settles (cubic-bezier overshoot ≈ the old spring
// 300/26), the ring breathes over 2.6 s, the mark and the waveform fade in over 0.22 s.
const VOV_CSS = `.vov{transition:width .42s cubic-bezier(.34,1.32,.64,1),box-shadow .3s ease,border-color .3s ease}
.vov .vov-ring{position:absolute;inset:-2px;border:1.5px solid var(--vov-ring);opacity:0;animation:vovBreathe 2.6s ease-in-out infinite;pointer-events:none}
@keyframes vovBreathe{0%,100%{opacity:0;transform:scale(.96)}50%{opacity:var(--vov-peak);transform:scale(1.12)}}
.vov .vov-in{animation:vovIn .22s ease both}
.vov .vov-wave{transform-origin:center;animation-name:vovWave}
@keyframes vovIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes vovWave{from{opacity:0;transform:scaleX(.5)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.vov,.vov .vov-in{transition:none;animation:none}.vov .vov-ring{display:none}}`;
