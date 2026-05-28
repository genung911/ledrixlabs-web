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
          Effective Date: January 1, 2026 · Last Updated: May 27, 2026 · Ledrix Labs
        </p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: `By downloading or using the Ledrix application, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, do not download or use the app. Ledrix is intended for use by licensed professional inspectors only. Use of the platform for non-professional, fraudulent, or unlicensed inspection activity is prohibited.`,
          },
          {
            title: '2. Professional Responsibility',
            body: `Ledrix is a tool to assist licensed professionals. You are solely responsible for the accuracy, completeness, legality, and professional adequacy of all inspection reports you generate using the platform. AI-assisted findings, anomaly detections, repair cost estimates, and voice-logged observations are informational aids only — they do not constitute professional determinations and do not satisfy your obligation to independently observe, verify, and report on the property condition. You must independently verify all AI-generated findings before delivering reports to clients.`,
          },
          {
            title: '3. AI and Automated Analysis Disclaimer',
            body: `AI-assisted analysis within Ledrix — including real-time anomaly detection, voice transcription, report generation, and repair cost estimation — is provided for informational and efficiency purposes only. Ledrix Labs does not guarantee the accuracy, completeness, or fitness for any particular purpose of any AI-generated content. Ledrix Labs and its affiliates are not liable for any damages, losses, missed defects, incorrect findings, or claims arising from reliance on AI-generated content. All inspection determinations remain the professional responsibility of the licensed inspector using the platform.`,
          },
          {
            title: '4. AI Output Verification & Inspector Responsibility',
            body: `4.1 Advisory nature. All AI-generated content within the Ledrix app — including but not limited to defect descriptions, severity ratings, system identification, location tagging, repair cost estimates, and recommended contractors — is provided as a starting point for the licensed inspector's review. AI output is not, and is not represented as, a finished professional inspection finding.\n\n4.2 Inspector verification required. Before delivering any AI-assisted finding to a client, the inspector must (a) verify the visible evidence supports the AI's interpretation, (b) correct any inaccuracies in severity, description, location, or system attribution, and (c) confirm or reject each finding using the in-app controls (Confirm / Adjust / Reject). The HITL (human-in-the-loop) review controls are a required part of the workflow, not optional.\n\n4.3 Known failure modes. The inspector acknowledges that the Ledrix AI pipeline, including third-party vision models (OpenAI GPT-4o and similar), is known to occasionally (a) misread numeric values on gauges, dials, or nameplates; (b) misidentify materials in low-light, partially-obscured, or visually-similar conditions; (c) propose findings for conditions that are within normal tolerance for the property's age and region; and (d) omit findings for defects outside the focal area of the captured photo. The inspector agrees that catching and correcting these failures is a core part of the professional service Ledrix's customers pay them for, and is the inspector's responsibility — not Ledrix's.\n\n4.4 Indemnification for unverified output. The inspector agrees to defend, indemnify, and hold harmless Ledrix Labs and its affiliates from any claim, dispute, or proceeding arising from a finding delivered to a client where the inspector failed to verify the AI's output per Section 4.2, including but not limited to claims for misrepresentation, professional negligence, or breach of contract by the receiving party. This indemnification is subject to the liability cap set forth in Section 12 (Limitation of Liability).`,
          },
          {
            title: '5. Voice Recording and Audio Consent',
            body: `By using the VAL voice command feature, you consent to the recording and transcription of audio captured during explicitly activated push-to-talk sessions. You acknowledge that:\n\n(a) Audio recording occurs only when you actively initiate a voice session within the app.\n(b) You are responsible for compliance with all applicable wiretapping, eavesdropping, and consent laws in your jurisdiction, including obtaining appropriate consent from any occupants present during an inspection.\n(c) Ledrix processes voice audio solely for transcription and immediately discards raw audio — it is not stored on our servers.\n\nLedrix Labs is not liable for any legal claims arising from your failure to obtain required consent from third parties prior to recording.`,
          },
          {
            title: '6. Location Data',
            body: `By using Ledrix, you grant the app permission to collect precise GPS location data during active inspection sessions. This data is used to anchor evidence to property records and to verify inspection site attendance. You represent that you have authorization to conduct an inspection at any location where you use the Ledrix platform. You are responsible for ensuring your use of GPS-anchored evidence complies with applicable law and your professional obligations.`,
          },
          {
            title: '7. Inspection Reports and PDF Deliverables',
            body: `Inspection reports and PDF deliverables generated by Ledrix are created based on data you input, photos you capture, and AI analysis of that content. You represent that all data you enter is accurate, lawfully obtained, and relates to an authorized professional inspection engagement. Ledrix Labs does not independently verify the content of any inspection report. You are solely responsible for the accuracy, completeness, and professional adequacy of any report you deliver to a client. You agree not to use Ledrix-generated reports as the sole basis for any insurance claim determination, legal proceeding, or real estate transaction without independent professional verification.`,
          },
          {
            title: '8. Client Data and the Homeowner Portal',
            body: `When you deliver inspection data to clients through the Ledrix Home App portal, you represent that: (a) you conducted the inspection under a lawful professional engagement with the property owner or their authorized agent, (b) you have the right to share the information contained in the delivery, and (c) all data was collected lawfully. You remain responsible for obtaining any necessary client consents for data sharing and for the accuracy of all content delivered.`,
          },
          {
            title: '9. License',
            body: `Ledrix Labs grants you a limited, non-exclusive, non-transferable, revocable license to use the Ledrix application for your professional inspection work. You may not copy, modify, distribute, sell, sublicense, reverse-engineer, or create derivative works from any part of the platform. All intellectual property in the platform, including but not limited to the cloud anomaly-detection pipeline, inspector-verified findings workflow, and evidence chain technology, remains the exclusive property of Ledrix Labs.`,
          },
          {
            title: '10. Account',
            body: `You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate information when creating your account and keep it up to date. You may not share your account with other individuals. If you suspect unauthorized access to your account, notify us immediately at ledrixlabs@gmail.com.`,
          },
          {
            title: '11. Prohibited Use',
            body: `You agree not to use Ledrix to: conduct inspections without a valid professional license in the applicable jurisdiction; submit false, fabricated, or materially misleading inspection findings; use the platform for any unlawful purpose; attempt to gain unauthorized access to any part of the platform or its underlying systems; use the platform in any way that could damage, disable, overburden, or impair the service; or reverse-engineer, scrape, or extract data from the platform for competitive or unauthorized purposes.`,
          },
          {
            title: '12. Limitation of Liability',
            body: `To the maximum extent permitted by applicable law, Ledrix Labs, its officers, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the platform, including but not limited to damages arising from missed defects, incorrect AI analysis, GPS inaccuracies, report errors, data loss, or reliance on platform-generated content. Our total cumulative liability to you for any claim arising out of or relating to these terms or your use of Ledrix shall not exceed the greater of (a) the total fees you paid to Ledrix Labs in the twelve months preceding the claim or (b) one hundred U.S. dollars ($100).`,
          },
          {
            title: '13. Data Breach Notification',
            body: `In the event of a confirmed security breach that compromises your personal data, Ledrix Labs will notify affected users via email within 72 hours of becoming aware of the breach, to the extent required by applicable law. We will provide information about the nature of the breach, data affected, remediation steps taken, and recommended actions. This commitment does not expand our liability beyond the limits set forth in Section 12.`,
          },
          {
            title: '14. Termination',
            body: `We reserve the right to suspend or terminate your account at any time for material violation of these terms, fraudulent use, or conduct that harms the platform or other users. We will provide notice of termination where reasonably practicable. You may delete your account at any time from within the app under Settings → Account → Delete Account. Upon termination, your license to use the platform immediately ceases.`,
          },
          {
            title: '15. Changes to Terms',
            body: `We may update these Terms of Service from time to time. We will notify you of material changes through the app or via email at least 14 days before the changes take effect. Continued use of Ledrix after the effective date constitutes your acceptance of the updated terms. If you do not agree to the updated terms, you must discontinue use and may delete your account.`,
          },
          {
            title: '16. Governing Law and Disputes',
            body: `These terms are governed by the laws of the State of Idaho, United States, without regard to conflict of law principles. Any dispute arising out of or relating to these terms or your use of Ledrix shall be resolved through binding arbitration under the rules of the American Arbitration Association, conducted in Ada County, Idaho. You waive any right to participate in a class action lawsuit or class-wide arbitration against Ledrix Labs. Nothing in this section prevents either party from seeking injunctive relief in a court of competent jurisdiction to prevent irreparable harm.`,
          },
          {
            title: '17. Contact',
            body: `For questions about these terms, contact us at ledrixlabs@gmail.com.`,
          },
        ].map(s => (
          <div key={s.title} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: '#fff' }}>{s.title}</h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{s.body}</p>
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
