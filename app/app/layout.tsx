import type { Metadata } from 'next';
import { WorkspaceRoot } from '@/components/workspace/WorkspaceShell';
import { THEME_BOOT_SCRIPT } from '@/lib/workspace/theme';

export const metadata: Metadata = {
  title: 'Ledrix Inspect',
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Applies the saved Light / Dark / Auto choice before hydration, so dark never flashes light. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <WorkspaceRoot>{children}</WorkspaceRoot>
    </>
  );
}
