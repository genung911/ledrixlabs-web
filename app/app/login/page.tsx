'use client';

// Inspector sign-in — the existing Supabase Auth email + password accounts (the same call the
// Ledrix Inspect app makes in AuthService.signIn). Sign-in ONLY: no sign-up and no magic link here,
// so this page adds no new way to create an account.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LedrixDelta } from '@/components/LedrixDelta';
import { workspace } from '@/lib/workspace/client';
import { safeNext } from '@/lib/workspace/nav';

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params?.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workspace.auth.getSession().then(({ data }) => { if (data.session) router.replace(next); });
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await workspace.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(/invalid login/i.test(err.message) ? 'That email and password don’t match a Ledrix account.' : 'Sign-in failed. Check your connection and try again.');
      return;
    }
    router.replace(next);
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <a href="/inspect" className="flex items-center gap-2.5">
          <LedrixDelta size={22} className="text-ink" />
          <span className="text-base font-bold tracking-tight text-ink">Ledrix</span>
        </a>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-10 sm:pt-20">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-7 shadow-sm" noValidate>
          <h1 className="text-xl font-bold tracking-tight text-ink">Sign in to Ledrix Inspect</h1>
          <p className="mt-1.5 text-sm text-body">Use the account you sign in with in the Ledrix app.</p>

          {/* Website Apple pass (2026-11-23): the fields as one group with sentence-case labels, as on the phone's sign-in. */}
          <div className="mt-6 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            <label htmlFor="email" className="flex items-center gap-3 px-3 py-1">
              <span className="w-20 shrink-0 text-sm text-ink">Email</span>
              <input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none" />
            </label>
            <label htmlFor="password" className="flex items-center gap-3 px-3 py-1">
              <span className="w-20 shrink-0 text-sm text-ink">Password</span>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Required" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none" />
            </label>
          </div>

          {error && <p role="alert" className="mt-4 rounded-lg bg-safety/10 px-3 py-2 text-sm text-ink">{error}</p>}

          <button type="submit" disabled={busy || !email.trim() || !password}
            className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-5 text-xs leading-relaxed text-muted">
            No account yet? Ledrix accounts are created in the app or by invitation from your company.{' '}
            <a href="/inspect#pricing" className="font-semibold text-body hover:text-ink">How to start</a>
          </p>
        </form>
      </main>
    </div>
  );
}
