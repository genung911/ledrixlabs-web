'use client';

// §3 — bento grid of the things that actually matter, on light cards with hairline
// borders and a restrained hover lift (monochrome — no accent bloom). Image-first where
// it counts; the lead tile reflows its finding into scannable bullets. Honest,
// feature-grounded claims — no fabricated accuracy stats, no "monitoring device" framing.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';

type Tile = {
  className: string;
  kicker?: string;
  stat?: string;
  title: string;
  body?: string;
  points?: string[];
  img?: string;
};

const TILES: Tile[] = [
  {
    className: 'md:col-span-2 md:row-span-2',
    kicker: 'In the field',
    img: '/screenshots/IMG_5555.PNG',
    title: 'The finding, drafted the moment you shoot.',
    points: [
      'Every capture becomes a structured finding — system, location, priority, and the spec behind it.',
      'Drafted while you’re still standing in front of it.',
      'No evening typing up the report.',
    ],
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
    <section id="features" className="relative bg-ground py-28">
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
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-hairline bg-surface p-7 shadow-[0_18px_50px_-38px_rgba(10,15,20,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/20 ${t.className}`}
            >
              <div className="relative">
                {t.kicker && (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{t.kicker}</span>
                )}
                {t.stat && (
                  <div className="text-5xl font-bold tracking-tight text-ink">
                    {t.stat}
                  </div>
                )}
              </div>

              <div className="relative mt-6">
                <h3 className="text-lg font-bold text-ink">{t.title}</h3>
                {t.body && <p className="mt-2 text-sm leading-relaxed text-body">{t.body}</p>}
                {t.points && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {t.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5">
                        <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink" />
                        <span className="text-sm leading-relaxed text-body">{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {t.img && (
                  <div className="relative mt-6 h-56 overflow-hidden rounded-xl border border-hairline ring-1 ring-white/60">
                    <Image src={t.img} alt="A finding drafted by Ledrix in the field" fill className="object-cover object-[50%_47%]" sizes="(max-width:768px) 100vw, 66vw" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-hairline to-transparent" />
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
