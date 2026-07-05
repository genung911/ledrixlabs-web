'use client';

// MarketingOrb — the floating VAL orb on the marketing homepage. The opener is a DARK
// stage and the rest of the page is LIGHT, so the orb flips its premium shell on scroll
// exactly the way the Navbar flips its chrome: dark-glass while over the hero (unscrolled),
// frosted-white once you scroll into the light sections.
import { useEffect, useState } from 'react';
import ValOrbVoice from './ValOrbVoice';

export default function MarketingOrb() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <ValOrbVoice size={60} tone={scrolled ? 'light' : 'dark'} />
    </div>
  );
}
