// Browser Supabase client for magic-link auth on the Home App.
// Uses the public anon key (already set in Vercel for the proxy).
import { createClient } from '@supabase/supabase-js';

// The env var may have been copied WITH a trailing /rest/v1 (the proxy strips it
// too). The auth client needs the BASE project URL, or signInWithOtp posts to
// .../rest/v1/auth/v1/otp → "invalid path specified in request url".
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export const supabase = createClient(
  SUPA_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
