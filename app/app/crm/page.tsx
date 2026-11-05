// CRM home — see components/crm/CrmApp.tsx (owner 2026-11-05: "when clicked from menu, it should open a CRM page similar
// to Salesforce home page"; CRM home mockup approved, "use recommendations").
import { CrmApp } from '@/components/crm/CrmApp';

export default function Page() {
  return <CrmApp tab="home" />;
}
