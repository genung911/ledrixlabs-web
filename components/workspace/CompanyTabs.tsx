'use client';

// Company's tabs (owner 2026-11-05, "Use recommendations"): Profile · Team · Services & prices · Payments under ONE menu
// item. The routes are the ones each page always had (/app/company, /app/team, /app/company/services,
// /app/company/payments), so every old link still opens the same page. Each tab keeps the gate its menu item had — a
// tab the person can't open is not shown; the pages themselves still refuse, and the server decides every write.
// Same look as the CRM's tab bar (components/crm/CrmApp.tsx CrmTabBar).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader } from '@/components/workspace/ui';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { mayManagePayments } from '@/lib/office/access';

export function CompanyTabs({ subtitle }: { subtitle?: string }) {
  const { access, companyName, canServices } = useWorkspace();
  const pathname = usePathname() ?? '';
  const tabs = [
    { href: '/app/company', label: 'Profile', show: true },
    { href: '/app/team', label: 'Team', show: !!access.companyId },
    { href: '/app/company/services', label: 'Services & prices', show: canServices },
    { href: '/app/company/payments', label: 'Payments', show: mayManagePayments({ companyId: access.companyId, role: access.role }) },
  ].filter(t => t.show);
  return (<>
    <PageHeader title="Company" subtitle={subtitle ?? companyName ?? 'Your company'} />
    <nav aria-label="Company" className="mb-5 flex gap-1 overflow-x-auto border-b border-hairline">
      {tabs.map(t => {
        const on = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            className={`-mb-px flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm ${on ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  </>);
}
