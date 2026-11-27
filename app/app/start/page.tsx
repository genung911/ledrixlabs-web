'use client';

// Start your free trial (b7; plan mockup 13QNuHGzRGv2t2GdyextR4 screen 2, "Approved"): the website's sign-up. An account
// (Supabase Auth email + password, the same accounts the app makes), then the company (create_my_company — the same
// call the app makes; #158's trigger starts the 14-day trial), then an optional early-adopter code (redeem_plan_invite_code,
// owner only, once). No card here: paying is on Plan & billing, through Stripe.
//
// If the project asks people to confirm their email, the account is made first and the company when they come back
// signed in; what they typed rides the account's metadata until then, so nothing is asked twice.
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LedrixDelta } from '@/components/LedrixDelta';
import { redeemInviteCode } from '@/lib/billing/api';
import { clearPending, createCompany, myCompanyId, signUpForTrial } from '@/lib/billing/signup';
import { cleanInviteCode, planError } from '@/lib/billing/model';

const ROW = 'flex items-center gap-3 px-3 py-1';
const LABEL = 'w-28 shrink-0 text-sm text-ink';
const INPUT = 'min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none';

export default function StartPage() { return <Suspense><Start /></Suspense>; }

type Step = { kind: 'loading' } | { kind: 'form'; signedIn: boolean } | { kind: 'check-email'; email: string } | { kind: 'working' };

function Start() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  /** Signed in: make the company (if none yet), apply the code, and go to Plan & billing. */
  const finish = useCallback(async (companyName: string, rawCode: string, fullName: string) => {
    setStep({ kind: 'working' }); setErr(null);
    const me = await myCompanyId();
    if (!me.userId) { setStep({ kind: 'form', signedIn: false }); return; }
    if (!me.companyId) {
      try { await createCompany(me.userId, companyName, fullName); }
      catch (e) { setErr((e as Error).message); setStep({ kind: 'form', signedIn: true }); return; }
      const c = cleanInviteCode(rawCode);
      if (c) { try { await redeemInviteCode(c); } catch (e) { await clearPending(); router.replace(`/app/company/plan?code_error=${encodeURIComponent((e as Error).message)}`); return; } }
    }
    await clearPending();
    router.replace('/app/company/plan');
  }, [router]);

  useEffect(() => {
    (async () => {
      const me = await myCompanyId();
      if (!me.userId) { setStep({ kind: 'form', signedIn: false }); return; }
      if (me.companyId) { router.replace('/app'); return; }
      if (me.pending) { void finish(me.pending.company, me.pending.code ?? '', me.pending.fullName); return; }
      setStep({ kind: 'form', signedIn: true });
    })();
  }, [finish, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (!company.trim()) { setErr('Your company needs a name.'); return; }
    if (code.trim() && !cleanInviteCode(code)) { setErr('An invite code is 6–32 letters, numbers or dashes.'); return; }
    if (step.kind === 'form' && step.signedIn) { void finish(company, code, name); return; }
    if (password.length < 8) { setErr('Use a password of at least 8 characters.'); return; }
    setStep({ kind: 'working' });
    try {
      const r = await signUpForTrial(email, password, { company, code: cleanInviteCode(code), fullName: name });
      if (r.signedIn) { void finish(company, code, name); return; }
    } catch (e) { setErr((e as Error).message); setStep({ kind: 'form', signedIn: false }); return; }
    setStep({ kind: 'check-email', email: email.trim() });
  }

  const signedIn = step.kind === 'form' && step.signedIn;
  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <a href="/inspect" className="flex items-center gap-2.5"><LedrixDelta size={22} className="text-ink" /><span className="text-base font-bold tracking-tight text-ink">Ledrix</span></a>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-10 sm:pt-16">
        {step.kind === 'loading' || step.kind === 'working' ? (
          <p className="text-sm text-muted">{step.kind === 'working' ? 'Setting up your company…' : 'Loading…'}</p>
        ) : step.kind === 'check-email' ? (
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-7 shadow-sm">
            <h1 className="text-xl font-bold tracking-tight text-ink">Check your email</h1>
            <p className="mt-2 text-sm text-body">We sent a confirmation link to <b className="text-ink">{step.email}</b>. Open it on this computer and your company is set up, with your 14-day trial started.</p>
            <p className="mt-4 text-xs text-muted">Nothing there? Check spam, or wait a minute.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-7 shadow-sm" noValidate>
            <h1 className="text-xl font-bold tracking-tight text-ink">Start your free trial</h1>
            <p className="mt-1.5 text-sm text-body">14 days, everything on, no card.</p>
            <div className="mt-6 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
              <label className={ROW}><span className={LABEL}>Company name</span><input className={INPUT} required autoFocus value={company} onChange={e => setCompany(e.target.value)} placeholder="Required" /></label>
              {!signedIn && <>
                <label className={ROW}><span className={LABEL}>Your name</span><input className={INPUT} autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Optional" /></label>
                <label className={ROW}><span className={LABEL}>Email</span><input className={INPUT} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
                <label className={ROW}><span className={LABEL}>Password</span><input className={INPUT} type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 or more characters" /></label>
              </>}
              <label className={ROW}><span className={LABEL}>Invite code</span><input className={INPUT} value={code} onChange={e => setCode(e.target.value)} placeholder="Optional" /></label>
            </div>
            {cleanInviteCode(code) && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-ink"><b>Early-adopter code.</b> Free for 60 days, then $79 per inspector for as long as you stay.</p>}
            {err && <p role="alert" className="mt-4 rounded-lg bg-safety/10 px-3 py-2 text-sm text-ink">{planError(err)}</p>}
            <button type="submit" disabled={!company.trim() || (!signedIn && (!email.trim() || !password))}
              className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted">
              Create my company
            </button>
            <p className="mt-4 text-xs leading-relaxed text-muted">Then download Ledrix Inspect on your iPhone and sign in with the same email.{' '}
              {!signedIn && <>Already have an account? <a href="/app/login?next=/app/start" className="font-semibold text-body hover:text-ink">Sign in</a></>}</p>
          </form>
        )}
      </main>
    </div>
  );
}
