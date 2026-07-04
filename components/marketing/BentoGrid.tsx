'use client';

// §3 — bento grid of the things that actually matter, with hover micro-interactions
// (lift, border glow, accent wash). Honest, feature-grounded claims — no fabricated
// accuracy stats and no "monitoring device" framing.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';

type Tile = { className: string; kicker?: string; stat?: string; title: string; body: string; img?: string };

const TILES: Tile[] = [
  {
    className: 'md:col-span-2 md:row-span-2',
    kicker: 'In the field',
    img: '/screenshots/IMG_5555.PNG',
    title: 'The finding, drafted the moment you shoot.',
    body: 'Every capture becomes a structured finding — system, location, priority, and the spec behind it — while you’re still standing in front of it. No evening typing up the report.',
  },
  { className: '', stat: '100%', title: 'Inspector-confirmed', body: 'Ledrix proposes; you Confirm, Adjust, or Reject. Nothing ships you didn’t sign off on.' },
  { className: '', stat: '5', title: 'Priority levels', body: 'Major Repair · Minor Repair · Maint & Improve · Typical Wear · Good — with Safety flagged separately. Clarity clients understand.' },
  { className: '', kicker: 'Hands-free', title: 'Log by voice with VAL', body: 'Speak the finding; VAL files it to the right system and waits for your confirm.' },
  { className: '', kicker: 'Deliverable', title: 'A report clients read', body: 'A clean, legal PDF and a live client home portal — generated, not assembled.' },
  {
    className: 'md:col-span-2',
    kicker: 'Everywhere',
    title: 'Every device, one brain.',
    body: 'iOS and Android, old phones and new — every device runs the same Ledrix Intelligence.',
  },
];

export function BentoGrid() {
  return (
    <section id="features" className="relative bg-ink py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Why Ledrix"
          title="Less paperwork. More caught."
          sub="The backup that drafts, structures, and delivers — so you spend your attention on the structure, not the keyboard."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[minmax(11rem,auto)]"
        >
          {TILES.map((t, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 ${t.className}`}
            >
              {/* hover accent wash */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative">
                {t.kicker && (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent/70">{t.kicker}</span>
                )}
                {t.stat && (
                  <div className="bg-gradient-to-br from-accent-soft to-accent bg-clip-text text-5xl font-bold tracking-tight text-transparent">
                    {t.stat}
                  </div>
                )}
              </div>

              <div className="relative mt-6">
                <h3 className="text-lg font-bold text-white">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.body}</p>
                {t.img && (
                  <div className="relative mt-6 h-56 overflow-hidden rounded-xl border border-white/10 ring-1 ring-white/5">
                    <Image src={t.img} alt="A finding drafted by Ledrix in the field" fill className="object-cover object-[50%_47%]" sizes="(max-width:768px) 100vw, 66vw" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b]/20 to-transparent" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
