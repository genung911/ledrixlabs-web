// Ledrix billing — the browser side. The plan's state comes from the server's company_plan_state() (SQL #158) as the
// signed-in person; anything that touches Stripe goes through /api/billing/* with their token. Nothing here can mark a
// plan paid — only Stripe's signed webhook does.
import { workspace } from '@/lib/workspace/client';
import { planError, type PlanState } from './model';

export async function loadPlanState(): Promise<PlanState | null> {
  const { data, error } = await workspace.rpc('company_plan_state');
  if (error) { if (/company_plan_state/.test(error.message)) return null; throw new Error(error.message); }   // before #158
  return (data as PlanState) ?? null;
}

export async function redeemInviteCode(code: string): Promise<PlanState> {
  const { data, error } = await workspace.rpc('redeem_plan_invite_code', { p_code: code });
  if (error) throw new Error(planError(error.message));
  return data as PlanState;
}

async function post<T>(path: string): Promise<T> {
  const { data } = await workspace.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  const r = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Billing could not be reached. Try again.');
  return j as T;
}

export type BillingStatus = {
  configured: boolean; subscribed?: boolean; seats?: number; synced?: boolean; cancelAtPeriodEnd?: boolean;
  payment?: string | null; next?: { amount: number; date: number } | null; problem?: string;
};
export const loadBillingStatus = () => post<BillingStatus>('/api/billing/status');
export const startCheckout = async () => { const { url } = await post<{ url: string }>('/api/billing/checkout'); window.location.assign(url); };
export const openPortal = async () => { const { url } = await post<{ url: string }>('/api/billing/portal'); window.location.assign(url); };
