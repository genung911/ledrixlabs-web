'use client';
// "+ New inspection" — shown to the people the server lets add inspections (owner 2026-11-05, ruling 1; lib/office/access).
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { loadMyCapabilities } from '@/lib/team/permissions';
import { mayStartJobs } from '@/lib/office/access';

export function NewInspectionButton() {
  const { access } = useWorkspace();
  const [show, setShow] = useState(false);
  useEffect(() => {
    loadMyCapabilities().then(c => setShow(mayStartJobs({ companyId: access.companyId, role: access.role }, c as any))).catch(() => setShow(false));
  }, [access.companyId, access.role]);
  if (!show) return null;
  return <Link href="/app/inspections/new" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85">+ New inspection</Link>;
}
