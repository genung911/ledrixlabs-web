import Image from 'next/image';
import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import MarketingOrb from '@/components/MarketingOrb';
import { GlowButton } from '@/components/marketing/ui/GlowButton';
import { PhoneBezel } from '@/components/marketing/PhoneBezel';
import { LedrixDelta } from '@/components/LedrixDelta';

// Ledrix Home product page — the homeowner side of the house. The story is the living record:
// an inspection baseline that keeps growing with every repair, upgrade, and season. No spatial /
// floor-plan / hardware talk here — that's out of marketing scope per the manifesto.
const HOME_LINKS = [
  { href: '/home#what', label: 'What it is' },
  { href: '/home#baseline', label: 'The baseline' },
  { href: '/inspect', label: 'Ledrix Inspect' },
  { href: '/about', label: 'About' },
  { href: '/ethix', label: 'Ethix' },
];

export const metadata = {
  title: 'Ledrix Home — your home, finally on the record',
  description:
    'A living record of your home, from the inspection baseline through every repair, upgrade, and season. The story of your house, kept.',
};

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <PhoneBezel className="aspect-[1320/2868] w-full max-w-[264px]">
      <Image src={src} alt={alt} fill sizes="264px" className="object-cover" />
    </PhoneBezel>
  );
}

const PILLARS = [
  {
    title: 'A living record',
    body: 'Not a one-time report that ages in a drawer. Ledrix Home keeps a running record of your house that only gets more complete over time.',
  },
  {
    title: 'Maintenance on a schedule',
    body: 'What to do and when — built from what your home actually has, not a generic checklist. Log each job and it becomes part of the record.',
  },
  {
    title: 'Ask your home anything',
    body: 'When is the water heater due? What did the inspector say about the roof? Ledrix Intelligence answers from your home’s own record.',
  },
];

export default function LedrixHomePage() {
  return (
    <div id="top" className="min-h-screen bg-ground font-sans text-body antialiased">
      <Navbar overLight links={HOME_LINKS} ctaHref="/home#get" />

      <main>
        {/* ── HERO (light, homeowner-warm) ── */}
        <section className="relative isolate flex min-h-[86svh] items-center overflow-hidden bg-ground">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1/4 right-0 h-[60vh] w-[60vh] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(33,123,232,0.10), transparent 62%)' }}
          />
          <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-hairline bg-surface px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-body">
                <LedrixDelta size={14} sheen />
                Ledrix Home
              </span>
              <h1 className="mt-7 text-5xl font-extrabold leading-[1.05] tracking-tight text-ink [text-wrap:balance] sm:text-6xl">
                Your home, finally on the record.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-body [text-wrap:balance]">
                Every home tells a story. Ledrix keeps it — a living record from the inspection
                baseline through every repair, upgrade, and season.
              </p>
              <div id="get" className="mt-9 flex flex-wrap gap-3">
                <GlowButton href="/inspect" variant="ghost" tone="light" className="!px-6 !py-3">
                  See Ledrix Inspect
                </GlowButton>
              </div>
            </div>
            <div className="flex justify-center md:justify-end">
              <Shot src="/screenshots/home-dashboard.jpg" alt="Ledrix Home — the home dashboard" />
            </div>
          </div>
        </section>

        {/* ── WHAT IT IS ── */}
        <section id="what" className="border-t border-hairline bg-surface px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ink [text-wrap:balance] md:text-4xl">
              The Carfax of your home.
            </h2>
            <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title}>
                  <div className="mb-4 h-1 w-8 rounded-full bg-accent" />
                  <h3 className="text-xl font-semibold text-ink">{p.title}</h3>
                  <p className="mt-3 leading-relaxed text-body">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── THE BASELINE (ties to Inspect) ── */}
        <section id="baseline" className="bg-ground px-6 py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 md:grid-cols-2">
            <div className="order-2 flex justify-center md:order-1 md:justify-start">
              <Shot src="/screenshots/home-history.jpg" alt="Ledrix Home — the living record of maintenance and projects" />
            </div>
            <div className="order-1 md:order-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-ink">
                Where it starts
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink [text-wrap:balance] md:text-4xl">
                It begins with a real inspection.
              </h2>
              <p className="mt-5 max-w-md leading-relaxed text-body">
                When a Ledrix-equipped inspector walks your home, their findings become your
                starting record — the honest baseline everything else is measured against. From
                there, it’s yours to keep alive.
              </p>
              <div className="mt-8">
                <GlowButton href="/inspect" variant="primary" tone="light" className="!px-6 !py-3">
                  How inspectors use Ledrix →
                </GlowButton>
              </div>
            </div>
          </div>
        </section>

        {/* ── SHARED INTELLIGENCE ── */}
        <section className="border-t border-hairline bg-dark px-6 py-24 text-white">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <LedrixDelta size={40} sheen />
            <h3 className="mt-6 text-3xl font-bold tracking-tight md:text-4xl">
              Powered by Ledrix Intelligence.
            </h3>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300 [text-wrap:balance]">
              The same engine professionals trust in the field answers your questions at home —
              grounded in your home’s own record, never a guess.
            </p>
          </div>
        </section>
      </main>

      <Footer />
      <MarketingOrb />
    </div>
  );
}
