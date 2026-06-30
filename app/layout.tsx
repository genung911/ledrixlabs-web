import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ledrix — The AI Backup for Licensed Inspectors',
  description: 'Ledrix drafts the finding the moment you capture the photo — you confirm, adjust, or reject. Catch the defect you walked past and deliver the report before you leave the driveway.',
  metadataBase: new URL('https://ledrixlabs.com'),
  openGraph: {
    title: 'Ledrix — The AI Backup for Licensed Inspectors',
    description: 'Inspect the house, not the template. Deliver before you leave. AI-assisted inspection with inspector-verified findings, instant PDF reports, and a client home portal.',
    url: 'https://ledrixlabs.com',
    siteName: 'Ledrix Labs',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
