'use client';
import Image from 'next/image';
import Link from 'next/link';

const ACCENT = '#00F3FF';

function Logo({ size = 36 }: { size?: number }) {
  return <Image src="/logo.png" alt="Ledrix" width={size} height={size} style={{ borderRadius: 8 }} />;
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
        <div style={{
          display: 'inline-block', backgroundColor: '#00F3FF11', border: '1px solid #00F3FF33',
          borderRadius: 100, padding: '6px 16px', marginBottom: 32,
        }}>
          <span style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>
            NOW AVAILABLE ON THE APP STORE
          </span>
        </div>

        <h1 style={{ fontSize: 'clamp(40px, 8vw, 96px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: -3, marginBottom: 28, maxWidth: 900 }}>
          Infrastructure Intelligence.<br />
          <span style={{ color: ACCENT }}>Before Disaster Strikes.</span>
        </h1>

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

        {/* Stats */}
        <div style={{
          display: 'flex', gap: 48, marginTop: 80, paddingTop: 48,
          borderTop: '1px solid #111', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {[
            { val: 'AI', label: 'Anomaly Detection' },
            { val: 'VAL', label: 'Voice Activated Logging' },
            { val: 'PDF', label: 'Instant Client Reports' },
            { val: '4K', label: 'Evidence Capture' },
          ].map(s => (
            <div key={s.val} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, letterSpacing: -1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
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
              icon: '◈',
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

      {/* ── Vision ──────────────────────────────────────────────────── */}
      <section id="vision" style={{
        padding: '100px 24px',
        background: 'radial-gradient(ellipse 100% 80% at 50% 50%, #00F3FF08 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 64, textAlign: 'center' }}>
            <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
              LEDRIX LABS VISION
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2 }}>
              The future of infrastructure<br />
              <span style={{ color: ACCENT }}>is autonomous.</span>
            </h2>
            <p style={{ fontSize: 16, color: '#444', maxWidth: 560, margin: '24px auto 0', lineHeight: 1.7 }}>
              We're building the world's first self-repairing infrastructure network —
              sensors that watch, AI that thinks, and robots that act before failure happens.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {[
              {
                phase: '01',
                title: 'Sensor Pods',
                body: 'Battery-operated sensor pods installed in attics, crawl spaces, and plumbing walls via a simple sheath system. Homeowners install them in minutes. The grid never sleeps.',
                status: 'IN DEVELOPMENT',
              },
              {
                phase: '02',
                title: 'Autonomous Drones',
                body: 'Docked drones that launch on schedule — daily or hourly — to inspect exteriors, attics, and crawl spaces. No inspector required for routine monitoring.',
                status: 'COMING SOON',
              },
              {
                phase: '03',
                title: 'Repair Robots',
                body: 'When a sensor pings an anomaly, a robot dispatches to make the repair before it becomes a disaster. Predictive maintenance at the structural level.',
                status: 'COMING SOON',
              },
              {
                phase: '04',
                title: 'Infrastructure AI',
                body: 'Every inspection, every sensor reading, every repair — training a proprietary AI model on the largest structural dataset ever built. The model gets smarter with every home.',
                status: 'LONG-TERM',
              },
            ].map(v => (
              <div key={v.phase} style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #00F3FF22',
                padding: '36px 32px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 24, right: 24,
                  fontSize: 9, fontWeight: 700, letterSpacing: 2,
                  color: v.status === 'IN DEVELOPMENT' ? ACCENT : '#333',
                  fontFamily: 'Roboto Mono, monospace',
                }}>
                  {v.status}
                </div>
                <div style={{ fontSize: 11, color: '#333', fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 12 }}>
                  PHASE {v.phase}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 12, letterSpacing: -0.5 }}>{v.title}</h3>
                <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>{v.body}</p>
              </div>
            ))}
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
          Available now for licensed inspectors on iOS.
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
