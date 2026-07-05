'use client';

// Logo lab — throwaway comparison of delta directions at multiple sizes on dark +
// light, so we can pick a shape. The winner gets applied to components/LedrixDelta.tsx.
import { LedrixDelta } from '@/components/LedrixDelta';
import ValOrbVoice from '@/components/ValOrbVoice';

const BLUE = '#217BE8';

// App icons in use — auto-collected from the inspector app (MaterialCommunityIcons,
// which map 1:1 to Material Design Icons). Snapshot; re-grep the app to refresh.
const APP_ICONS = [
  'account-circle-outline', 'account-cog-outline', 'account-group-outline', 'account-hard-hat', 'account-multiple-outline',
  'account-off-outline', 'account-outline', 'account-plus-outline', 'account-remove-outline', 'account-search-outline',
  'account-tie-outline', 'account-voice', 'air-conditioner', 'alert-circle', 'alert-circle-outline', 'alert-decagram',
  'alert-decagram-outline', 'alert-octagon', 'alert-octagon-outline', 'alert-outline', 'arrow-down', 'arrow-expand',
  'arrow-left', 'arrow-right', 'arrow-up', 'auto-fix', 'backup-restore', 'badge-account-outline', 'bell-alert-outline',
  'book-check-outline', 'book-plus', 'briefcase-outline', 'cable-data', 'calendar-arrow-right', 'calendar-blank-outline',
  'calendar-check', 'calendar-check-outline', 'calendar-month-outline', 'calendar-outline', 'calendar-plus', 'call-merge',
  'camera-burst', 'camera-enhance-outline', 'camera-flip-outline', 'camera-iris', 'camera-outline', 'camera-plus',
  'camera-plus-outline', 'card-account-details-outline', 'cash-remove', 'cellphone-link', 'chat-outline', 'check-all',
  'check-bold', 'check-circle', 'check-circle-outline', 'check-decagram', 'check-decagram-outline',
  'checkbox-blank-circle-outline', 'checkbox-marked-circle', 'chevron-down', 'chevron-left', 'chevron-right', 'chevron-up',
  'city-variant-outline', 'clipboard-alert-outline', 'clipboard-check-outline', 'clipboard-list-outline',
  'clipboard-plus-outline', 'clipboard-search-outline', 'clock-alert-outline', 'clock-check-outline', 'clock-outline',
  'clock-time-four-outline', 'close-circle', 'close-circle-outline', 'close-thick', 'cloud-check-outline',
  'cloud-download-outline', 'cloud-off-outline', 'cloud-sync-outline', 'cloud-upload-outline', 'cog-outline',
  'comment-question-outline', 'content-save-check', 'content-save-outline', 'credit-card-outline', 'database-check',
  'delete-outline', 'delete-sweep-outline', 'dots-horizontal', 'dots-vertical', 'electric-switch', 'email-outline',
  'engine-outline', 'export-variant', 'eye-off-outline', 'eye-outline', 'file-alert-outline', 'file-chart-outline',
  'file-cog-outline', 'file-document-outline', 'file-export-outline', 'file-pdf-box', 'file-search-outline',
  'file-send-outline', 'file-sign', 'flag-variant', 'flag-variant-outline', 'flask-outline', 'folder-image',
  'format-list-bulleted', 'garage-variant', 'hammer-wrench', 'hand-wave-outline', 'hard-hat', 'help-circle-outline',
  'home-account', 'home-automation', 'home-city-outline', 'home-group', 'home-import-outline', 'home-minus-outline',
  'home-outline', 'home-roof', 'home-search-outline', 'home-variant', 'home-variant-outline', 'hot-tub',
  'image-multiple-outline', 'image-off-outline', 'image-outline', 'image-plus', 'image-search-outline',
  'information-outline', 'layers-triple', 'lightning-bolt', 'lightning-bolt-circle', 'lightning-bolt-outline',
  'link-variant', 'lock-check-outline', 'lock-outline', 'map-marker-check', 'map-marker-outline', 'map-marker-radius',
  'map-marker-radius-outline', 'map-search-outline', 'message-text', 'message-text-outline', 'microphone-outline',
  'navigation-variant-outline', 'note-plus-outline', 'note-text-outline', 'office-building', 'pencil-outline',
  'pencil-plus-outline', 'pencil-ruler', 'phone-alert-outline', 'phone-outline', 'play-circle', 'play-circle-outline',
  'plus-box-outline', 'plus-circle-outline', 'robot-off-outline', 'robot-outline', 'scale-balance', 'send-check-outline',
  'send-outline', 'shape-outline', 'shape-plus', 'share-outline', 'shield-alert-outline', 'shield-check',
  'shield-check-outline', 'shield-home', 'shield-lock-outline', 'smoke-detector-alert', 'solar-panel', 'solar-power',
  'source-branch', 'star-outline', 'tag-multiple-outline', 'tag-outline', 'text-recognition', 'thermometer-water',
  'timer-outline', 'trash-can-outline', 'tray-arrow-up', 'tumble-dryer', 'upload-outline', 'vector-combine',
  'vector-link', 'view-dashboard-outline', 'view-grid-outline', 'washing-machine', 'water-alert', 'water-boiler',
  'water-check', 'water-pump', 'wrench-outline',
];

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
function DeltaUniform({ size = 48, color = BLUE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={triPath(size, 0.1, 0.34, 0.66)} stroke={color} strokeWidth={size * 0.06} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// C — concentric nested outlines (the #6/#7 family), both with a base gap.
function DeltaConcentric({ size = 48, color = BLUE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={triPath(size, 0.08, 0.37, 0.63)} stroke={color} strokeWidth={size * 0.05} strokeLinecap="round" strokeLinejoin="round" />
      <path d={triPath(size, 0.29, 0.3, 0.7)} stroke={color} strokeWidth={size * 0.05} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// D — solid filled delta with an upward triangular notch cut from the base center.
function DeltaSolid({ size = 48, color = BLUE }: { size?: number; color?: string }) {
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

// VAL mark = the Ledrix delta + arcs (so VAL reads distinct from the bare Ledrix Δ).
// The delta sits centered at 64%; arcs are drawn around it in the 100-unit overlay.
function ValMark({ size, color, variant }: { size: number; color: string; variant: 'radiate' | 'ring' | 'listen' }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LedrixDelta size={size * 0.64} color={color} />
      </div>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ position: 'absolute', inset: 0 }}>
        {variant === 'radiate' && (
          <>
            <path d="M40 22 Q50 13.5 60 22" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
            <path d="M33 15.5 Q50 4 67 15.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
          </>
        )}
        {variant === 'ring' && <circle cx="50" cy="50" r="43" stroke={color} strokeWidth="2.4" />}
        {variant === 'listen' && (
          <>
            <path d="M29 37 Q21 50 29 63" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
            <path d="M20 30 Q9 50 20 70" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
            <path d="M71 37 Q79 50 71 63" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
            <path d="M80 30 Q91 50 80 70" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

type Variant = { name: string; note: string; render: (s: number, c: string) => React.ReactNode };

const VARIANTS: Variant[] = [
  { name: 'A · Calligraphic + off-center gap', note: 'Chosen mark. Variable weight (thin left, thick right), gap offset. Blue shows the sheen finish; white/ink are the mono treatments.', render: (s, c) => <LedrixDelta size={s} color={c} sheen={c === BLUE} /> },
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
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">LedrixDelta.tsx</code> — then add finish (blue gradient sheen / glow) to the winner.
        </p>

        <div className="mt-8 flex flex-col gap-6">
          <Board label="On dark · blue" sub="The default — brand accent on the black UI." bg="#0a0a0a" fg={BLUE} />
          <Board label="On dark · white" sub="Mono on dark (favicons, watermarks)." bg="#0a0a0a" fg="#ffffff" />
          <Board label="On light · ink" sub="Mono on white (print, the report PDF)." bg="#f4f4f5" fg="#0b0b0b" />
        </div>

        <section className="mt-12 rounded-2xl p-6" style={{ background: '#0a0a0a' }}>
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-accent/80">VAL marks — delta + arcs</h2>
          <p className="mt-1 text-xs text-slate-500">Bare Δ = Ledrix; Δ + arcs = VAL. Blue, at orb sizes on dark.</p>
          <div className="mt-6 flex flex-col gap-3">
            {([
              { name: 'Reference · bare Ledrix Δ', render: (s: number) => <LedrixDelta size={s} color={BLUE} /> },
              { name: 'V1 · Radiating arcs (voice)', render: (s: number) => <ValMark size={s} color={BLUE} variant="radiate" /> },
              { name: 'V2 · Orbital ring (presence)', render: (s: number) => <ValMark size={s} color={BLUE} variant="ring" /> },
              { name: 'V3 · Listening arcs (flanking)', render: (s: number) => <ValMark size={s} color={BLUE} variant="listen" /> },
            ] as { name: string; render: (s: number) => React.ReactNode }[]).map((v) => (
              <div key={v.name} className="flex items-center gap-4 rounded-xl border border-white/[0.08] px-4 py-3">
                <div className="w-56 shrink-0 text-[13px] font-bold text-white">{v.name}</div>
                <div className="flex flex-1 items-center justify-around gap-3">
                  {[58, 40, 26].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-1">
                      {v.render(s)}
                      <span className="text-[9px] text-slate-500">{s}px</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 flex flex-col items-center gap-3 rounded-2xl p-10" style={{ background: '#070707' }}>
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-accent/80">VAL orb — live</h2>
          <p className="text-center text-xs text-slate-500">Tap to talk. The orb chimes, opens the mic, and spreads into the waveform — it lights up as you speak. Tap again to collapse.</p>
          <div className="py-4"><ValOrbVoice size={72} /></div>
        </section>

        <section className="mt-14">
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7/css/materialdesignicons.min.css" />
          <h2 className="text-lg font-bold">App icons <span className="text-sm font-normal text-slate-500">({APP_ICONS.length} · MaterialCommunityIcons)</span></h2>
          <p className="mt-1 text-xs text-slate-500">Auto-collected from the inspector app. Names map 1:1 to Material Design Icons.</p>
          <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
            {APP_ICONS.map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
                <i className={`mdi mdi-${n}`} style={{ fontSize: 24, lineHeight: 1, color: BLUE }} aria-hidden />
                <span className="break-all text-center text-[8px] leading-tight text-slate-500">{n}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-8 text-xs text-slate-500">
          Tell me a letter (A–D) — or mix-and-match (e.g. “B shape but off-center gap like A”).
        </p>
      </div>
    </main>
  );
}
