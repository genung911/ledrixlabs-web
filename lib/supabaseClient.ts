// Browser Supabase client for magic-link auth on the Home App.
// Uses the public anon key (already set in Vercel for the proxy).
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
