import { ImageResponse } from 'next/og';

// Branded social-share card (1200×630) auto-wired by Next as og:image for the whole site.
export const alt = 'Ledrix — The AI Backup for Home Inspectors';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B0C0E',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          {/* The Ledrix logo (owner 2026-11-26, option D): the delta in white. Same geometry as components/LedrixDelta.tsx. */}
          <svg width="112" height="112" viewBox="0 0 100 100">
            <defs>
              <mask id="g"><rect width="100" height="100" fill="white" /><rect x="29.2" y="74.64" width="20.8" height="12" fill="black" /></mask>
            </defs>
            <path d="M50 15.36 L90 84.64 L10 84.64 Z M47.40 28.86 L20.39 75.64 L74.41 75.64 Z" fill="#FFFFFF" fillRule="evenodd" mask="url(#g)" />
          </svg>
          <div style={{ fontSize: 124, fontWeight: 800, color: '#e7f0f2', letterSpacing: -4 }}>Ledrix</div>
        </div>
        <div style={{ fontSize: 46, fontWeight: 600, color: '#9fb2b7', marginTop: 34 }}>
          The AI Backup for Home Inspectors
        </div>
        <div style={{ fontSize: 22, color: '#5f7378', marginTop: 30, letterSpacing: 8 }}>
          POWERED BY LEDRIX INTELLIGENCE
        </div>
      </div>
    ),
    { ...size },
  );
}
