'use client';

// §FAQ — the questions inspectors actually ask, as an accordion. Answers stay grounded in the product
// (HITL truth engine, cloud-baseline AI, the Home Portal) — no pricing, no unshipped features.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';

const FAQS = [
  {
    q: 'What is Ledrix?',
    a: 'Ledrix is an AI-assisted platform for home inspectors. It drafts a structured finding the moment you capture a photo — system, location, priority, and the spec behind it — then compiles a clean, legal PDF and a live client home portal. You inspect the house; Ledrix handles the write-up.',
  },
  {
    q: 'Does Ledrix replace the inspector?',
    a: 'No — and it never will. Ledrix proposes; you decide. Every finding passes through your Confirm, Adjust, or Reject review before it goes anywhere. That human-in-the-loop review is the core of the product, not an optional setting — nothing ships that you did not sign off on.',
  },
  {
    q: 'How accurate is the AI?',
    a: 'Ledrix is a fast, well-grounded starting point — not a final determination. It reports what is visible, compares it to standard practice, and defers genuine judgment calls to you. You verify every finding before it reaches a client, which is exactly how the workflow is designed.',
  },
  {
    q: 'Do I need a license to use Ledrix?',
    a: 'Ledrix is built for professional home inspectors. Licensing requirements vary by state — some require a license, others do not — so check your local rules. Ledrix itself does not require a license to run, and you remain responsible for your reports and any licensing that applies to your work.',
  },
  {
    q: 'What devices does it run on?',
    a: 'iPhone and Android, phones and tablets. Ledrix runs on a cloud-baseline AI architecture, so every device — new or old — shares the same intelligence. No special hardware required.',
  },
  {
    q: 'How does the client Home Portal work?',
    a: 'Every inspection becomes a living home record your client can open anytime: findings with photos, clear priorities, and specs — plus a durable channel back to them. It turns a one-time PDF into an asset the homeowner actually keeps and returns to.',
  },
  {
    q: 'Who owns my data, and is it secure?',
    a: 'Your inspections are yours. AI analysis runs through a secure backend gateway, and you control your reports and what is shared with each client. We do not sell your inspection data.',
  },
  {
    q: 'Can my whole team use it?',
    a: 'Yes. Owners and managers can bring their inspectors onto one company account with shared templates and settings, so the whole crew works from the same playbook. Want to see it with your team? Request a demo below.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative bg-ground py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions inspectors ask."
          sub="Straight answers on how Ledrix fits your work — and where you stay in control."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-14 flex flex-col gap-3"
        >
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={i}
                variants={fadeUp}
                className={[
                  'overflow-hidden rounded-2xl border transition-colors duration-300',
                  isOpen
                    ? 'border-accent/50 bg-surface shadow-[0_14px_40px_-30px_rgba(10,132,255,0.6)]'
                    : 'border-hairline bg-surface hover:border-accent-ink/40',
                ].join(' ')}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-base font-bold text-ink">{f.q}</span>
                  <svg
                    width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={[
                      'flex-shrink-0 text-accent-ink transition-transform duration-300',
                      isOpen ? 'rotate-45' : '',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <div
                  className={[
                    'grid transition-all duration-300 ease-out',
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  ].join(' ')}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-body">{f.a}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
