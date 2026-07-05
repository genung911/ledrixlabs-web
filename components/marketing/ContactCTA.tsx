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
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setError(j.error ?? 'Something went wrong — please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="demo" className="relative isolate overflow-hidden bg-ground py-28">
      <GridBackground variant="light" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}>
          <motion.span variants={fadeUp} className="mb-5 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
            <span className="h-px w-6 bg-muted/50" />
            Request a demo
          </motion.span>
          <motion.h2 variants={fadeUp} className="text-4xl font-bold tracking-tight text-ink [text-wrap:balance] md:text-5xl">
            See Ledrix on your next inspection.
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-body">
            For inspection firms and enterprise teams. Tell us where to reach you and we’ll set up a walkthrough.
          </motion.p>

          {sent ? (
            <motion.div
              variants={fadeUp}
              className="mt-10 rounded-2xl border border-hairline bg-surface p-8 text-ink shadow-[0_18px_50px_-36px_rgba(10,15,20,0.4)]"
            >
              <div className="text-lg font-bold">Thanks — you’re on the list.</div>
              <p className="mt-1 text-sm text-body">We’ll be in touch shortly to schedule your walkthrough.</p>
            </motion.div>
          ) : (
            <motion.form variants={fadeUp} onSubmit={submit} className="mt-10 flex flex-col gap-3 text-left">
              <Field label="Full name" value={form.name} onChange={set('name')} autoComplete="name" required />
              <Field label="Company" value={form.company} onChange={set('company')} autoComplete="organization" required />
              <Field label="Work email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />

              {error && <p className="text-center text-sm text-safety" role="alert">{error}</p>}
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
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <input
        id={id}
        name={id}
        className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-ink outline-none transition-colors duration-200 placeholder:text-muted focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
        {...props}
      />
    </label>
  );
}
