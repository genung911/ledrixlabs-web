'use client';

// SampleDeliverables — "see what your client gets": two clickable tiles that open real samples in a new
// tab — the live Home Portal (rendered by /share/[id], always the current design) and the PDF report.
// Swap SAMPLE_PORTAL_ID for the inspection you want to feature; drop a fresh /sample-report.html to refresh
// the PDF.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';

const SAMPLE_PORTAL_ID = 'insp_sample_1783195334539';   // the inspection whose live Home Portal + PDF are featured
// Strip any /rest/v1 suffix — the env URL is the REST endpoint, but storage lives at the ROOT (…/storage/v1).
// Without this the link becomes …/rest/v1/storage/… which demands an apikey → "No API key found".
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rxfjczuymsvmfzxnbilo.supabase.co').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SAMPLE_PDF_URL = `${SUPA_URL}/storage/v1/object/public/inspection-pdfs/${SAMPLE_PORTAL_ID}/report.pdf`;

export function SampleDeliverables() {
  return (
    <section id="sample" className="relative bg-ink py-28 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="flex flex-col items-center text-center">
          <motion.span
            variants={fadeUp}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_#00F3FF]" />
            See what your client gets
          </motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl font-bold tracking-tight [text-wrap:balance] sm:text-5xl">
            Open a real one.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400 [text-wrap:balance]">
            Every inspection delivers two things — a clean, legal PDF and a live home portal the buyer keeps.
            Click either to open a real sample.
          </motion.p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="mt-14 grid gap-5 sm:grid-cols-2">
          {/* Home Portal — the live, current design */}
          <motion.a
            variants={fadeUp}
            href={`/share/${SAMPLE_PORTAL_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col overflow-hidden rounded-2xl border border-accent/20 bg-white/[0.02] shadow-[0_0_60px_rgba(0,243,255,0.05)] transition-colors hover:border-accent/40"
          >
            <div className="relative h-64 overflow-hidden bg-black/40">
              <Image
                src="/screenshots/IMG_5564.PNG"
                alt="The live Ledrix client home portal"
                fill
                className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-ink/90" />
            </div>
            <div className="flex flex-1 flex-col p-7">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent/90">Client Home App · Live</span>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-white">Sample Home Portal</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                The living portal your buyer keeps — health score, findings in plain language, a maintenance
                schedule, and property records. Tap any finding for a local cost estimate, pros to call, repair
                videos, and Ask Ledrix.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-accent">
                Open the live portal
                <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
              </span>
            </div>
          </motion.a>

          {/* PDF report */}
          <motion.a
            variants={fadeUp}
            href={SAMPLE_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/25"
          >
            <div className="relative flex h-64 items-center justify-center overflow-hidden bg-white/[0.02]">
              <svg width="88" height="88" viewBox="0 0 72 72" fill="none" className="opacity-80 transition-transform duration-500 group-hover:scale-105">
                <rect x="12" y="6" width="42" height="56" rx="4" stroke="#3a4650" strokeWidth="2" />
                <line x1="22" y1="24" x2="44" y2="24" stroke="#3a4650" strokeWidth="2" strokeLinecap="round" />
                <line x1="22" y1="33" x2="44" y2="33" stroke="#3a4650" strokeWidth="2" strokeLinecap="round" />
                <line x1="22" y1="42" x2="36" y2="42" stroke="#3a4650" strokeWidth="2" strokeLinecap="round" />
                <rect x="34" y="42" width="26" height="20" rx="3" fill="#0a0f12" stroke="#5a6b76" strokeWidth="1.6" />
                <line x1="40" y1="50" x2="54" y2="50" stroke="#5a6b76" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="40" y1="56" x2="49" y2="56" stroke="#5a6b76" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-1 flex-col p-7">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Inspection Report · PDF</span>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-white">Sample PDF Report</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                A clean, legal inspection report — system scores and every finding backed by timestamped,
                GPS-anchored photo proof, verified and signed by the inspector.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-300">
                Open the sample
                <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
              </span>
            </div>
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
