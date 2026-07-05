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
          background: '#0b0f11',
          backgroundImage: 'radial-gradient(circle at 50% 32%, rgba(33,123,232,0.10), transparent 60%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          {/* Delta mark, drawn with borders so it needs no glyph/font */}
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '48px solid transparent',
              borderRight: '48px solid transparent',
              borderBottom: '82px solid #217BE8',
            }}
          />
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
