'use client';

// ValVoiceVisualizer — a live mic equalizer for the VAL voice interface, in the
// ChatGPT/Gemini idiom: a row of cyan bars, symmetric about center, that sit calm
// when you're quiet and bounce with your voice when you speak.
//
// Two ways to drive it:
//   • Pass an existing `stream` (e.g. shared with a MediaRecorder) — no extra
//     mic prompt; it just taps the analyser onto that stream.
//   • Omit `stream` and toggle `active` — it requests its own mic on the first
//     activation (the tap that set active=true is the user gesture).
//
// Rendering is ref-driven: a single requestAnimationFrame loop mutates each bar's
// transform directly, so it runs at the display's native 60fps and never triggers
// a React re-render (the main thread stays free).

import { useEffect, useRef } from 'react';

type Props = {
  /** Whether VAL is listening. Drives mic acquisition (when no `stream` is given)
   *  and idle↔live state. When false the bars relax to a calm micro-ripple. */
  active: boolean;
  /** Optional mic stream to visualize (share one with a MediaRecorder to avoid a
   *  second permission prompt). If omitted, the component opens its own on tap. */
  stream?: MediaStream | null;
  bars?: number;        // bar count — odd numbers look best (true center bar)
  color?: string;       // accent (default high-viz cyan)
  height?: number;      // track height, px
  barWidth?: number;    // px
  gap?: number;         // px between bars
  className?: string;
  onError?: (message: string) => void;
};

export default function ValVoiceVisualizer({
  active,
  stream = null,
  bars = 7,
  color = '#00F3FF',
  height = 48,
  barWidth = 5,
  gap = 6,
  className,
  onError,
}: Props) {
  const barRefs     = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef      = useRef<number>(0);
  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef     = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ownStreamRef = useRef<MediaStream | null>(null);   // only streams WE opened
  const levels      = useRef<number[]>(Array(bars).fill(0.05));
  const activeRef   = useRef(active);
  activeRef.current = active;

  // ── Wire an analyser onto a stream (no output connection → no feedback) ──
  const attach = (s: MediaStream) => {
    if (analyserRef.current) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const an = ctx.createAnalyser();
    an.fftSize = 256;                 // → 128 frequency bins
    an.smoothingTimeConstant = 0.75;  // analyser-side temporal smoothing
    ctx.createMediaStreamSource(s).connect(an);
    ctxRef.current = ctx;
    analyserRef.current = an;
    dataRef.current = new Uint8Array(an.frequencyBinCount);
    void ctx.resume().catch(() => {});
  };

  const detach = () => {
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    dataRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    ownStreamRef.current?.getTracks().forEach(t => t.stop());
    ownStreamRef.current = null;
  };

  // Acquire / release the analyser as `active` (or the provided `stream`) changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!active) { detach(); return; }
      if (stream) { attach(stream); return; }
      if (analyserRef.current) return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        ownStreamRef.current = s;
        attach(s);
      } catch {
        onError?.('Microphone access was blocked.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stream]);

  // ── One rAF loop for the component's lifetime: idle ripple + live bounce ──
  useEffect(() => {
    const CENTER = (bars - 1) / 2;
    const BANDS  = Math.ceil(bars / 2);
    const BIN_LO = 2, BIN_HI = 64;                    // voice-weighted low-mid band
    const bandSize = Math.max(1, Math.floor((BIN_HI - BIN_LO) / BANDS));

    const tick = () => {
      const an = analyserRef.current, data = dataRef.current;
      const live = activeRef.current && !!an && !!data;
      if (live) an!.getByteFrequencyData(data!);
      const t = performance.now() / 1000;

      for (let i = 0; i < bars; i++) {
        // Calm, living baseline — a faint micro-ripple, phase-shifted per bar.
        const ripple = 0.05 + 0.035 * (0.5 + 0.5 * Math.sin(t * 1.8 + i * 0.6));
        let target = ripple;

        if (live) {
          // Center bar reads the lowest (most energetic) band; bars fan out
          // symmetrically to higher bands → the classic mirrored equalizer.
          const band = Math.abs(i - CENTER) | 0;
          const start = BIN_LO + band * bandSize;
          let sum = 0;
          for (let k = 0; k < bandSize; k++) sum += data![start + k] ?? 0;
          const amp = Math.pow((sum / bandSize) / 255, 0.85) * 1.3;   // 0..~1
          target = Math.max(ripple, Math.min(1, amp));                // silence → ripple
        }

        // Fast attack, slow release → an organic bounce rather than a jitter.
        const cur = levels.current[i];
        const next = cur + (target - cur) * (target > cur ? 0.5 : 0.12);
        levels.current[i] = next;

        const el = barRefs.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.05, next).toFixed(3)})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bars]);

  // Release the mic + audio context when the component goes away.
  useEffect(() => () => detach(), []);

  return (
    <div
      className={className}
      aria-hidden
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap, height }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={el => { barRefs.current[i] = el; }}
          style={{
            display: 'block',
            width: barWidth,
            height: '100%',
            borderRadius: barWidth,
            background: `linear-gradient(${color}, ${color}cc)`,
            boxShadow: `0 0 ${barWidth * 1.8}px ${color}aa`,
            transformOrigin: 'center',
            transform: 'scaleY(0.05)',
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
