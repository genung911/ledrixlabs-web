'use client';

// §2 — the inspection pipeline, as a staggered 4-step reveal (owner 2026-11-24, mockup PAVcpwJ9d4gDpC17efHUJ7: "Four
// steps, not 3"). Shoot → Details fill in → Findings → Review & send. Step 2 is the one gently highlighted: photos doing
// the data entry is what sets Ledrix apart, and the inspector approves every page (the human-in-the-loop truth engine).
// Screenshots: one test job at a test address, never a client's (public/screenshots/site-2026-11/).
import type { ReactNode } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '@/lib/motion';
import { SectionHeading } from './ui/SectionHeading';
import { PhoneBezel } from './PhoneBezel';

type Fit = 'cover' | 'contain';

const STEPS: Array<{
  n: string;
  img: string;
  fit: Fit;
  title: string;
  body: string;
  icon: ReactNode;
  featured?: boolean;
}> = [
  {
    n: '01',
    img: '/screenshots/site-2026-11/s1-camera.jpg',
    fit: 'contain',
    title: 'Shoot',
    body: 'Photograph it the way you already do. One camera, three shutters — Coverage, Finding and Limitation — and each photo lands on the system in front of you.',
    icon: (
      <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L18 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
    ),
  },
  {
    n: '02',
    img: '/screenshots/site-2026-11/s2-details.jpg',
    fit: 'contain',
    title: 'Details fill in',
    body: 'Ledrix reads the data plate — brand, fuel, capacity, age — fills the details from your photos, and asks only what it couldn’t see. You approve the page.',
    icon: <path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3Z M9.5 11.5l1.8 1.8 3.4-3.6" />,
    featured: true,
  },
  {
    n: '03',
    img: '/screenshots/site-2026-11/s3-finding.jpg',
    fit: 'contain',
    title: 'Findings',
    body: 'Ledrix drafts the finding from what it sees and files it to the right system. You stay the source of truth — Confirm, Adjust, or Reject every one.',
    icon: <path d="M5 21V4 M5 4h11l-2 4 2 4H5" />,
  },
  {
    n: '04',
    img: '/screenshots/site-2026-11/s4-review-send.jpg',
    fit: 'contain',
    title: 'Review & send',
    body: 'A full report and a summary — a professional PDF and a live home portal for your client, sent before you leave the driveway.',
    icon: <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4Z M9 13l2 2 4-4" />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative bg-ground py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="How it works"
          title="From the photo to the report, in one pass."
          sub="Ledrix suggests, you decide. Nothing reaches the report until you’ve confirmed it."
        />

        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4"
        >
          {STEPS.map((s) => (
            <motion.li
              key={s.n}
              variants={fadeUp}
              className={[
                'group relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-all duration-300',
                s.featured
                  ? 'border-ink/20 bg-surface shadow-[0_20px_60px_-34px_rgba(10,15,20,0.5)]'
                  : 'border-hairline bg-surface shadow-[0_18px_50px_-36px_rgba(10,15,20,0.4)] hover:-translate-y-1 hover:border-ink/20',
              ].join(' ')}
            >

              {/* screenshot — uniform light stage; every step's screen sits in the same phone bezel. */}
              <div className="relative mb-6 flex h-[26rem] w-full items-center justify-center overflow-hidden rounded-xl border border-hairline bg-gradient-to-b from-[#eef2f5] to-[#e2e8ee] sm:h-[30rem] lg:h-[34rem] xl:h-[30rem]">
                <PhoneBezel className="aspect-[9/19.5] h-[24.5rem] sm:h-[28.5rem] lg:h-[32.5rem] xl:h-[28rem]">
                  <Image
                    src={s.img}
                    alt={s.title}
                    fill
                    className={[
                      'transition-transform duration-500 group-hover:scale-[1.03]',
                      s.fit === 'cover' ? 'object-cover object-[50%_35%]' : 'object-contain',
                    ].join(' ')}
                    sizes="(min-width: 1280px) 230px, (min-width: 1024px) 250px, (min-width: 640px) 210px, 185px"
                  />
                </PhoneBezel>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold tracking-widest text-muted">{s.n}</span>
                <svg
                  width="32" height="32" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  className="text-ink transition-transform duration-300 group-hover:scale-110"
                >
                  {s.icon}
                </svg>
              </div>

              <h3 className="mt-5 text-2xl font-bold text-ink">{s.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-body">{s.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
