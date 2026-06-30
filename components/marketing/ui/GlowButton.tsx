'use client';

// GlowButton — the site's CTA. `primary` is a solid cyan pill with a hover bloom;
// `ghost` is a bordered glass pill that lights up its border on hover. Renders as
// an <a> (href) or <button> (onClick) so it stays semantic.
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'ghost';
  className?: string;
};

const base =
  'group relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold uppercase tracking-wider transition-transform duration-300 hover:scale-[1.03] active:scale-95';

const styles = {
  primary: 'bg-accent text-[#04121a]',
  ghost: 'border border-white/15 text-white/80 backdrop-blur hover:border-accent/40 hover:text-white',
} as const;

export function GlowButton({ children, href, onClick, type = 'button', variant = 'primary', className = '' }: Props) {
  const inner = (
    <>
      {variant === 'primary' && (
        <span className="absolute inset-0 -z-10 rounded-full bg-accent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-90" />
      )}
      {children}
    </>
  );

  const cls = `${base} ${styles[variant]} ${className}`;

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
