import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ledrix Labs — Infrastructure Intelligence',
  description: 'AI-powered home inspection platform for licensed inspectors. Real-time anomaly detection, voice commands, automated floor plans, and client report delivery.',
  metadataBase: new URL('https://ledrixlabs.com'),
  openGraph: {
    title: 'Ledrix Labs — Infrastructure Intelligence',
    description: 'AI-powered home inspection platform. Before disaster strikes.',
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
