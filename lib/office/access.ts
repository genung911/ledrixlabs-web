// Who sees the office pages (owner 2026-11-05, office pages mockup — "use all recommendations"). PURE. The server
// decides every write (row-level security, #115's checks); these only hide a page or a button that would be refused.
//   ruling 1 — start a job: the people the server lets add inspections (`add_inspections`), or an account with no company;
//   ruling 3 — Services & prices and the booking page: the owner, an admin, or someone given "company settings";
//   ruling 4 — Payments (Stripe): the OWNER only (or an account with no company, which is its own owner).
export type OfficeAccess = { companyId: string | null; role: string | null };
export type OfficeCaps = Partial<Record<'add_inspections' | 'company_settings' | 'crm' | 'invoices', boolean>> | null;

export const mayStartJobs = (a: OfficeAccess, caps: OfficeCaps) => !a.companyId || caps?.add_inspections === true;
export const mayEditServices = (a: OfficeAccess, caps: OfficeCaps) =>
  !a.companyId || a.role === 'owner' || a.role === 'admin' || a.role === 'ledrix_admin' || caps?.company_settings === true;
export const mayManagePayments = (a: OfficeAccess) => !a.companyId || a.role === 'owner' || a.role === 'ledrix_admin';
