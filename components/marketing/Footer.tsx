// Footer — minimal: mark + wordmark, tagline, and a hairline-separated baseline.
import { LedrixDelta } from '@/components/LedrixDelta';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/[0.08] bg-dark py-12 text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LedrixDelta size={18} sheen />
          <span className="text-sm font-bold text-white">Ledrix</span>
          <span className="text-sm text-slate-600">— the AI backup for home inspectors.</span>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <a href="/#how" className="transition-colors hover:text-white">How it works</a>
          <a href="/#features" className="transition-colors hover:text-white">Why Ledrix</a>
          <a href="/about" className="transition-colors hover:text-white">About</a>
          <a href="/ethix" className="transition-colors hover:text-white">Ethix</a>
          <a href="/#faq" className="transition-colors hover:text-white">FAQ</a>
          <a href="/#demo" className="transition-colors hover:text-white">Request a demo</a>
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
