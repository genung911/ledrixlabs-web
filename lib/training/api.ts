// Help train Ledrix Intelligence — the company's opt-in (owner 2026-11-10; SQL #120). The website's one write for it,
// kept out of the read-only workspace like every other write (lib/conflicts/api.ts): it asks the server's
// set_company_training (owner only; who and when are the server's) and never writes the columns itself.
import { workspace } from '@/lib/workspace/client';

export async function setCompanyTraining(companyId: string, on: boolean): Promise<{ error: string | null }> {
  const { error } = await workspace.rpc('set_company_training', { p_company: companyId, p_on: on });
  return { error: error ? error.message : null };
}
