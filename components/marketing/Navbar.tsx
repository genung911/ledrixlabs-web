'use client';

// Navbar — transparent over the light opener, frosts to translucent WHITE with a
// hairline on scroll. Cyan delta mark + dark wordmark, slate nav links that ink on
// hover, and the primary cyan CTA.
import { useEffect, useState } from 'react';
import { GlowButton } from './ui/GlowButton';
import { LedrixDelta } from '@/components/LedrixDelta';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#features', label: 'Why Ledrix' },
  { href: '/about', label: 'About' },
  { href: '/ethix', label: 'Ethix' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/#demo', label: 'Contact' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-hairline bg-white/75 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="group flex items-center gap-2.5">
          <LedrixDelta size={22} sheen className="transition-transform duration-300 group-hover:scale-110" />
          <span className="text-base font-bold tracking-tight text-ink">Ledrix</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-body transition-colors duration-200 hover:text-ink">
              {l.label}
            </a>
          ))}
        </div>

        <GlowButton href="/#demo" variant="primary" className="!px-5 !py-2.5 !text-xs">
          Request a demo
        </GlowButton>
      </nav>
    </header>
  );
}
