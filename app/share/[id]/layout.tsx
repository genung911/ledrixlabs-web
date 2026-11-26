import type { Viewport } from 'next';

// THE WHOLE SCREEN (owner 2026-11-25: "It also still has a couple white rows at top and bottom. Can the page use the
// whole screen?"). Safari tints its status bar and toolbar from theme-color, and paints past the page with the
// html/body background. Both follow the device's light / dark setting with the Home Record's ground (shared.tsx SP_CSS).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F3F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0B0D' },
  ],
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
