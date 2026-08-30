// Footer — minimal: mark + wordmark, tagline, and a hairline-separated baseline. Tagline and links
// default to the parent-brand (two products); /inspect passes its own inspector line + section nav.
import { LedrixDelta } from '@/components/LedrixDelta';

type FooterLink = { href: string; label: string };

const DEFAULT_LINKS: FooterLink[] = [
  { href: '/home', label: 'Ledrix Home' },
  { href: '/inspect', label: 'Ledrix Inspect' },
  { href: '/about', label: 'About' },
  { href: '/ethix', label: 'Ethix' },
];

export function Footer({
  tagline = '— intelligence for every structure.',
  links = DEFAULT_LINKS,
}: { tagline?: string; links?: FooterLink[] } = {}) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/[0.08] bg-dark py-12 text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LedrixDelta size={18} sheen />
          <span className="text-sm font-bold text-white">Ledrix</span>
          <span className="text-sm text-slate-600">{tagline}</span>
        </div>

        <div className="flex items-center gap-6 text-xs">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center gap-2 px-6 text-xs text-slate-700 sm:flex-row sm:justify-between">
        <span>© {year} Ledrix Labs. All rights reserved.</span>
        <div className="flex items-center gap-5">
          <a href="/privacy" className="transition-colors hover:text-white">Privacy</a>
          <a href="/terms" className="transition-colors hover:text-white">Terms</a>
        </div>
      </div>
    </footer>
  );
}
