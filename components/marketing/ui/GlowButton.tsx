'use client';

// GlowButton — the site's CTA, Tesla-pill style: monochrome, no glow, no gradient.
// `primary` is a solid near-black pill on light (white text); on a dark image it inverts
// to a translucent white pill (`tone="dark"`). `ghost` is a hairline/outline pill that
// inverts by tone. Renders as an <a> (href) or <button> (onClick) so it stays semantic.
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
  'group relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold uppercase tracking-wider transition-colors duration-300 active:scale-[0.98]';

export function GlowButton({
  children,
  href,
  onClick,
  type = 'button',
  variant = 'primary',
  tone = 'light',
  className = '',
}: Props) {
  // primary: a clean, minimal solid pill — near-black on light (white text); on a dark
  // image it inverts to a translucent white pill. No glow, no gradient, no accent color.
  const primary =
    tone === 'dark'
      ? 'bg-white/90 text-ink hover:bg-white'
      : 'bg-ink text-white hover:bg-black';
  // Ghost / secondary — a translucent outline pill; inverts by tone.
  const ghost =
    tone === 'dark'
      ? 'border border-white/40 text-white backdrop-blur hover:border-white/70 hover:bg-white/10'
      : 'border border-ink/15 text-ink/80 hover:border-ink/40 hover:text-ink';

  const cls = `${base} ${variant === 'primary' ? primary : ghost} ${className}`;

  const inner = <>{children}</>;

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
