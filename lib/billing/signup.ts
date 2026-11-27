// Start your free trial (b7; plan mockup 13QNuHGzRGv2t2GdyextR4 screen 2, "Approved") — the ONE place the website
// creates an account. verify-billing checks no other file under app/, components/ or lib/ calls signUp.
// The account is Supabase Auth email + password, the same accounts the app makes; the company is create_my_company,
// the same call the app makes (SQL #158's trigger starts the 14-day trial on it).
import { workspace } from '@/lib/workspace/client';

export type Pending = { company: string; code: string | null; fullName: string };

export async function signUpForTrial(email: string, password: string, p: Pending): Promise<{ signedIn: boolean }> {
  const { data, error } = await workspace.auth.signUp({
    email: email.trim(), password,
    options: { data: { full_name: p.fullName.trim(), pending_company: p.company.trim(), pending_code: p.code }, emailRedirectTo: `${window.location.origin}/app/start` },
  });
  if (error) throw new Error(/registered|exists/i.test(error.message) ? 'That email already has a Ledrix account. Sign in instead.' : error.message);
  return { signedIn: !!data.session };
}

/** The 6-digit code from the confirmation email (the workspace never takes a session from a link: detectSessionInUrl
 *  is off on purpose, so the code is how a new account signs in here). Works on any device. */
export async function verifySignupCode(email: string, code: string): Promise<void> {
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) throw new Error('The code is the 6 digits in the email.');
  const { error } = await workspace.auth.verifyOtp({ email: email.trim(), token, type: 'signup' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code didn’t work or has expired. Check the newest email, or resend it.' : error.message);
}

export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await workspace.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/app/start` } });
  if (error) throw new Error(error.message);
}

const PENDING_EMAIL = 'ledrix-start-email';
export const rememberEmail = (e: string) => { try { localStorage.setItem(PENDING_EMAIL, e.trim()); } catch { /* private window */ } };
export const rememberedEmail = () => { try { return localStorage.getItem(PENDING_EMAIL) ?? ''; } catch { return ''; } };
export const forgetEmail = () => { try { localStorage.removeItem(PENDING_EMAIL); } catch { /* */ } };

/** The signed-in person's company, if they have one yet. */
export async function myCompanyId(): Promise<{ userId: string | null; companyId: string | null; pending: Pending | null }> {
  const { data } = await workspace.auth.getSession();
  const user = data.session?.user;
  if (!user) return { userId: null, companyId: null, pending: null };
  const { data: prof } = await workspace.from('inspector_profiles').select('company_id').eq('id', user.id).maybeSingle();
  const m = user.user_metadata ?? {};
  return { userId: user.id, companyId: prof?.company_id ?? null,
    pending: m.pending_company ? { company: String(m.pending_company), code: m.pending_code ? String(m.pending_code) : null, fullName: String(m.full_name ?? '') } : null };
}

export async function createCompany(userId: string, name: string, fullName: string): Promise<void> {
  const { error } = await workspace.rpc('create_my_company', { p_name: name.trim() });
  if (error) throw new Error(error.message);
  if (fullName.trim()) await workspace.from('inspector_profiles').update({ full_name: fullName.trim() }).eq('id', userId);
}

export async function clearPending(): Promise<void> {
  await workspace.auth.updateUser({ data: { pending_company: null, pending_code: null } }).catch(() => null);
}
