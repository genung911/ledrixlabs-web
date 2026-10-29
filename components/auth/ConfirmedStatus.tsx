'use client';
import { useEffect, useState } from 'react';

type Outcome = 'checking' | 'confirmed' | 'expired' | 'error' | 'none';

/** Reads the confirmation outcome Supabase put in the address (#… or ?…) and says it plainly. */
export function ConfirmedStatus() {
  const [outcome, setOutcome] = useState<Outcome>('checking');
  const [detail, setDetail] = useState('');
  useEffect(() => {
    const p = new URLSearchParams((window.location.hash || '').replace(/^#/, '') + '&' + window.location.search.replace(/^\?/, ''));
    const code = p.get('error_code') ?? '', desc = p.get('error_description') ?? '';
    if (code || p.get('error')) { setOutcome(/expired|otp/i.test(code + desc) ? 'expired' : 'error'); setDetail(desc.replace(/\+/g, ' ')); }
    else if (p.get('access_token') || p.get('type') === 'signup' || p.get('code')) setOutcome('confirmed');
    else setOutcome('none');
    // The address holds a session token — never leave it in the history or a shared link.
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  if (outcome === 'checking') return <p className="text-sm text-gray-500">Checking…</p>;
  if (outcome === 'confirmed' || outcome === 'none') return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Email confirmed</h1>
      <p className="mt-3 text-gray-600">You’re all set. Go back to the <b>Ledrix</b> app on your phone and sign in.</p>
    </div>
  );
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{outcome === 'expired' ? 'This link has expired' : 'This link didn’t work'}</h1>
      <p className="mt-3 text-gray-600">
        {outcome === 'expired'
          ? 'It may have been used already, or a newer email replaced it. Open the newest confirmation email from Ledrix and tap its link.'
          : 'Open the newest confirmation email from Ledrix and tap its link.'}
      </p>
      {detail && <p className="mt-3 text-xs text-gray-400">{detail}</p>}
      <p className="mt-5 text-sm text-gray-600">Still stuck? Email <a className="font-semibold text-gray-900 underline" href="mailto:kelly@ledrixlabs.com">kelly@ledrixlabs.com</a>.</p>
    </div>
  );
}
