'use client';

// LegacyVsLedrix — the direct contrast, row by row. Grounded in real product differences
// (voice/vision AI drafting + HITL confirm, adaptive SOP templates, the living Home App,
// dedup/correlation review, real vision vs canned text, company-wide template + checkpoint
// sync) — no fabricated stats, no unverifiable claims about any named competitor.
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';

const ROWS: { legacy: string; ledrix: string }[] = [
  {
    legacy: 'Type every finding by hand, one field at a time.',
    ledrix: 'Point your camera. Ledrix drafts the finding — you confirm it.',
  },
  {
    legacy: 'One rigid checklist, whether the house needs it or not.',
    ledrix: 'Scope adapts to the house — NACHI, ASHI, or a template you built.',
  },
  {
    legacy: 'The report is the end of the relationship.',
    ledrix: 'The report is the start of one — a living Home App the client keeps.',
  },
  {
    legacy: 'You catch duplicate photos and contradictions yourself, manually.',
    ledrix: 'Ledrix flags likely duplicate photos and related findings — you decide, nothing merges silently.',
  },
  {
    legacy: '"AI" means canned phrases pulled from a template library.',
    ledrix: 'Real vision AI — it looked at the photo and tells you what it saw.',
  },
  {
    legacy: "Every inspector starts from zero. Nothing's shared.",
    ledrix: 'Company templates and a shared checkpoint library, synced across your team.',
  },
];

function XMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function LegacyVsLedrix() {
  return (
    <section className="relative bg-ground py-28 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeading
          eyebrow="The difference"
          title="Why do legacy software companies hate inspectors?"
          sub="They probably don't. But it's hard to tell the difference between hate and simply never having done the job."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-14 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)]"
        >
          {/* column headers */}
          <div className="grid grid-cols-2 border-b border-hairline">
            <div className="flex items-center gap-2 border-r border-hairline px-6 py-4 sm:px-8">
              <span className="text-muted"><XMark /></span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-muted">Legacy way</span>
            </div>
            <div className="flex items-center gap-2 px-6 py-4 sm:px-8">
              <span className="text-accent"><Check /></span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink">Ledrix way</span>
            </div>
          </div>

          {ROWS.map((r, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={`grid grid-cols-2 ${i !== ROWS.length - 1 ? 'border-b border-hairline' : ''}`}
            >
              <div className="flex items-start gap-3 border-r border-hairline px-6 py-5 sm:px-8">
                <span className="mt-1 flex-shrink-0 text-muted/70"><XMark /></span>
                <p className="text-sm leading-relaxed text-muted sm:text-[15px]">{r.legacy}</p>
              </div>
              <div className="flex items-start gap-3 bg-accent/[0.03] px-6 py-5 sm:px-8">
                <span className="mt-1 flex-shrink-0 text-accent"><Check /></span>
                <p className="text-sm font-medium leading-relaxed text-ink sm:text-[15px]">{r.ledrix}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
