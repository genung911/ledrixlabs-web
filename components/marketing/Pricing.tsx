'use client';

// Pricing / Start — replaces the "Request a demo" form (owner 2026-11-24: "Pricing start, no demo anymore"; mockup
// PAVcpwJ9d4gDpC17efHUJ7, approved). The price (b7; plan mockup 13QNuHGzRGv2t2GdyextR4 screen 1, "Approved"): one
// plan, per inspector — $79 for 6 months in the launch window, then $119 — and Start goes to the website's trial
// sign-up (/app/start), 14 days, no card. The app is downloaded after (APP_STORE_URL, below the card).
//
// APP_STORE_URL is null until the app is public on the App Store (it is TestFlight-only today): while null the button
// reads "Coming to the App Store" and is not a link, so nobody lands on a page that doesn't exist. Set it at launch.
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GridBackground } from './ui/GridBackground';
import { GlowButton } from './ui/GlowButton';

export const APP_STORE_URL: string | null = null;

const INCLUDED = [
  'Unlimited inspections',
  'Photos fill in the details; findings drafted for you',
  'A full report and a summary, plus a live client portal',
  'Your company’s template and your team on one account',
  'The website for office work: templates, inspections, reports, invoices',
];

export function Pricing() {
  return (
    <section id="pricing" className="relative isolate overflow-hidden bg-ground py-28">
      <GridBackground variant="light" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }}>
          <motion.span variants={fadeUp} className="mb-5 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
            <span className="h-px w-6 bg-muted/50" />
            Pricing
          </motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl font-bold tracking-tight text-ink [text-wrap:balance] md:text-5xl">
            Start inspecting with Ledrix.
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-body">
            One plan, everything included, priced per inspector.
          </motion.p>

          <motion.div variants={fadeUp}
            className="mx-auto mt-10 max-w-md rounded-2xl border border-ink/15 bg-surface p-7 text-left shadow-[0_20px_60px_-34px_rgba(10,15,20,0.5)]">
            <span className="inline-block rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-ink">Launch offer</span>
            <span className="mt-3 block font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted">Ledrix Inspect</span>
            <div className="mt-2 flex items-baseline gap-2"><span className="text-4xl font-bold tracking-tight text-ink">$79</span><span className="text-sm text-muted">per inspector / month for 6 months</span></div>
            <p className="mt-1 text-sm text-body">Then $119. Office staff are free.</p>
            <ul className="mt-5 flex flex-col gap-3">
              {INCLUDED.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[3px] flex-shrink-0 text-ink" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-base leading-relaxed text-body">{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <GlowButton href="/app/start" variant="primary" className="w-full justify-center">
                Start your 14-day free trial
              </GlowButton>
              <p className="mt-2 text-center text-sm text-muted">No card to start. Cancel any time.</p>
            </div>
            <p className="mt-4 text-center text-sm text-muted">
              Already have an account?{' '}
              <a href="/app/login" className="font-semibold text-body hover:text-ink">Sign in on the website</a>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
