import Link from 'next/link';
import Image from 'next/image';

export default function TermsOfService() {
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
        <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1.5, marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: '#333', fontSize: 12, fontFamily: 'Roboto Mono, monospace', marginBottom: 56 }}>
          Effective Date: January 1, 2026 · Ledrix Labs
        </p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: `By downloading or using the Ledrix application, you agree to be bound by these Terms of Service. If you do not agree, do not use the app. Ledrix is intended for use by licensed professional inspectors only.`,
          },
          {
            title: '2. Professional Responsibility',
            body: `Ledrix is a tool to assist licensed professionals. You are solely responsible for the accuracy, completeness, and legality of all inspection reports you generate using the platform. AI-assisted findings are informational aids only and do not constitute professional determinations. You must independently verify all findings before delivering reports to clients.`,
          },
          {
            title: '3. AI Disclaimer',
            body: `AI-assisted analysis within Ledrix is provided for informational purposes only. Ledrix Labs does not guarantee the accuracy, completeness, or reliability of any AI-generated content. Ledrix Labs and its affiliates are not liable for any damages, losses, or claims arising from reliance on AI-generated findings. All inspection determinations remain the professional responsibility of the licensed inspector.`,
          },
          {
            title: '4. License',
            body: `Ledrix Labs grants you a limited, non-exclusive, non-transferable license to use the Ledrix application for your professional inspection work. You may not copy, modify, distribute, sell, or reverse-engineer any part of the platform.`,
          },
          {
            title: '5. Account',
            body: `You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate information when creating your account and keep it up to date.`,
          },
          {
            title: '6. Client Data',
            body: `When you deliver inspection data to clients through the Ledrix Home App portal, you represent that you have the right to share that information and that it was collected lawfully during a professional inspection engagement. You remain responsible for obtaining any necessary client consents.`,
          },
          {
            title: '7. Prohibited Use',
            body: `You agree not to use Ledrix for any unlawful purpose, to submit false inspection reports, to attempt to gain unauthorized access to any part of the platform, or to use the platform in any way that could damage, disable, or impair the service.`,
          },
          {
            title: '8. Limitation of Liability',
            body: `To the maximum extent permitted by law, Ledrix Labs shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform, including but not limited to damages arising from missed defects, incorrect AI analysis, or report errors. Our total liability to you shall not exceed the amount you paid for the service in the twelve months preceding the claim.`,
          },
          {
            title: '9. Termination',
            body: `We reserve the right to suspend or terminate your account at any time for violation of these terms. You may delete your account at any time from within the app.`,
          },
          {
            title: '10. Changes to Terms',
            body: `We may update these Terms of Service from time to time. We will notify you of material changes through the app or via email. Continued use after changes constitutes acceptance.`,
          },
          {
            title: '11. Governing Law',
            body: `These terms are governed by the laws of the United States. Any disputes shall be resolved in the courts of competent jurisdiction.`,
          },
          {
            title: '12. Contact',
            body: `For questions about these terms, contact us at ledrixlabs@gmail.com.`,
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
          © 2026 Ledrix Labs · <Link href="/privacy" style={{ color: '#333', textDecoration: 'none' }}>Privacy Policy</Link>
        </span>
      </footer>
    </div>
  );
}
