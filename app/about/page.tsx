import type { Metadata } from 'next';
import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';
import { LedrixEye } from '@/components/LedrixEye';

export const metadata: Metadata = {
  title: 'About — Ledrix',
  description:
    'Ledrix Labs builds the intelligence layer for structures — starting with the home inspection, the highest-stakes moment in a home’s life.',
};

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'What it does',
    body: "In the field, the inspector captures evidence by photo and voice; Ledrix drafts the finding — system attribution, severity, written narrative, and recommended action — and surfaces defects a tired eye might miss. Nothing reaches the client until the inspector confirms it. On completion, Ledrix delivers a legally-formatted PDF report and a live client Home Portal in one tap — no late-night write-ups, no assembling documents at the office.",
  },
  {
    heading: "How it's different",
    body: "Three things set Ledrix apart: a human-in-the-loop truth engine — AI drafts, the inspector verifies — making output both fast and defensible; a vision-first workflow that keeps the inspector's attention on the house, not a checklist; and the Home Portal, which turns a one-time report into an enduring homeowner asset — and a durable channel to the buyer that no PDF-based competitor offers.",
  },
  {
    heading: 'Technology',
    body: 'Ledrix runs on a cloud-baseline AI architecture so every device — new or old, iOS or Android — shares one brain. Findings are grounded in timestamped, GPS-anchored evidence, and a synthesis and verification pass reviews each report for consistency before delivery.',
  },
  {
    heading: 'Market & model',
    body: 'Ledrix serves the large, highly fragmented U.S. home-inspection market — millions of inspections a year — through a subscription for inspectors, with integrated client booking and payments. The Home Portal extends reach to every buyer an inspector touches, creating a homeowner-facing surface for future services: repair estimates, contractor connections, and ongoing home-intelligence features.',
  },
];

export default function About() {
  return (
    <div id="top" className="min-h-screen bg-ink font-sans text-white antialiased">
      <Navbar />

      <main className="relative mx-auto max-w-3xl px-6 pb-28 pt-36 sm:pt-44">
        {/* soft accent glow behind the intro */}
        <div className="pointer-events-none absolute left-1/2 top-24 -z-10 h-80 w-[40rem] max-w-full -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[130px]" />

        {/* Intro */}
        <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
          About Ledrix Labs
        </span>
        <h1 className="text-4xl font-bold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-5xl">
          The intelligence layer for{' '}
          <span className="bg-gradient-to-r from-accent-soft via-accent to-accent-soft bg-clip-text text-transparent [text-shadow:0_0_40px_rgba(0,243,255,0.25)]">
            structures
          </span>
          .
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-slate-400 [text-wrap:balance] md:text-xl">
          Ledrix Labs is the company behind Ledrix, an AI-assisted inspection platform for home
          inspectors and the home buyers they serve. Ledrix pairs a field-first mobile app (iOS and Android)
          with Ledrix Intelligence — an AI built specifically for the built environment — to compress a full
          day&apos;s inspection-and-reporting workflow into the walkthrough itself.
        </p>

        {/* Sections */}
        <div className="mt-16 flex flex-col gap-12 border-t border-white/5 pt-14">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">{s.heading}</h2>
              <p className="mt-4 text-base leading-relaxed text-slate-400 md:text-lg">{s.body}</p>
            </section>
          ))}
        </div>

        {/* Vision closer — the Ledrix Vision eye */}
        <section className="mt-20 flex flex-col items-center border-t border-white/5 pt-16 text-center">
          <div className="mb-7 drop-shadow-[0_0_28px_rgba(0,243,255,0.4)]">
            <LedrixEye size={96} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Our vision</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
            Ledrix is building the intelligence layer for structures — starting with the inspection, the
            highest-stakes moment in a home&apos;s life — and expanding into the ongoing understanding,
            maintenance, and stewardship of the built world.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
