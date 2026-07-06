import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import MarketingOrb from '@/components/MarketingOrb';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { BentoGrid } from '@/components/marketing/BentoGrid';
import { LegacyVsLedrix } from '@/components/marketing/LegacyVsLedrix';
import { SampleDeliverables } from '@/components/marketing/SampleDeliverables';
import { VisionManifesto } from '@/components/marketing/VisionManifesto';
import { FAQ } from '@/components/marketing/FAQ';
import { ContactCTA } from '@/components/marketing/ContactCTA';

// The Ledrix Labs homepage — the premium landing (graduated from /testwebpage). The root layout supplies
// <html>/<body> + the indexable SEO metadata; this page owns the marketing chrome (Navbar/Footer/VAL orb).
export default function Home() {
  return (
    <div id="top" className="min-h-screen bg-ground font-sans text-body antialiased">
      <Navbar />
      <main>
        <VisionManifesto />
        <HowItWorks />
        <BentoGrid />
        <LegacyVsLedrix />
        <SampleDeliverables />
        <Hero />
        <FAQ />
        <ContactCTA />
      </main>
      <Footer />
      <MarketingOrb />
    </div>
  );
}
