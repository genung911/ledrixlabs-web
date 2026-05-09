import Link from 'next/link';
import Image from 'next/image';

export default function PrivacyPolicy() {
  return (
    <div style={{ backgroundColor: '#080808', minHeight: '100vh', color: '#fff' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 40px', borderBottom: '1px solid #111',
      }}>
        <Link href="/">
          <Image src="/logo.png" alt="Ledrix" width={80} height={40} style={{ objectFit: 'contain' }} />
        </Link>
        <Link href="/" style={{ color: '#555', fontSize: 12, fontWeight: 700, letterSpacing: 2, textDecoration: 'none' }}>← BACK</Link>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ color: '#00F3FF', fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
          LEGAL
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1.5, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: '#333', fontSize: 12, fontFamily: 'Roboto Mono, monospace', marginBottom: 56 }}>
          Effective Date: January 1, 2026 · Ledrix Labs
        </p>

        {[
          {
            title: '1. Information We Collect',
            body: `We collect information you provide directly, including your name, email address, and professional license number when you create an account. During inspections, Ledrix collects photos and videos, GPS location data, audio recordings via voice commands, device sensor data (accelerometer, gyroscope, barometer) for floor plan generation, and inspection notes and findings you create. We also collect standard usage data such as app version, device type, and crash reports to improve the platform.`,
          },
          {
            title: '2. How We Use Your Information',
            body: `Your information is used to provide and improve the Ledrix platform, generate inspection reports on your behalf, sync your data across your devices, and deliver inspection results to your clients through the Home App portal. We do not sell your personal data to third parties. We do not use your data for advertising purposes.`,
          },
          {
            title: '3. AI Processing',
            body: `Ledrix uses artificial intelligence to assist with anomaly detection and inspection analysis. AI-assisted findings are for informational purposes only and do not replace the professional judgment of a licensed inspector. All AI analysis is performed to assist you — you remain solely responsible for the accuracy of your inspection reports.`,
          },
          {
            title: '4. Data Storage and Security',
            body: `Your data is stored securely using Supabase infrastructure with row-level security. Inspection photos and evidence are stored locally on your device first, then optionally synced to your account. We use industry-standard encryption in transit and at rest. We retain your data for as long as your account is active.`,
          },
          {
            title: '5. Location Data',
            body: `Ledrix uses precise GPS location to anchor inspection evidence to property records. Location data is collected only during active inspection sessions when you have granted permission. We do not track your location in the background outside of active inspection use.`,
          },
          {
            title: '6. Camera and Microphone',
            body: `Camera access is used for capturing structural evidence during inspections. Microphone access is used exclusively for VAL voice-activated commands and push-to-talk inspection logging. We do not record audio outside of explicitly activated voice sessions.`,
          },
          {
            title: '7. Third-Party Services',
            body: `Ledrix uses Supabase for authentication and data storage, and OpenAI's API for select AI features including receipt scanning. These services have their own privacy policies. We do not share your personal inspection data with these providers beyond what is necessary for the feature to function.`,
          },
          {
            title: '8. Your Rights',
            body: `You may request access to, correction of, or deletion of your personal data at any time by contacting us at ledrixlabs@gmail.com. You may also delete your account from within the app, which will remove your personal data from our servers.`,
          },
          {
            title: '9. Children\'s Privacy',
            body: `Ledrix is a professional platform intended for licensed inspectors and is not directed at children under 13. We do not knowingly collect personal information from children.`,
          },
          {
            title: '10. Changes to This Policy',
            body: `We may update this Privacy Policy from time to time. We will notify you of material changes through the app or via email. Continued use of Ledrix after changes constitutes your acceptance of the updated policy.`,
          },
          {
            title: '11. Contact',
            body: `For privacy-related questions, contact us at ledrixlabs@gmail.com.`,
          },
        ].map(s => (
          <div key={s.title} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: '#fff' }}>{s.title}</h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.8 }}>{s.body}</p>
          </div>
        ))}
      </main>

      <footer style={{ borderTop: '1px solid #0d0d0d', padding: '24px 40px', textAlign: 'center' }}>
        <span style={{ color: '#222', fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}>
          © 2026 Ledrix Labs · <Link href="/terms" style={{ color: '#333', textDecoration: 'none' }}>Terms of Service</Link>
        </span>
      </footer>
    </div>
  );
}
