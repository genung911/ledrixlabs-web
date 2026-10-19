import type { Metadata } from 'next';
import { WorkspaceRoot } from '@/components/workspace/WorkspaceShell';

export const metadata: Metadata = {
  title: 'Ledrix Inspect',
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceRoot>{children}</WorkspaceRoot>;
}
