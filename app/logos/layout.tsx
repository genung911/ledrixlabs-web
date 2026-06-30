import type { Metadata } from 'next';

// Throwaway logo-comparison page — keep it out of search.
export const metadata: Metadata = {
  title: 'Ledrix — logo lab',
  robots: { index: false, follow: false },
};

export default function LogosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
