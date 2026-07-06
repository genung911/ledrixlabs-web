'use client';

// Navbar — transparent over the full-bleed IMAGE opener (white logo + links + a
// translucent-white pill CTA), then frosts to translucent WHITE with a hairline on
// scroll (ink wordmark + slate links + a near-black pill CTA). Monochrome throughout;
// the only surviving color is the delta mark.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

// `overLight` — the opener is now a LIGHT stage (the isometric dollhouse), so the
// unscrolled nav must render in ink to stay legible. Dark-hero pages (about, ethix)
// omit the prop and keep the white-over-dark treatment.
export function Navbar({ overLight = false }: { overLight?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // An open mobile menu always closes on scroll (avoids a stale panel hanging over content
  // as the page moves underneath it) and never survives a resize past the mobile breakpoint.
  useEffect(() => {
    if (!mobileOpen) return;
    const close = () => setMobileOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [mobileOpen]);

  // Ink chrome whenever the backdrop is light (scrolled frost, the light opener, or the
  // mobile menu is open — the panel is always a light surface, so the header above it
  // must switch to ink chrome too, regardless of scroll position).
  const inkChrome = scrolled || overLight || mobileOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || mobileOpen ? 'border-b border-hairline bg-white/75 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="group flex items-center gap-2.5">
          <LedrixDelta size={22} sheen className="transition-transform duration-300 group-hover:scale-110" />
          <span className={`text-base font-bold tracking-tight transition-colors duration-300 ${inkChrome ? 'text-ink' : 'text-white'}`}>
            Ledrix
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors duration-200 ${
                inkChrome ? 'text-body hover:text-ink' : 'text-white/80 hover:text-white'
              }`}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <GlowButton href="/#demo" variant="primary" tone={inkChrome ? 'light' : 'dark'} className="!px-5 !py-2.5 !text-xs">
            Request a demo
          </GlowButton>

          {/* Mobile menu toggle — the LINKS above are md:flex-only, so this is the only way
              to reach How it works / Why Ledrix / About / Ethix / FAQ / Contact on a phone. */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 md:hidden ${
              inkChrome ? 'text-ink hover:bg-ink/5' : 'text-white hover:bg-white/10'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-t border-hairline bg-white/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col px-6 py-4">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="border-b border-hairline py-3.5 text-base font-medium text-body last:border-b-0 hover:text-ink"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
