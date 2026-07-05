import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ledrix — The AI Backup for Home Inspectors',
  description: 'Ledrix is AI home inspection software — the AI backup for home inspectors. Draft a structured finding the instant you capture a photo (you confirm, adjust, or reject), catch the defect a long day overlooks, and deliver a legal PDF report and a client home portal before you leave the driveway.',
  keywords: ['home inspection software', 'AI home inspection software', 'home inspection app', 'home inspector software', 'AI home inspection assistant', 'inspection report software', 'home inspection report app', 'AI for home inspectors'],
  metadataBase: new URL('https://ledrixlabs.com'),
  openGraph: {
    title: 'Ledrix — The AI Backup for Home Inspectors',
    description: 'AI home inspection software with inspector-verified findings, instant PDF reports, and a client home portal. Inspect the home, not the template — deliver before you leave the driveway.',
    url: 'https://ledrixlabs.com',
    siteName: 'Ledrix Labs',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ground font-sans text-body antialiased">{children}</body>
    </html>
  );
}
