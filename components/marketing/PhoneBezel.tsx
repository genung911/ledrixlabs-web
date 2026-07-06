// PhoneBezel — the one, consistent device-frame treatment for every app screenshot on the
// marketing site. Dark hardware bezel + dynamic-island notch, independent of page theme (a
// phone's chassis doesn't flip color with light/dark mode). Wraps whatever aspect ratio is
// passed in via `className` on the inner frame — a full-screen capture and a cropped/partial
// one both read as "this is a phone," just at different heights.
import type { ReactNode } from 'react';

export function PhoneBezel({
  children,
  className = '',
}: {
  children: ReactNode;
  /** Sizing classes for the frame itself, e.g. "aspect-[1284/2778] w-full" or "h-[20.5rem]". */
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2.1rem] border-[6px] border-[#14181b] bg-black shadow-[0_20px_50px_-18px_rgba(10,15,20,0.55)] ring-1 ring-black/40 ${className}`}
    >
      {/* Dynamic-island notch — floats over the screen content, same on every instance */}
      <div className="pointer-events-none absolute left-1/2 top-[7px] z-10 h-[18px] w-[84px] -translate-x-1/2 rounded-full bg-[#0a0c0e]" />
      {children}
    </div>
  );
}
