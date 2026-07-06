'use client';

// SampleDeliverables — "see what your client gets": two clickable tiles that open real samples in a new
// tab — the live Home Portal (rendered by /share/[id], always the current design) and the PDF report.
// Light cards, big real photos leading, copy reflowed to scannable bullets (the finding-card voice).
// Swap SAMPLE_PORTAL_ID for the inspection you want to feature; drop a fresh /sample-report.html to refresh
// the PDF.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { PhoneBezel } from './PhoneBezel';

const SAMPLE_PORTAL_ID = 'insp_sample_1783195334539';   // the inspection whose live Home Portal + PDF are featured
// The PDF tile points at the stable /sample.pdf route, which server-side signs the
// sample's report.pdf and redirects. This keeps working whether the inspection-pdfs
// bucket is public or private (no raw public storage URL in the client bundle).
// Keep SAMPLE_PORTAL_ID in sync with SAMPLE_ID in app/sample.pdf/route.ts.
const SAMPLE_PDF_URL = '/sample.pdf';

const PORTAL_POINTS = [
  'The living portal your buyer keeps — health score, findings in plain language.',
  'A maintenance schedule and property records.',
  'Tap any finding: local cost estimate, pros to call, repair videos, and Ask Ledrix.',
];
const PDF_POINTS = [
  'An at-a-glance summary, then every finding grouped by system.',
  'Every finding backed by timestamped, GPS-anchored photo proof.',
  'Checklists that adapt to your jurisdiction — no generic noise.',
  'Verified and signed by the inspector.',
];

function Points({ items, tone }: { items: string[]; tone: 'accent' | 'muted' }) {
  return (
    <ul className="mt-4 flex flex-col gap-2.5">
      {items.map((p) => (
        <li key={p} className="flex items-start gap-2.5">
          <span
            className={`mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              tone === 'accent' ? 'bg-ink' : 'bg-muted'
            }`}
          />
          <span className="text-sm leading-relaxed text-body">{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function SampleDeliverables() {
  return (
    <section id="sample" className="relative bg-ground py-28 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="flex flex-col items-center text-center">
          <motion.span
            variants={fadeUp}
            className="mb-5 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted"
          >
            <span className="h-px w-6 bg-muted/50" />
            See what your client gets
          </motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl font-bold tracking-tight text-ink [text-wrap:balance] sm:text-5xl">
            Open a real one.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-5 max-w-xl text-lg leading-relaxed text-body [text-wrap:balance]">
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
            className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/25"
          >
            <div className="relative flex justify-center overflow-hidden bg-[#e2e8ee] p-6">
              <PhoneBezel className="aspect-[1000/2053] w-full max-w-[220px] transition-transform duration-500 group-hover:scale-[1.03]">
                <Image
                  src="/sample-home-portal.jpg"
                  alt="The live Ledrix client home portal"
                  fill
                  className="object-contain"
                />
              </PhoneBezel>
            </div>
            <div className="flex flex-1 flex-col p-7">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Client Home App · Live</span>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-ink">Sample Home Portal</h3>
              <Points items={PORTAL_POINTS} tone="accent" />
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-ink">
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
            className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/25"
          >
            <div className="relative flex justify-center overflow-hidden bg-[#e2e8ee] p-6">
              <div className="relative aspect-[772/1000] w-full max-w-[220px] overflow-hidden rounded-md shadow-[0_14px_34px_-16px_rgba(10,15,20,0.4)] ring-1 ring-black/10 transition-transform duration-500 group-hover:scale-[1.03]">
                <Image src="/sample-pdf-cover.jpg" alt="The Ledrix inspection report cover page" fill className="object-contain" />
              </div>
            </div>
            <div className="flex flex-1 flex-col p-7">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Inspection Report · PDF</span>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-ink">Sample PDF Report</h3>
              <Points items={PDF_POINTS} tone="muted" />
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-body">
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
