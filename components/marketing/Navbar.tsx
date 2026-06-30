'use client';

// Navbar — sticky, transparent over the hero, frosts + hairline on scroll. Glowing
// delta mark + wordmark, anchor links, and the primary CTA.
import { useEffect, useState } from 'react';
import { GlowButton } from './ui/GlowButton';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Why Ledrix' },
  { href: '#demo', label: 'Contact' },
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
        scrolled ? 'border-b border-white/[0.08] bg-ink/70 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="group flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" className="text-accent drop-shadow-[0_0_8px_#00F3FF] transition-transform duration-300 group-hover:scale-110">
            <path d="M12 3 21 20H3L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <span className="text-base font-bold tracking-tight text-white">Ledrix</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-slate-400 transition-colors duration-200 hover:text-white">
              {l.label}
            </a>
          ))}
        </div>

        <GlowButton href="#demo" variant="primary" className="!px-5 !py-2.5 !text-xs">
          Request a demo
        </GlowButton>
      </nav>
    </header>
  );
}
