'use client';

// Navbar — transparent over the full-bleed IMAGE opener (white logo + links + a
// translucent-white pill CTA), then frosts to translucent WHITE with a hairline on
// scroll (ink wordmark + slate links + a near-black pill CTA). Monochrome throughout;
// the only surviving color is the delta mark.
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
          <span className={`text-base font-bold tracking-tight transition-colors duration-300 ${scrolled ? 'text-ink' : 'text-white'}`}>
            Ledrix
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors duration-200 ${
                scrolled ? 'text-body hover:text-ink' : 'text-white/80 hover:text-white'
              }`}
            >
              {l.label}
            </a>
          ))}
        </div>

        <GlowButton href="/#demo" variant="primary" tone={scrolled ? 'light' : 'dark'} className="!px-5 !py-2.5 !text-xs">
          Request a demo
        </GlowButton>
      </nav>
    </header>
  );
}
