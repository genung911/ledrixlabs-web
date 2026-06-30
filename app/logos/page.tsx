'use client';

// Logo lab — throwaway comparison of delta directions at multiple sizes on dark +
// light, so we can pick a shape. The winner gets applied to components/LedrixDelta.tsx.
import { LedrixDelta } from '@/components/LedrixDelta';

const CYAN = '#00F3FF';

// One continuous base-gap triangle outline at a given padding (size control).
function triPath(S: number, padR: number, gapFrom: number, gapTo: number) {
  const pad = S * padR;
  const W = S - 2 * pad;
  const H = W * (Math.sqrt(3) / 2);
  const ty = (S - H) / 2;
  const by = ty + H;
  const TX = S / 2;
  const BLX = pad;
  const BRX = pad + W;
  const gL = BLX + W * gapFrom;
  const gR = BLX + W * gapTo;
  return `M ${gL} ${by} L ${BLX} ${by} L ${TX} ${ty} L ${BRX} ${by} L ${gR} ${by}`;
}

// B — single even-weight outline, centered base gap.
function DeltaUniform({ size = 48, color = CYAN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={triPath(size, 0.1, 0.34, 0.66)} stroke={color} strokeWidth={size * 0.06} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// C — concentric nested outlines (the #6/#7 family), both with a base gap.
function DeltaConcentric({ size = 48, color = CYAN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={triPath(size, 0.08, 0.37, 0.63)} stroke={color} strokeWidth={size * 0.05} strokeLinecap="round" strokeLinejoin="round" />
      <path d={triPath(size, 0.29, 0.3, 0.7)} stroke={color} strokeWidth={size * 0.05} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// D — solid filled delta with an upward triangular notch cut from the base center.
function DeltaSolid({ size = 48, color = CYAN }: { size?: number; color?: string }) {
  const S = size;
  const pad = S * 0.1;
  const W = S - 2 * pad;
  const H = W * (Math.sqrt(3) / 2);
  const ty = (S - H) / 2;
  const by = ty + H;
  const TX = S / 2;
  const BLX = pad;
  const BRX = pad + W;
  const nw = W * 0.16; // notch half-width
  const nh = H * 0.5; // notch height
  const outer = `M ${TX} ${ty} L ${BRX} ${by} L ${BLX} ${by} Z`;
  const notch = `M ${TX - nw} ${by} L ${TX} ${by - nh} L ${TX + nw} ${by} Z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={`${outer} ${notch}`} fill={color} fillRule="evenodd" />
    </svg>
  );
}

type Variant = { name: string; note: string; render: (s: number, c: string) => React.ReactNode };

const VARIANTS: Variant[] = [
  { name: 'A · Calligraphic + off-center gap', note: 'Current mark. Variable weight (thin left, thick right), gap offset. Stays crisp at tiny sizes.', render: (s, c) => <LedrixDelta size={s} color={c} /> },
  { name: 'B · Uniform outline + centered gap', note: 'The simplest — single even stroke, gap centered.', render: (s, c) => <DeltaUniform size={s} color={c} /> },
  { name: 'C · Concentric nested', note: 'The #6 / #7 family — triangle-in-triangle. Strong large, muddy small.', render: (s, c) => <DeltaConcentric size={s} color={c} /> },
  { name: 'D · Solid + base notch', note: 'Filled, heaviest presence — reads even at the smallest sizes.', render: (s, c) => <DeltaSolid size={s} color={c} /> },
];

const SIZES = [96, 48, 28, 18];

function Board({ label, bg, fg, sub }: { label: string; bg: string; fg: string; sub: string }) {
  return (
    <section className="rounded-2xl p-6" style={{ background: bg }}>
      <div className="mb-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: fg }}>{label}</h2>
        <p className="text-xs" style={{ color: fg, opacity: 0.5 }}>{sub}</p>
      </div>
      <div className="flex flex-col gap-3">
        {VARIANTS.map((v) => (
          <div key={v.name} className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ border: `1px solid ${fg}1a` }}>
            <div className="w-56 shrink-0">
              <div className="text-[13px] font-bold" style={{ color: fg }}>{v.name}</div>
              <div className="text-[11px] leading-snug" style={{ color: fg, opacity: 0.55 }}>{v.note}</div>
            </div>
            <div className="flex flex-1 items-end justify-around gap-2">
              {SIZES.map((s) => (
                <div key={s} className="flex flex-col items-center gap-1">
                  {v.render(s, fg)}
                  <span className="text-[9px] tabular-nums" style={{ color: fg, opacity: 0.4 }}>{s}px</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function LogosPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight">Ledrix delta — logo lab</h1>
        <p className="mt-1 text-sm text-slate-400">
          Four directions, rendered at real sizes (your VAL orb uses ~14–28px). Pick a row and I&apos;ll apply it to the one canonical
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">LedrixDelta.tsx</code> — then add finish (cyan gradient sheen / glow) to the winner.
        </p>

        <div className="mt-8 flex flex-col gap-6">
          <Board label="On dark · cyan" sub="The default — brand accent on the black UI." bg="#0a0a0a" fg={CYAN} />
          <Board label="On dark · white" sub="Mono on dark (favicons, watermarks)." bg="#0a0a0a" fg="#ffffff" />
          <Board label="On light · ink" sub="Mono on white (print, the report PDF)." bg="#f4f4f5" fg="#0b0b0b" />
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Tell me a letter (A–D) — or mix-and-match (e.g. “B shape but off-center gap like A”).
        </p>
      </div>
    </main>
  );
}
