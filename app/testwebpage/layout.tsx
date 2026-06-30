import type { Metadata } from 'next';
import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';

// Standalone shell for the premium landing preview. Kept out of search until it
// graduates to the real homepage.
export const metadata: Metadata = {
  title: 'Ledrix — The AI backup for licensed inspectors',
  robots: { index: false, follow: false },
};

export default function TestWebpageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="top" className="min-h-screen bg-ink font-sans text-white antialiased">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
