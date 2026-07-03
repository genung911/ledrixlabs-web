import type { Metadata } from 'next';
import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import { LedrixEye } from '@/components/LedrixEye';
import { ETHIX_CATEGORIES } from '@/lib/ethix';

export const metadata: Metadata = {
  title: 'Ethix — your data, your call | Ledrix',
  description:
    'Ethix is Ledrix’s promise on data: it’s yours. You opt in, you choose what’s shared, it’s never personal, and you keep the money — Ledrix already makes its money on the subscription.',
};

const PROMISES: { k: string; v: string }[] = [
  { k: 'Opt-in, always', v: 'Off by default. Nothing is ever shared unless you turn it on — and you can turn it back off any time, no questions asked.' },
  { k: 'You choose what', v: 'You pick the categories. Share one, share none, share all — your call, and you can change it whenever you like.' },
  { k: 'Never personal', v: 'Only anonymized, aggregate signals. Never your address, your name, your photos, or anything that points back to you.' },
  { k: 'You keep the money', v: 'When it earns, it earns for you. Ledrix already makes its money on your subscription — Ethix isn’t ours to profit from.' },
];

export default function Ethix() {
  return (
    <div id="top" className="min-h-screen bg-ink font-sans text-white antialiased">
      <Navbar />

      <main className="relative mx-auto max-w-3xl px-6 pb-28 pt-36 sm:pt-44">
        <div className="pointer-events-none absolute left-1/2 top-24 -z-10 h-80 w-[40rem] max-w-full -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[130px]" />

        {/* Intro — the reframe */}
        <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
          Ethix · your data, your call
        </span>
        <h1 className="text-4xl font-bold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-5xl">
          Your data isn’t a company’s to fight over.{' '}
          <span className="bg-gradient-to-r from-accent-soft via-accent to-accent-soft bg-clip-text text-transparent [text-shadow:0_0_40px_rgba(0,243,255,0.25)]">
            It’s yours.
          </span>
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-slate-400 [text-wrap:balance] md:text-xl">
          The whole data economy is a fight between companies over who gets to own and sell what’s yours.
          Ethix asks the question no one at that table is asking: what about the person the data is actually
          about? With Ethix, the answer is simple — you own it, you decide, and you keep what it makes.
        </p>

        {/* The promise — four cards */}
        <div className="mt-14 grid gap-4 border-t border-white/5 pt-14 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <div key={p.k} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
              <h3 className="text-sm font-bold tracking-tight text-white">{p.k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.v}</p>
            </div>
          ))}
        </div>

        {/* Never personal — exactly what that means, per category */}
        <section className="mt-16 border-t border-white/5 pt-14">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">Never personal — here’s exactly what that means</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">
            You choose from these categories. Every one shares only broad, anonymized signals — the kind that
            help researchers, manufacturers, and communities understand how homes are built and how they hold
            up. None of them can point back to you.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {ETHIX_CATEGORIES.map((c) => (
              <div key={c.key} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <h3 className="text-sm font-bold tracking-tight text-white">{c.label}</h3>
                <p className="mt-1 text-sm text-slate-500">{c.blurb}</p>
                <div className="mt-3 flex flex-col gap-1.5 text-sm">
                  <p className="flex gap-2 text-slate-300"><span className="select-none text-emerald-400">Shared</span><span className="text-slate-400">{c.shares}</span></p>
                  <p className="flex gap-2 text-slate-300"><span className="select-none text-slate-500">Never</span><span className="text-slate-500">{c.never}</span></p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* You get paid — not us */}
        <section className="mt-16 border-t border-white/5 pt-14">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">You get paid — not us</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">
            Ledrix already makes its money the honest way — inspectors pay for the software. So Ethix was never
            built to be a revenue stream for us. When your shared signals earn, that money is yours. At most,
            Ledrix keeps a thin cut to cover the actual cost of running it — never a profit — and you’ll always
            see the exact split. You might make pennies a year. The point isn’t the amount. The point is that
            <span className="text-slate-200"> you</span> make it — not Ledrix, not an AI lab, not some data
            broker — and that you got to decide whether to at all.
          </p>
          <p className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">
            Even Palantir’s CEO has publicly accused the big AI companies of taking customers’ data and IP.
            But that’s still corporations arguing over corporate data. Ethix is the version where the person
            the data belongs to is the one holding the pen — and the one getting paid.
          </p>
        </section>

        {/* Where it stands — honest status */}
        <section className="mt-16 border-t border-white/5 pt-14">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">Where it stands</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">
            We’re building Ethix carefully, and we’d rather be slow than sloppy with something this important.
            <span className="text-slate-200"> Nothing is being sold today.</span> You can set your preference now
            in your Home App — opt in, choose your categories — and it’ll be ready when the program goes live.
            We’ll ask you again before a single dollar ever changes hands, and you’ll see every cent.
          </p>
        </section>

        {/* Closer */}
        <section className="mt-20 flex flex-col items-center border-t border-white/5 pt-16 text-center">
          <div className="mb-7 drop-shadow-[0_0_28px_rgba(0,243,255,0.4)]">
            <LedrixEye size={88} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">This is what ethical looks like.</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
            The industry turned people into the product. Ethix makes the person the owner. It’s their data —
            let them have it.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
