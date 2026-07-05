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
        <div style={{ color: '#217BE8', fontSize: 10, fontWeight: 700, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 16 }}>
          LEGAL
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1.5, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: '#333', fontSize: 12, fontFamily: 'Roboto Mono, monospace', marginBottom: 56 }}>
          Effective Date: January 1, 2026 · Last Updated: May 27, 2026 · Ledrix Labs
        </p>

        {[
          {
            title: '1. Information We Collect',
            body: `We collect information you provide directly, including your name, email address, and professional license number when you create an account. During inspections, Ledrix collects photos and videos of the property being inspected, GPS location data anchored to property records, audio recordings made during explicitly activated voice command sessions, and inspection notes and findings you create. We also collect standard usage data such as app version, device type, and crash reports to improve the platform.`,
          },
          {
            title: '2. How We Use Your Information',
            body: `Your information is used to provide and improve the Ledrix platform, generate inspection reports on your behalf, sync your data across your devices, and deliver inspection results to your clients through the Ledrix Home App portal. We do not sell your personal or identifying data, and we do not use your data for advertising purposes. The one exception is Ethix, our optional, opt-in program (see the Ethix section below), under which a homeowner may choose to share only anonymized, aggregate, non-personal signals about their home and keep the proceeds — Ledrix does not profit from it. Personal or identifying data is never sold, with or without Ethix.`,
          },
          {
            title: '3. Voice and Audio Recording',
            body: `Ledrix records audio only during explicitly activated push-to-talk voice command sessions initiated by the inspector. Recording does not occur in the background, automatically, or without a deliberate action from the user. Audio is processed in real time for transcription and immediately discarded — raw audio files are not stored on our servers. Transcribed text derived from voice commands is stored as part of your inspection record. By using the VAL voice feature, you acknowledge and consent to this recording and transcription process. It is your responsibility to ensure that any occupants of a property being inspected are appropriately notified of audio capture as required by applicable law in your jurisdiction.`,
          },
          {
            title: '4. Location Data',
            body: `Ledrix uses precise GPS location to anchor inspection evidence to property records and to verify inspection site attendance. Location data is collected only during active inspection sessions when you have granted the app location permission. We do not track your location in the background, outside of active inspection use, or for any purpose unrelated to the inspection in progress. Location coordinates are stored as part of your inspection record and may be included in delivered reports.`,
          },
          {
            title: '5. AI Processing',
            body: `Ledrix uses artificial intelligence to assist with anomaly detection, structural analysis, voice transcription, and report generation. AI-assisted findings are for informational purposes only and do not replace the professional judgment of a licensed inspector. All AI analysis is performed to assist you — you remain solely responsible for the accuracy of your inspection reports.\n\nAI processing is performed via our secure backend gateway and select third-party API providers as described in Section 9, which is the default and primary path for all production use. The app's architecture also supports an optional local-network inference fallback for development and testing purposes; this is not a customer-facing production feature, and cloud processing remains the standard path for every inspector using Ledrix today.`,
          },
          {
            title: '6. Inspector Feedback & Model Improvement',
            body: `Effective May 27, 2026, the Ledrix app captures structured feedback whenever you act on an AI-suggested finding — confirm, edit, reject, restore, or hard-delete. Each action is written to a local JSON-lines file in your device's app sandbox (Documents/ledrix_feedback_corpus.jsonl). Each row contains: the AI's original output (severity, description, confidence) at the moment of capture; your verdict and any edits you made to the AI's text; a downsampled copy of the evidence photo (1024px wide, JPEG @ 65 quality); a timestamp, anomaly identifier, and inspection identifier; and the prompt version that produced the AI output.\n\nThis data stays on your device by default. You can review the corpus row count in the app at any time (Anomaly Log → Export Feedback). The corpus is only transmitted off-device when you explicitly tap the share/export control, which lets you AirDrop, save, or send the file off-device.\n\nUse of exported feedback for model training. If you choose to send the corpus to Ledrix Labs (via support email, AirDrop to a Ledrix Labs device, or a future opt-in upload feature), we may use it to fine-tune AI models used in future versions of the app. We do not sell, license, or share this data with third parties for any purpose other than improving the Ledrix AI inference pipeline.\n\nOpt-out. You can clear the entire corpus at any time by tapping Anomaly Log → Export Feedback → Clear (long-press), or by uninstalling the app. The corpus is also wiped when you delete your account.\n\nWhat is NOT captured. The corpus does not include voice recordings (raw audio is discarded per Section 3), client contact information, inspection report PDFs, or any photo not associated with an AI-reviewed finding.`,
          },
          {
            title: '7. Homeowner and Client Portal Data',
            body: `When you deliver an inspection to a client through the Ledrix Home App portal, that client receives access to a read-only view of their property's inspection findings, health score, maintenance schedule, and uploaded evidence. Client portal data is tied to the property record you created and is accessible only to the client you designate. Clients do not have access to your inspector account, other inspections, or any data beyond their specific property. We retain homeowner portal data for as long as the associated inspector account is active. If your account is deleted, associated homeowner portal records are removed within 90 days.`,
          },
          {
            title: '8. Data Storage, Retention, and Security',
            body: `Your data is stored securely using Supabase infrastructure with row-level security policies that ensure each user can only access their own data. Inspection photos and evidence are stored locally on your device first, then synced to your account when connectivity is available. We use industry-standard TLS encryption in transit and AES-256 encryption at rest. We retain your personal account data and inspection records for as long as your account remains active. If you delete your account, your personal data and inspection records are permanently removed from our servers within 30 days. Backups are purged on a 90-day rolling cycle.`,
          },
          {
            title: '9. Third-Party Services',
            body: `Ledrix uses the following third-party service providers to deliver platform functionality:\n\n• Supabase — authentication, database, and file storage\n• OpenAI — AI vision analysis for real-time anomaly detection and image-based features\n• Groq — AI voice transcription (Whisper) and text-based AI assistance\n• Google — address lookup and contractor location services\n\nInspection data shared with these providers is limited strictly to what is necessary for the specific feature to function. We do not share your personal account information or full inspection records with AI providers — only the content necessary for each individual API call (e.g., an image frame for vision analysis or an audio clip for transcription). All third-party providers operate under their own privacy policies and data processing agreements.`,
          },
          {
            title: '10. Your Privacy Rights',
            body: `You have the right to access, correct, or delete your personal data at any time. You may submit a deletion request from within the app under Settings → Account → Delete Account, which will initiate permanent removal of your account and associated data. For manual requests, contact us at kelly@ledrixlabs.com.\n\nCalifornia residents have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to request deletion, and the right to opt out of the sale of personal information. We do not sell personal information. Our optional Ethix program (see the Ethix section) shares only de-identified, aggregate data that a homeowner explicitly opts into and may revoke at any time; it does not involve the sale of personal information as defined by the CCPA. You can decline simply by not opting in. To exercise your CCPA rights, contact us at the address below.\n\nResidents of other jurisdictions may have similar rights under applicable local law. We will honor all such requests to the extent required by law.`,
          },
          {
            title: '11. Data Breach Notification',
            body: `In the event of a data breach that affects your personal information, we will notify affected users via email within 72 hours of becoming aware of the breach, to the extent required by applicable law. Notification will describe the nature of the breach, the data affected, steps we are taking to address it, and recommended actions for affected users.`,
          },
          {
            title: '12. Children\'s Privacy',
            body: `Ledrix is a professional platform intended for licensed inspectors and is not directed at children under 13. We do not knowingly collect personal information from children. If we become aware that a child under 13 has provided us personal information, we will delete it immediately.`,
          },
          {
            title: '13. Ethix — Optional, Opt-In Data Sharing',
            body: `Ethix is an optional, opt-in program that lets a homeowner share anonymized, aggregate, non-personal signals about their home — and, in the future, earn a share of any value that data generates. Participation is OFF by default. Nothing is ever shared unless the homeowner explicitly opts in from their Home App, and they may revoke at any time.\n\nWhat may be shared (only if opted in, and only for the categories the homeowner selects): coarse, de-identified signals such as property attributes (year built, size), the types of systems and materials present, counts of findings by system and their priority band (major repair / minor repair / maintenance / typical wear / good), with safety concerns flagged separately, maintenance cadence, and a coarsened regional area.\n\nWhat is NEVER shared under Ethix: your name, street address, full ZIP, GPS coordinates, photos, inspector or contractor names, serial numbers, costs, free-text notes, or anything that could identify you or your property.\n\nLedrix does not profit from Ethix. Ledrix is compensated through inspector subscriptions; any Ethix proceeds flow to participating homeowners, less at most a thin, fully-disclosed cost-recovery fee. As of the effective date of this section, no data is being sold under Ethix — the program is in development, opt-in preferences are being collected, and homeowners will be asked to reconfirm consent before any sale ever occurs.`,
          },
          {
            title: '14. Changes to This Policy',
            body: `We may update this Privacy Policy from time to time. We will notify you of material changes through the app or via email at least 14 days before the changes take effect. Continued use of Ledrix after the effective date constitutes your acceptance of the updated policy.`,
          },
          {
            title: '15. Contact',
            body: `For privacy-related questions, data requests, or concerns, contact us at kelly@ledrixlabs.com.`,
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
          © 2026 Ledrix Labs · <Link href="/terms" style={{ color: '#333', textDecoration: 'none' }}>Terms of Service</Link>
        </span>
      </footer>
    </div>
  );
}
