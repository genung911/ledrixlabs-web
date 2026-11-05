// /app/contacts moved under the CRM (owner 2026-11-05, CRM home mockup): an old link or bookmark lands on CRM › Contacts.
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/app/crm/contacts');
}
