import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import ValOrbVoice from '@/components/ValOrbVoice';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { BentoGrid } from '@/components/marketing/BentoGrid';
import { VisionManifesto } from '@/components/marketing/VisionManifesto';
import { ContactCTA } from '@/components/marketing/ContactCTA';

// The Ledrix Labs homepage — the premium landing (graduated from /testwebpage). The root layout supplies
// <html>/<body> + the indexable SEO metadata; this page owns the marketing chrome (Navbar/Footer/VAL orb).
export default function Home() {
  return (
    <div id="top" className="min-h-screen bg-ink font-sans text-white antialiased">
      <Navbar />
      <main>
        <VisionManifesto />
        <HowItWorks />
        <BentoGrid />
        <Hero />
        <ContactCTA />
      </main>
      <Footer />
      <div className="fixed bottom-6 right-6 z-50">
        <ValOrbVoice size={60} />
      </div>
    </div>
  );
}
