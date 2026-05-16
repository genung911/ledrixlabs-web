'use client';
import Image from 'next/image';
import Link from 'next/link';

const ACCENT = '#00F3FF';

function ValDeltaSVG({ size = 28, color = ACCENT }: { size?: number; color?: string }) {
  const pad = size * 0.10;
  const W   = size - pad * 2;
  const H   = W * (Math.sqrt(3) / 2);
  const ty  = (size - H) / 2;
  const by  = ty + H;
  const TX  = size / 2, TY = ty;
  const BLX = pad,      BLY = by;
  const BRX = pad + W,  BRY = by;
  const GL  = BLX + W * 0.30;
  const GR  = BLX + W * 0.70;
  const d   = `M ${TX} ${TY} L ${BLX} ${BLY} L ${GL} ${BLY} M ${GR} ${BRY} L ${BRX} ${BRY} L ${TX} ${TY}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={d} stroke={color} strokeWidth={size * 0.055} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Logo({ size = 36 }: { size?: number }) {
  const r = Math.round(size * 0.22);
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      backgroundColor: '#080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <ValDeltaSVG size={Math.round(size * 0.82)} />
    </div>
  );
}

export default function Home() {
  return (
    <div style={{ backgroundColor: '#080808', minHeight: '100vh', color: '#fff' }}>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 24px',
        backgroundColor: 'rgba(8,8,8,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #111',
      }}>
        <Logo size={30} />
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#product" style={{ color: '#555', fontSize: 11, fontWeight: 700, letterSpacing: 2, textDecoration: 'none' }}>PRODUCT</a>
          <a href="#vision" style={{ color: '#555', fontSize: 11, fontWeight: 700, letterSpacing: 2, textDecoration: 'none' }}>VISION</a>
          <a href="#contact" style={{ color: '#555', fontSize: 11, fontWeight: 700, letterSpacing: 2, textDecoration: 'none' }}>CONTACT</a>
          <a
            href="https://apps.apple.com"
            style={{
              backgroundColor: ACCENT, color: '#000', fontSize: 11, fontWeight: 900,
              letterSpacing: 1, padding: '9px 16px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            APP STORE ↗
          </a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', textAlign: 'center',
        padding: '120px 24px 80px',
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #00F3FF0d 0%, transparent 70%)',
      }}>
        <h1 style={{ fontSize: 'clamp(56px, 12vw, 140px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: -4, marginBottom: 24, color: '#fff' }}>
          Ledrix
        </h1>

        <h2 style={{ fontSize: 'clamp(28px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: -2, marginBottom: 28, maxWidth: 900 }}>
          Infrastructure Intelligence.<br />
          <span style={{ color: ACCENT }}>Before Disaster Strikes.</span>
        </h2>

        <p style={{ fontSize: 18, color: '#555', maxWidth: 560, lineHeight: 1.7, marginBottom: 48 }}>
          Ledrix is an AI-powered inspection platform for licensed professionals —
          combining real-time anomaly detection, voice commands, and automated
          reporting to catch what eyes miss.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href="https://apps.apple.com"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              backgroundColor: '#fff', color: '#000', padding: '14px 28px',
              borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 14,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Download on App Store
          </a>
          <a
            href="#vision"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: 'transparent', color: '#fff', padding: '14px 28px',
              borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 14,
              border: '1px solid #222',
            }}
          >
            See the Vision →
          </a>
        </div>
        <p style={{ marginTop: 20, fontSize: 11, color: '#333', fontFamily: 'Roboto Mono, monospace', letterSpacing: 1 }}>
          iOS · <span style={{ color: '#555' }}>ANDROID COMING SOON</span>
        </p>

        {/* Stats */}
        <div style={{
          display: 'flex', gap: 48, marginTop: 80, paddingTop: 48,
          borderTop: '1px solid #111', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {[
            { val: 'AI', label: 'Anomaly Detection' },
            { val: 'VAL', label: 'Voice Activated Logging' },
            { val: 'APP', label: 'Client Home Portal' },
            { val: '4K', label: 'Evidence Capture' },
          ].map(s => (
            <div key={s.val} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, letterSpacing: -1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Inspector Feature Image ─────────────────────────────────── */}
      <section style={{
        borderTop: '1px solid #0d0d0d',
        borderBottom: '1px solid #0d0d0d',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div className="ledrix-how-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          minHeight: 560,
        }}>
          {/* Left — image */}
          <div className="ledrix-how-img" style={{ position: 'relative', minHeight: 480, overflow: 'hidden' }}>
            <Image
              src="/site_image.png"
              alt="Inspector using Ledrix with live floor plan overlay"
              fill
              style={{ objectFit: 'cover', objectPosition: 'center 35%' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to right, transparent 60%, #080808 100%)',
            }} />
          </div>

          {/* Right — copy */}
          <div className="ledrix-how-copy" style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '80px 64px 80px 48px',
            background: '#080808',
          }}>
            <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 20 }}>
              HOW IT WORKS
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 52px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1.05, marginBottom: 24 }}>
              Walk the property.<br />
              <span style={{ color: ACCENT }}>Ledrix builds the record.</span>
            </h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.8, maxWidth: 420, marginBottom: 36 }}>
              As you move through the structure, Ledrix maps every room, logs every anomaly, and anchors every photo to a live floor plan — automatically. No tapping. No templates. No late-night write-ups.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                'Dead-reckoning spatial engine tracks your position in real time',
                'AI detects structural anomalies from your camera feed',
                'VAL logs findings by voice while your hands stay on the job',
              ].map(pt => (
                <div key={pt} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginTop: 7, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Product ─────────────────────────────────────────────────── */}
      <section id="product" style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 64, textAlign: 'center' }}>
          <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
            THE PLATFORM
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2 }}>
            Built for inspectors who<br />can't miss anything.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2 }}>
          {[
            {
              icon: '⬡',
              title: 'AI Anomaly Detection',
              body: 'Real-time structural defect identification as you scan. Every finding tagged, timestamped, and GPS-anchored to the property record.',
            },
            {
              icon: <ValDeltaSVG size={28} />,
              title: 'VAL Voice Commands',
              body: 'Hands-free inspection logging. Speak observations while your hands stay on the tool. VAL tags anomalies by voice during live scans.',
            },
            {
              icon: '▦',
              title: 'Automated Floor Plans',
              body: 'Dead-reckoning spatial engine builds real-time floor plans as you walk the property — no manual drawing required.',
            },
            {
              icon: '◉',
              title: 'Instant PDF Reports',
              body: 'Professional inspection reports generated in seconds with GPS-anchored evidence, SHA-256 integrity hashes, and client delivery in one tap.',
            },
            {
              icon: '⬔',
              title: 'Home App Delivery',
              body: 'Clients receive a live home portal with their inspection data, maintenance schedule, anomaly resolution flow, and property records.',
            },
            {
              icon: '◎',
              title: 'Evidence Chain',
              body: 'Every photo, anomaly, and timestamp is cryptographically hashed. Tamper-evident records built for legal and insurance use.',
            },
          ].map(f => (
            <div key={f.title} style={{
              backgroundColor: '#0a0a0a', border: '1px solid #111',
              padding: '36px 32px',
            }}>
              <div style={{ fontSize: 28, marginBottom: 16, color: ACCENT }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, letterSpacing: -0.5 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── App Screenshots ─────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px 100px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 56, textAlign: 'center' }}>
          <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
            LIVE APP
          </div>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 48px)', fontWeight: 900, letterSpacing: -2 }}>
            Built for the field.<br />
            <span style={{ color: ACCENT }}>Not the office.</span>
          </h2>
        </div>

        <div style={{
          display: 'flex', gap: 40, justifyContent: 'center', alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}>
          {/* Screenshot 1 — Inspection overview + floor plan */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flex: '0 0 auto' }}>
            <div style={{
              borderRadius: 36, overflow: 'hidden',
              border: '1px solid rgba(0,243,255,0.18)',
              boxShadow: '0 0 60px rgba(0,243,255,0.08)',
              width: 240,
            }}>
              <Image
                src="/screenshot_floorplan.png"
                alt="Ledrix inspection overview with live floor plan"
                width={240}
                height={520}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Live Floor Plan</div>
              <div style={{ color: '#444', fontSize: 11, maxWidth: 200, lineHeight: 1.6 }}>
                Real-time spatial mapping as you walk the property.
              </div>
            </div>
          </div>

          {/* Screenshot 2 — Anomaly detail */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flex: '0 0 auto' }}>
            <div style={{
              borderRadius: 36, overflow: 'hidden',
              border: '1px solid rgba(0,243,255,0.18)',
              boxShadow: '0 0 60px rgba(0,243,255,0.08)',
              width: 240,
            }}>
              <Image
                src="/screenshot_anomaly.png"
                alt="Ledrix anomaly detail with AI analysis"
                width={240}
                height={520}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>AI Anomaly Detail</div>
              <div style={{ color: '#444', fontSize: 11, maxWidth: 200, lineHeight: 1.6 }}>
                Every finding tagged, classified, and repair-cost estimated automatically.
              </div>
            </div>
          </div>

          {/* Screenshot 3 — Anomaly pinned to floor plan */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flex: '0 0 auto' }}>
            <div style={{
              borderRadius: 36, overflow: 'hidden',
              border: '1px solid rgba(0,243,255,0.18)',
              boxShadow: '0 0 60px rgba(0,243,255,0.08)',
              width: 240,
            }}>
              <Image
                src="/site_image_2.png"
                alt="Ledrix anomaly pinned to live floor plan"
                width={240}
                height={520}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>GPS-Anchored Evidence</div>
              <div style={{ color: '#444', fontSize: 11, maxWidth: 200, lineHeight: 1.6 }}>
                Every anomaly pinned to an exact location on the live floor plan.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── See It Live ─────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 24px',
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, #00F3FF06 0%, transparent 70%)',
        borderTop: '1px solid #0d0d0d',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
              OPEN A SAMPLE
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 48px)', fontWeight: 900, letterSpacing: -2, marginBottom: 16 }}>
              See exactly what your clients receive.
            </h2>
            <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
              Every Ledrix inspection delivers two things: a live client home portal and a tamper-evident PDF report.
            </p>
          </div>

          <div className="ledrix-sample-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

            {/* Home Portal tile */}
            <a
              href="/sample-home-app.html"
              target="_blank"
              className="ledrix-sample-tile"
              style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                backgroundColor: '#080808', border: '1px solid rgba(0,243,255,0.18)',
                padding: '52px 48px', textDecoration: 'none', minHeight: 380,
                boxShadow: 'inset 0 0 80px rgba(0,243,255,0.03)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Subtle grid bg */}
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.4,
                backgroundImage: 'linear-gradient(rgba(0,243,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }} />
              <div style={{ position: 'relative' }}>
                {/* Val icon */}
                <div style={{ marginBottom: 36 }}>
                  <ValDeltaSVG size={72} color={ACCENT} />
                </div>
                <div style={{ color: ACCENT, fontSize: 9, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>
                  CLIENT HOME APP
                </div>
                <div style={{ color: '#fff', fontSize: 'clamp(20px, 2.5vw, 32px)', fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, marginBottom: 16 }}>
                  Sample<br />Home Portal
                </div>
                <div style={{ color: '#444', fontSize: 13, lineHeight: 1.7, maxWidth: 360 }}>
                  The live home intelligence portal your client receives after every inspection — health score, findings, maintenance schedule, and property records. Permanent. Always accessible.
                </div>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginTop: 40 }}>
                <span style={{ color: ACCENT, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>OPEN SAMPLE</span>
                <span style={{ color: ACCENT, fontSize: 18, lineHeight: 1 }}>→</span>
              </div>
            </a>

            {/* PDF Report tile */}
            <a
              href="/sample-report.html"
              target="_blank"
              className="ledrix-sample-tile"
              style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                backgroundColor: '#080808', border: '1px solid #111',
                padding: '52px 48px', textDecoration: 'none', minHeight: 380,
              }}
            >
              <div>
                {/* Document icon */}
                <div style={{ marginBottom: 36 }}>
                  <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                    <rect x="10" y="6" width="42" height="54" rx="4" stroke="#333" strokeWidth="2" />
                    <rect x="10" y="6" width="42" height="54" rx="4" fill="none" />
                    <line x1="20" y1="24" x2="42" y2="24" stroke="#333" strokeWidth="2" strokeLinecap="round" />
                    <line x1="20" y1="33" x2="42" y2="33" stroke="#333" strokeWidth="2" strokeLinecap="round" />
                    <line x1="20" y1="42" x2="34" y2="42" stroke="#333" strokeWidth="2" strokeLinecap="round" />
                    <rect x="32" y="42" width="24" height="18" rx="3" fill="#080808" stroke="#555" strokeWidth="1.5" />
                    <line x1="38" y1="49" x2="50" y2="49" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="38" y1="54" x2="46" y2="54" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ color: '#444', fontSize: 9, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>
                  INSPECTION REPORT
                </div>
                <div style={{ color: '#fff', fontSize: 'clamp(20px, 2.5vw, 32px)', fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, marginBottom: 16 }}>
                  Sample<br />PDF Report
                </div>
                <div style={{ color: '#444', fontSize: 13, lineHeight: 1.7, maxWidth: 360 }}>
                  Cryptographically signed, GPS-anchored, AI-generated inspection report complete with system scores, repair cost estimates, and a SHA-256 integrity hash.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 40 }}>
                <span style={{ color: '#555', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>OPEN SAMPLE</span>
                <span style={{ color: '#555', fontSize: 18, lineHeight: 1 }}>→</span>
              </div>
            </a>

          </div>
        </div>
      </section>

      {/* ── The New Way ─────────────────────────────────────────────── */}
      <section id="vision" style={{
        padding: '100px 24px',
        background: 'radial-gradient(ellipse 100% 80% at 50% 50%, #00F3FF08 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Heading */}
          <div style={{ marginBottom: 72, textAlign: 'center' }}>
            <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
              THE LEDRIX WAY
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2 }}>
              The end of the<br />
              <span style={{ color: ACCENT }}>tap-and-scroll era.</span>
            </h2>
            <p style={{ fontSize: 16, color: '#444', maxWidth: 600, margin: '24px auto 0', lineHeight: 1.7 }}>
              Traditional apps force you to look at a screen instead of the structure.
              With VAL, your interface is the house itself. You see it, you say it, Ledrix logs it.
            </p>
          </div>

          {/* Three pillars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2, marginBottom: 80 }}>
            {[
              {
                label: 'ZERO-UI REPORTING',
                title: 'Say it. Done.',
                body: 'Instead of tapping Electrical → Panel → Federal Pacific, you say: "VAL, identify critical fire risk: Federal Pacific Stab-Lok panel in garage." The AI handles categorization, the write-up, and severity tagging instantly.',
              },
              {
                label: 'SPATIAL AWARENESS',
                title: 'It already knows where you are.',
                body: 'Ledrix uses a dead-reckoning spatial engine to track your position in real time. You don\'t have to tell it you\'re in the master bedroom — it knows from the live floor plan being built as you walk.',
              },
              {
                label: 'INSTANT DELIVERY',
                title: 'Report done when you leave.',
                body: 'No late-night typing. No manual write-ups at home. When the inspection ends, the report is finished — GPS-anchored evidence, AI-generated findings, and client delivery in one tap.',
              },
            ].map(p => (
              <div key={p.label} style={{ backgroundColor: '#0a0a0a', border: '1px solid #111', padding: '40px 32px' }}>
                <div style={{ color: ACCENT, fontSize: 9, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>{p.label}</div>
                <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12, letterSpacing: -0.5 }}>{p.title}</h3>
                <p style={{ fontSize: 13, color: '#555', lineHeight: 1.8 }}>{p.body}</p>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
              OLD WAY VS. LEDRIX
            </div>
            <h3 style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: 900, letterSpacing: -1, marginBottom: 48 }}>
              A workflow built for the field,<br />not the office.
            </h3>
          </div>

          <div className="ledrix-comparison-wrap" style={{ overflowX: 'auto' }}>
          <div className="ledrix-comparison-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #161616', overflow: 'hidden' }}>
            {/* Headers */}
            <div style={{ backgroundColor: '#0a0a0a', padding: '20px 32px', borderBottom: '1px solid #161616', borderRight: '1px solid #161616' }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: '#333' }}>THE OLD WAY</span>
            </div>
            <div style={{ backgroundColor: '#00F3FF0d', padding: '20px 32px', borderBottom: '1px solid #00F3FF22' }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: ACCENT }}>THE LEDRIX WAY</span>
            </div>

            {[
              ['Eyes on the Screen: Constantly checking boxes.', 'Eyes on the Infrastructure: AI-assisted observation.'],
              ['Manual Data Entry: Tapping through 100+ sections.', 'Natural Language: "VAL, log minor crack in foundation."'],
              ['Late-Night Reporting: 2 hours typing at home.', 'Instant Delivery: Report finished when you leave.'],
              ['Static Images: Photos with no context.', 'GPS-Anchored Evidence: Every photo tied to a 2D map.'],
            ].map(([old, neo], i) => (
              <>
                <div key={`old-${i}`} style={{
                  padding: '24px 32px', borderRight: '1px solid #161616',
                  borderBottom: i < 3 ? '1px solid #161616' : 'none',
                  backgroundColor: '#080808',
                }}>
                  <p style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>{old}</p>
                </div>
                <div key={`new-${i}`} style={{
                  padding: '24px 32px',
                  borderBottom: i < 3 ? '1px solid #161616' : 'none',
                  backgroundColor: '#00F3FF05',
                }}>
                  <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7 }}>{neo}</p>
                </div>
              </>
            ))}
          </div>
          </div>

        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section style={{
        padding: '100px 24px', textAlign: 'center',
        borderTop: '1px solid #111',
      }}>
        <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 24 }}>
          GET STARTED
        </div>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2, marginBottom: 24 }}>
          Download Ledrix today.
        </h2>
        <p style={{ fontSize: 16, color: '#444', marginBottom: 48 }}>
          Available now for licensed inspectors on iOS. Android coming soon.
        </p>
        <a
          href="https://apps.apple.com"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            backgroundColor: ACCENT, color: '#000', padding: '16px 36px',
            borderRadius: 12, textDecoration: 'none', fontWeight: 900, fontSize: 14,
            letterSpacing: 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          Download on App Store
        </a>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────── */}
      <section id="contact" style={{
        padding: '60px 24px', textAlign: 'center',
        borderTop: '1px solid #111',
      }}>
        <p style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>Questions or partnership inquiries</p>
        <a href="mailto:ledrixlabs@gmail.com" style={{ color: ACCENT, fontSize: 14, fontWeight: 700, textDecoration: 'none', letterSpacing: 1 }}>
          ledrixlabs@gmail.com
        </a>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid #0d0d0d', padding: '32px 40px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Logo size={22} />
          <span style={{ color: '#222', fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}>
            © 2026 Ledrix Labs. All rights reserved.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/privacy" style={{ color: '#333', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</Link>
          <Link href="/terms" style={{ color: '#333', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>Terms of Service</Link>
          <a href="mailto:ledrixlabs@gmail.com" style={{ color: '#333', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>Contact</a>
        </div>
      </footer>

    </div>
  );
}
