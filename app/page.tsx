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
            href="https://apps.apple.com/us/app/ledrix/id6762490661"
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
          Catch what you walked past.<br />
          <span style={{ color: ACCENT }}>Deliver before you leave.</span>
        </h2>

        <p style={{ fontSize: 18, color: '#555', maxWidth: 580, lineHeight: 1.7, marginBottom: 48 }}>
          Finish the report before you leave the driveway. Catch the defect you
          walked past. And hand every client a home they finally understand — not a
          40-page PDF they’ll never open. Ledrix is the edge that wins the next referral.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href="https://apps.apple.com/us/app/ledrix/id6762490661"
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
            { val: 'ZERO', label: 'Late-Night Write-Ups' },
            { val: '1-TAP', label: 'Client Delivery' },
            { val: 'PROOF', label: 'On Every Finding' },
            { val: 'LIVE', label: 'Client Home Portal' },
          ].map(s => (
            <div key={s.val} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, letterSpacing: -1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Purpose-built positioning ───────────────────────────────── */}
      <section style={{ padding: '72px 24px', textAlign: 'center', borderTop: '1px solid #0d0d0d',
        background: 'radial-gradient(ellipse 70% 80% at 50% 50%, #00F3FF07 0%, transparent 70%)' }}>
        <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 18 }}>
          LEDRIX INTELLIGENCE
        </div>
        <h2 style={{ fontSize: 'clamp(26px, 4.5vw, 48px)', fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.1, maxWidth: 780, margin: '0 auto' }}>
          Not general AI.<br />
          <span style={{ color: ACCENT }}>Intelligence built for homes.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555', maxWidth: 600, margin: '22px auto 0', lineHeight: 1.7 }}>
          Ledrix isn’t a chatbot that dabbles in everything. It’s purpose-built for one thing —
          the systems, defects, and standards of the homes you inspect. That focus is exactly why
          it catches what general tools walk right past.
        </p>
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
              alt="Inspector using Ledrix to capture cloud-analyzed evidence"
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
              FOR INSPECTORS
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 52px)', fontWeight: 900, letterSpacing: -2, lineHeight: 1.05, marginBottom: 24 }}>
              Walk the property.<br />
              <span style={{ color: ACCENT }}>Leave with it finished.</span>
            </h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.8, maxWidth: 420, marginBottom: 36 }}>
              Inspect the way you always have. The findings, the write-ups, and the full report assemble themselves as you go — so you walk out finished instead of facing two hours of typing at the kitchen table.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                'Walk out finished — the report writes itself as you inspect',
                'Never miss a defect: a second set of eyes flags what you photographed but didn’t log',
                'Your judgment is the final word — nothing ships until you confirm it',
                'Protect your license: every finding backed by timestamped, GPS-anchored proof',
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
              title: 'Never Miss a Defect',
              body: 'A second set of eyes on every photo. The deficiency you walked past gets surfaced before it turns into a callback — or a claim against your license.',
            },
            {
              icon: <ValDeltaSVG size={28} />,
              title: 'Your License, Protected',
              body: 'Nothing reaches the report until you confirm it. Your judgment is the final word on every finding — defensible, auditable, and signed by you.',
            },
            {
              icon: '◉',
              title: 'Home by Dinner',
              body: 'The report is finished when you walk out. No late-night write-ups — finalize on the driveway and deliver the PDF and client portal in one tap.',
            },
            {
              icon: '⬔',
              title: 'Clients Who Get It',
              body: 'Your client gets a living home portal — findings in plain language, a maintenance schedule, and property records. Tap any finding for a local cost estimate, pros to call, repair videos, and answers from Ask Ledrix.',
            },
            {
              icon: '◎',
              title: 'Proof on Every Finding',
              body: 'Every finding is bound to timestamped, GPS-tagged photos — defensible documentation that protects you if a call is ever questioned.',
            },
          ].map(f => (
            <div key={f.title} style={{
              backgroundColor: '#0a0a0a',
              border: '1px solid #111',
              padding: '36px 32px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{ fontSize: 28, marginBottom: 16, color: ACCENT }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, letterSpacing: -0.5, color: '#fff' }}>{f.title}</h3>
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

        <div className="ledrix-liveapp-grid" style={{
          display: 'flex', gap: 64, justifyContent: 'center', alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          {/* Phone — Anomaly detail */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flex: '0 0 auto' }}>
            <div style={{
              borderRadius: 36, overflow: 'hidden',
              border: '1px solid rgba(0,243,255,0.18)',
              boxShadow: '0 0 60px rgba(0,243,255,0.08)',
              width: 250,
            }}>
              <Image
                src="/screenshot_anomaly.png"
                alt="Ledrix finding detail with AI analysis"
                width={250}
                height={542}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Findings, Explained</div>
              <div style={{ color: '#444', fontSize: 11, maxWidth: 220, lineHeight: 1.6 }}>
                Each finding written up in plain language, priced, and client-ready — you confirm it.
              </div>
            </div>
          </div>

          {/* Value points beside the phone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 380 }}>
            {[
              { k: 'CAPTURE', t: 'Point, shoot, logged', b: 'Snap the photo — the write-up comes back done: system, severity, and recommended action. No typing.' },
              { k: 'CONFIRM', t: 'You have the final say', b: 'Confirm, adjust, or reject every proposal. Nothing reaches the report until a licensed inspector signs off.' },
              { k: 'DELIVER', t: 'Done when you leave', b: 'Finalize on the driveway. The PDF and the client home portal go out in a single tap.' },
            ].map(item => (
              <div key={item.k} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginTop: 8, flexShrink: 0 }} />
                <div>
                  <div style={{ color: ACCENT, fontSize: 9, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>{item.k}</div>
                  <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>{item.t}</div>
                  <div style={{ color: '#555', fontSize: 13, lineHeight: 1.7 }}>{item.b}</div>
                </div>
              </div>
            ))}
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
              Every Ledrix inspection delivers two things your clients love: a living home portal they’ll actually use, and a clean, professional PDF report.
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
                  The live home intelligence portal your client receives after every inspection — health score, findings, maintenance schedule, and property records. Tap any finding for a local cost estimate, top-rated pros to call, repair videos, and Ask-Ledrix. Permanent. Always accessible.
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
                  A clean, professional inspection report — system scores, repair cost estimates, and every finding backed by GPS-anchored photo proof. Verified and signed by your inspector.
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

      {/* ── For Homeowners ──────────────────────────────────────────── */}
      <section id="homeowners" style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ color: ACCENT, fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
            FOR HOMEOWNERS
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 56px)', fontWeight: 900, letterSpacing: -2 }}>Your home, understood.</h2>
          <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, maxWidth: 600, margin: '18px auto 0' }}>
            Every finding in your report opens into a card that tells you what it means, what it costs near you, and exactly who to call.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 2 }}>
          {[
            { icon: '◎', title: 'Know the cost', body: 'Tap a finding for a location-based repair estimate — priced for your area, not a national average.' },
            { icon: '☎', title: 'Call the right pro', body: 'Top-rated local contractors for that exact trade, sorted by reviews — tap to call, straight from the finding.' },
            { icon: '▶', title: 'Fix it, or don’t', body: 'Related repair videos for the small stuff — with Ledrix telling you plainly when to call a licensed pro instead.' },
            { icon: '✦', title: 'Ask Ledrix', body: 'Ask anything about a finding — is it urgent, can I DIY it, what should I budget — answered straight from your inspection.' },
          ].map(f => (
            <div key={f.title} style={{ backgroundColor: '#0a0a0a', border: '1px solid #111', padding: '36px 32px' }}>
              <div style={{ fontSize: 28, marginBottom: 16, color: ACCENT }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, letterSpacing: -0.5, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>{f.body}</p>
            </div>
          ))}
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
              Traditional apps keep your eyes on a checklist instead of the house.
              Ledrix keeps your focus where it belongs — and turns what you observe
              into a finished, client-ready report.
            </p>
          </div>

          {/* Three pillars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2, marginBottom: 80 }}>
            {[
              {
                label: 'EYES ON THE HOUSE',
                title: 'Inspect, don’t type.',
                body: 'Stop tapping through a hundred menu screens. Talk through the house the way you’d explain it to a client, and Ledrix captures it — so your attention stays on the structure, where it belongs.',
              },
              {
                label: 'YOUR CALL, ALWAYS',
                title: 'Signed by you.',
                body: 'Every finding is yours to confirm, adjust, or reject. What ships is the licensed inspector’s verdict — defensible, auditable, and signed by you.',
              },
              {
                label: 'INSTANT DELIVERY',
                title: 'Report done when you leave.',
                body: 'No late-night typing. No write-ups at the kitchen table. When the inspection ends, the report is finished and the client’s home portal is live — delivered in one tap.',
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
              ['Eyes on the Screen: Constantly checking boxes.', 'Eyes on the House: your attention stays on the structure.'],
              ['Manual Data Entry: Tapping through 100+ sections.', 'Talk It Through: describe what you see and keep moving.'],
              ['Late-Night Reporting: 2 hours typing at home.', 'Instant Delivery: Report finished when you leave.'],
              ['Static Images: Photos with no context.', 'Anchored Evidence: Every photo carries timestamp, GPS, and lens data.'],
            ].flatMap(([old, neo], i) => ([
                <div key={`old-${i}`} style={{
                  padding: '24px 32px', borderRight: '1px solid #161616',
                  borderBottom: i < 3 ? '1px solid #161616' : 'none',
                  backgroundColor: '#080808',
                }}>
                  <p style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>{old}</p>
                </div>,
                <div key={`new-${i}`} style={{
                  padding: '24px 32px',
                  borderBottom: i < 3 ? '1px solid #161616' : 'none',
                  backgroundColor: '#00F3FF05',
                }}>
                  <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7 }}>{neo}</p>
                </div>,
            ]))}
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
          href="https://apps.apple.com/us/app/ledrix/id6762490661"
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
