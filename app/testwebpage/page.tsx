import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { BentoGrid } from '@/components/marketing/BentoGrid';
import { ContactCTA } from '@/components/marketing/ContactCTA';

// /testwebpage — premium landing preview. Swap into app/page.tsx when approved.
export default function TestWebpage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <BentoGrid />
      <ContactCTA />
    </>
  );
}
