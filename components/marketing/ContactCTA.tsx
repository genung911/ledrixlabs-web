'use client';

// §4 — minimal "request a demo" form for enterprises. Self-contained with an
// optimistic success state. Wire `submit()` to an endpoint (e.g. /api/demo-request
// or a CRM) when ready — the markup + UX are production-shaped already.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GridBackground } from './ui/GridBackground';
import { GlowButton } from './ui/GlowButton';

export function ContactCTA() {
  const [form, setForm] = useState({ name: '', company: '', email: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // TODO: POST `form` to your demo-request endpoint / CRM.
      await new Promise((r) => setTimeout(r, 600));
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="demo" className="relative isolate overflow-hidden bg-ink py-28">
      <GridBackground />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}>
          <motion.span variants={fadeUp} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent/80">
            <span className="h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_#00F3FF]" />
            Request a demo
          </motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl font-bold tracking-tight text-white [text-wrap:balance] md:text-5xl">
            See Ledrix on your next inspection.
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-slate-400">
            For inspection firms and enterprise teams. Tell us where to reach you and we’ll set up a walkthrough.
          </motion.p>

          {sent ? (
            <motion.div
              variants={fadeUp}
              className="mt-10 rounded-2xl border border-accent/30 bg-accent/[0.06] p-8 text-white"
            >
              <div className="text-lg font-bold">Thanks — you’re on the list.</div>
              <p className="mt-1 text-sm text-slate-400">We’ll be in touch shortly to schedule your walkthrough.</p>
            </motion.div>
          ) : (
            <motion.form variants={fadeUp} onSubmit={submit} className="mt-10 flex flex-col gap-3 text-left">
              <Field label="Full name" value={form.name} onChange={set('name')} autoComplete="name" required />
              <Field label="Company" value={form.company} onChange={set('company')} autoComplete="organization" required />
              <Field label="Work email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />

              <div className="mt-3 flex justify-center">
                <GlowButton type="submit" variant="primary">
                  {busy ? 'Sending…' : 'Request a demo'}
                </GlowButton>
              </div>
            </motion.form>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        id={id}
        name={id}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none transition-colors duration-200 placeholder:text-slate-600 focus:border-accent/50 focus:bg-white/[0.05]"
        {...props}
      />
    </label>
  );
}
