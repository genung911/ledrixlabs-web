'use client';

// ProductShowcase — a fanned trio of real app screenshots under the hero: Capture
// (left), Confirm (center, raised), and the client home portal (right). Flanks hide
// on small screens so the center phone always reads.
import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, scaleIn } from '@/lib/motion';

function Phone({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-black shadow-2xl shadow-black/60 ${className}`}>
      <Image src={src} alt={alt} width={1284} height={2778} className="h-auto w-full" />
    </div>
  );
}

export function ProductShowcase() {
  return (
    <section className="relative -mt-20 bg-ink pb-28">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          variants={scaleIn}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="relative"
        >
          {/* glow behind the phones */}
          <div className="pointer-events-none absolute left-1/2 top-1/4 -z-10 h-72 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />

          <div className="flex items-end justify-center">
            {/* Confirm (hero) + the client home portal. The old left "LIVE capture" phone was pulled
                with Body Cam — swap in a clean capture screenshot here if the trio is wanted back. */}
            <Phone
              src="/screenshots/IMG_5553.PNG"
              alt="Confirming an AI-drafted finding"
              className="relative z-20 w-[230px] -rotate-[5deg] lg:w-[260px]"
            />
            <Phone
              src="/screenshots/IMG_5564.PNG"
              alt="The client home portal"
              className="w-[210px] rotate-[5deg] -ml-6 translate-y-6 opacity-95 sm:-ml-8 lg:w-[230px]"
            />
          </div>
        </motion.div>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-10 text-center text-xs uppercase tracking-[0.25em] text-slate-600"
        >
          Capture · Confirm · Deliver — all from the field
        </motion.p>
      </div>
    </section>
  );
}
