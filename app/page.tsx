import Image from 'next/image';
import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import MarketingOrb from '@/components/MarketingOrb';
import { GlowButton } from '@/components/marketing/ui/GlowButton';
import { PhoneBezel } from '@/components/marketing/PhoneBezel';
import { LedrixDelta } from '@/components/LedrixDelta';

// The Ledrix Labs parent landing — ledrixlabs.com's front door. Its whole job is to say what
// Ledrix is (the intelligence layer for structures) and route to the two products: Inspect (the
// pro tool, now at /inspect) and Home (the homeowner record, at /home). One brain, two products.
// Section-anchored deep links live on the product pages, so the parent nav is product-level.
const PARENT_LINKS = [
  { href: '/home', label: 'Ledrix Home' },
  { href: '/inspect', label: 'Ledrix Inspect' },
  { href: '/about', label: 'About' },
  { href: '/ethix', label: 'Ethix' },
];

export const metadata = {
  title: 'Ledrix Labs — intelligence for every structure',
  description:
    'Ledrix builds the AI that understands buildings — for the professionals who inspect them, and the people who live in them. Two products, one brain.',
};

// A product screenshot in the site's phone bezel. Frame aspect matches the raw device capture
// (1320×2868) so the shot sits edge-to-edge with no crop.
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <PhoneBezel className="aspect-[1320/2868] w-full max-w-[264px]">
      <Image src={src} alt={alt} fill sizes="264px" className="object-cover" />
    </PhoneBezel>
  );
}

export default function LedrixLabsHome() {
  return (
    <div id="top" className="min-h-screen bg-ground font-sans text-body antialiased">
      <Navbar links={PARENT_LINKS} ctaHref="/inspect#demo" />

      <main>
        {/* ── HERO — the company thesis ── */}
        <section className="relative isolate flex min-h-[88svh] items-center overflow-hidden bg-dark text-white">
          {/* faint grid + radial vignette, no photography needed */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
              backgroundSize: '52px 52px',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1/3 left-1/2 h-[70vh] w-[70vh] -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(33,123,232,0.16), transparent 62%)' }}
          />
          <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 text-center">
            <span className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.05] px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-white/70 backdrop-blur">
              <LedrixDelta size={14} sheen />
              Ledrix Labs
            </span>
            <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight [text-wrap:balance] sm:text-6xl md:text-7xl">
              Intelligence for every structure.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300 [text-wrap:balance] md:text-xl">
              Ledrix builds the AI that understands buildings — for the professionals who inspect
              them, and the people who live in them. Two products. One brain.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <GlowButton href="/inspect" variant="primary" tone="dark" className="!px-6 !py-3">
                Ledrix Inspect
              </GlowButton>
              <GlowButton href="/home" variant="ghost" tone="dark" className="!px-6 !py-3">
                Ledrix Home
              </GlowButton>
            </div>
            <a
              href="#products"
              className="mt-14 font-mono text-[11px] uppercase tracking-[0.25em] text-white/40 transition-colors hover:text-white/70"
            >
              Two products ↓
            </a>
          </div>
        </section>

        {/* ── THE SPLIT — two products, one page ── */}
        <section id="products" className="grid grid-cols-1 md:grid-cols-2">
          {/* Ledrix Inspect — the professional tool (dark) */}
          <article className="flex flex-col justify-between gap-10 bg-ink px-8 py-20 text-white md:px-12 lg:px-16">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-soft">
                For inspectors
              </span>
              <h2 className="mt-4 flex items-center gap-3 text-3xl font-bold tracking-tight md:text-4xl">
                <LedrixDelta size={26} sheen />
                Ledrix Inspect
              </h2>
              <p className="mt-5 text-xl font-semibold leading-snug text-white [text-wrap:balance] md:text-2xl">
                The inspection, drafted as you shoot it.
              </p>
              <p className="mt-4 max-w-md leading-relaxed text-slate-300">
                Ledrix Intelligence proposes the finding the moment you capture the photo — you
                confirm, adjust, or reject. Field-reliable. iOS. Always inspector-verified.
              </p>
              <ul className="mt-7 flex flex-col gap-2.5 text-sm text-slate-200">
                {['AI-drafted findings, human-verified', 'Professional PDF & shareable web reports', 'The HITL truth engine at the core'].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-accent" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-9">
                <GlowButton href="/inspect" variant="primary" tone="dark" className="!px-6 !py-3">
                  Explore Ledrix Inspect →
                </GlowButton>
              </div>
            </div>
            <div className="flex justify-center pt-2 md:justify-start">
              <Shot src="/screenshots/capture-live.jpg" alt="Ledrix Inspect — live capture with on-device analyze" />
            </div>
          </article>

          {/* Ledrix Home — the homeowner record (light) */}
          <article className="flex flex-col justify-between gap-10 bg-surface px-8 py-20 text-body md:px-12 lg:px-16">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-ink">
                For homeowners
              </span>
              <h2 className="mt-4 flex items-center gap-3 text-3xl font-bold tracking-tight text-ink md:text-4xl">
                <LedrixDelta size={26} sheen />
                Ledrix Home
              </h2>
              <p className="mt-5 text-xl font-semibold leading-snug text-ink [text-wrap:balance] md:text-2xl">
                Your home, finally on the record.
              </p>
              <p className="mt-4 max-w-md leading-relaxed text-body">
                A living record of your home — from the inspection baseline through every repair,
                upgrade, and season. The story of your house, kept.
              </p>
              <ul className="mt-7 flex flex-col gap-2.5 text-sm text-body">
                {['A living record, not a one-time report', 'Maintenance on a schedule built for your home', 'Ask your home anything'].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-accent" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-9">
                <GlowButton href="/home" variant="primary" tone="light" className="!px-6 !py-3">
                  Explore Ledrix Home →
                </GlowButton>
              </div>
            </div>
            <div className="flex justify-center pt-2 md:justify-start">
              <Shot src="/screenshots/home-dashboard.jpg" alt="Ledrix Home — the home dashboard" />
            </div>
          </article>
        </section>

        {/* ── SHARED INTELLIGENCE ── */}
        <section className="border-t border-hairline bg-ground px-6 py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <LedrixDelta size={40} sheen />
            <h3 className="mt-6 text-3xl font-bold tracking-tight text-ink md:text-4xl">
              One brain. Ledrix Intelligence.
            </h3>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-body [text-wrap:balance]">
              Both products run on the same engine — the one that turns what a camera sees into
              structured, confirmable truth. Ledrix proposes; a human verifies. Because Ledrix owns
              structures, not guesses.
            </p>
          </div>
        </section>
      </main>

      <Footer />
      <MarketingOrb />
    </div>
  );
}
