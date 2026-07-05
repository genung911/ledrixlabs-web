'use client';

// GlowButton — the site's CTA. `primary` is a solid cyan pill with a soft glow
// (reads on both the light ground and the dark hero band). `ghost` is a hairline
// pill; pass `tone="dark"` when it sits on a dark section so the border/text invert.
// Renders as an <a> (href) or <button> (onClick) so it stays semantic.
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'ghost';
  tone?: 'light' | 'dark';
  className?: string;
};

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold uppercase tracking-wider transition-all duration-300 hover:scale-[1.03] active:scale-95';

export function GlowButton({
  children,
  href,
  onClick,
  type = 'button',
  variant = 'primary',
  tone = 'light',
  className = '',
}: Props) {
  // Solid cyan pill with a deep-ink label + cyan bloom — the same on light or dark.
  const primary =
    'bg-gradient-to-b from-[#3af7ff] to-accent text-[#04252b] shadow-[0_6px_24px_-6px_rgba(0,243,255,0.65)] hover:shadow-[0_10px_32px_-6px_rgba(0,243,255,0.85)]';
  // Hairline pill — inverts by tone.
  const ghost =
    tone === 'dark'
      ? 'border border-white/25 text-white/85 backdrop-blur hover:border-accent/60 hover:text-white'
      : 'border border-ink/15 text-ink/80 hover:border-accent-ink/60 hover:text-ink';

  const cls = `${base} ${variant === 'primary' ? primary : ghost} ${className}`;

  const inner = (
    <>
      {variant === 'primary' && (
        <span className="absolute inset-0 -z-10 rounded-full bg-accent opacity-30 blur-2xl transition-opacity duration-300 group-hover:opacity-50" />
      )}
      {children}
    </>
  );

  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <button type={type} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
