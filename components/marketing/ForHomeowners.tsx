'use client';

// ForHomeowners — the site is otherwise written for inspectors ("your client," "your
// team"). This is the one section that speaks directly to a homeowner reading it about
// their own house, and points at the SAME live sample portal SampleDeliverables already
// shows — no new artifact, just the right framing for a different reader. Software only:
// the ongoing home-record vision, nothing about sensors or hardware (that's a longer-term,
// self-funded track — not something to represent as available today).
import { useState } from 'react';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { GlowButton } from './ui/GlowButton';

const SAMPLE_PORTAL_ID = 'eval-house-seed-v1';

export function ForHomeowners() {
  const [form, setForm] = useState({ name: '', email: '' });
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
        body: JSON.stringify({ ...form, source: 'homeowner' }),
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
    <section id="homeowners" className="relative bg-ground py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}>
          <motion.span variants={fadeUp} className="mb-5 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
            <span className="h-px w-6 bg-muted/50" />
            For homeowners
          </motion.span>

          <motion.h2 variants={fadeUp} className="text-4xl font-bold tracking-tight text-ink [text-wrap:balance] md:text-5xl">
            Your inspection shouldn&apos;t end at the PDF.
          </motion.h2>

          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-body [text-wrap:balance]">
            When an inspector uses Ledrix, your report becomes a living Home Portal — findings in
            plain language, a maintenance schedule, and a record of your property you keep coming
            back to, not a PDF you open once and forget.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8">
            <GlowButton href={`/share/${SAMPLE_PORTAL_ID}`} variant="ghost">
              See a live example
            </GlowButton>
          </motion.div>

          <motion.div variants={fadeUp} className="mx-auto mt-14 max-w-md rounded-2xl border border-hairline bg-surface p-8">
            {sent ? (
              <>
                <div className="text-lg font-bold text-ink">You&apos;re on the list.</div>
                <p className="mt-1 text-sm text-body">We&apos;ll reach out as this opens up to homeowners directly.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">Not an inspector — just want to know when this reaches homeowners?</p>
                <form onSubmit={submit} className="mt-5 flex flex-col gap-3 text-left">
                  <Field label="Name" value={form.name} onChange={set('name')} autoComplete="name" required />
                  <Field label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
                  {error && <p className="text-center text-sm text-safety" role="alert">{error}</p>}
                  <div className="mt-2 flex justify-center">
                    <GlowButton type="submit" variant="primary">
                      {busy ? 'Sending…' : 'Keep me posted'}
                    </GlowButton>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `homeowner-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <input
        id={id}
        name={id}
        className="w-full rounded-xl border border-hairline bg-ground px-4 py-3 text-ink outline-none transition-colors duration-200 placeholder:text-muted focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
        {...props}
      />
    </label>
  );
}
