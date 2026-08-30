import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import MarketingOrb from '@/components/MarketingOrb';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { BentoGrid } from '@/components/marketing/BentoGrid';
import { LegacyVsLedrix } from '@/components/marketing/LegacyVsLedrix';
import { SampleDeliverables } from '@/components/marketing/SampleDeliverables';
import { ForHomeowners } from '@/components/marketing/ForHomeowners';
import { VisionManifesto } from '@/components/marketing/VisionManifesto';
import { FAQ } from '@/components/marketing/FAQ';
import { ContactCTA } from '@/components/marketing/ContactCTA';

// The Ledrix Inspect product page — the premium landing for licensed home inspectors (formerly the
// root homepage; moved here when ledrixlabs.com became the two-product parent). Its section anchors
// are page-relative ids (how/features/homeowners/faq/demo), so the nav rebases them to /inspect#….
const INSPECT_LINKS = [
  { href: '/inspect#how', label: 'How it works' },
  { href: '/inspect#features', label: 'Why Ledrix' },
  { href: '/inspect#homeowners', label: 'For Homeowners' },
  { href: '/about', label: 'About' },
  { href: '/ethix', label: 'Ethix' },
  { href: '/inspect#faq', label: 'FAQ' },
  { href: '/inspect#demo', label: 'Contact' },
];

export const metadata = {
  title: 'Ledrix Inspect — AI for licensed home inspectors',
  description:
    'Ledrix Intelligence drafts the finding the moment you capture the photo. You confirm, adjust, or reject. Field-reliable, iOS, always inspector-verified.',
};

export default function InspectPage() {
  return (
    <div id="top" className="min-h-screen bg-ground font-sans text-body antialiased">
      <Navbar links={INSPECT_LINKS} ctaHref="/inspect#demo" />
      <main>
        <VisionManifesto />
        <HowItWorks />
        <BentoGrid />
        <LegacyVsLedrix />
        <SampleDeliverables />
        <ForHomeowners />
        <Hero />
        <FAQ />
        <ContactCTA />
      </main>
      <Footer
        tagline="— the AI backup for home inspectors."
        links={[
          { href: '/inspect#how', label: 'How it works' },
          { href: '/inspect#features', label: 'Why Ledrix' },
          { href: '/about', label: 'About' },
          { href: '/ethix', label: 'Ethix' },
          { href: '/inspect#faq', label: 'FAQ' },
          { href: '/inspect#demo', label: 'Request a demo' },
        ]}
      />
      <MarketingOrb />
    </div>
  );
}
