// Inspector workspace Supabase client (/app). The SAME Supabase Auth accounts the Ledrix Inspect
// app signs in with (email + password, AuthService.signIn) — no second identity system.
//
// Deliberately a SEPARATE client from lib/supabaseClient.ts (the homeowner magic-link client):
//   * its own storageKey, so an inspector's session never appears as a "homeowner" session on
//     /share/[id] (Ask Ledrix, Ethix, checkout all trust that client's session), and vice versa;
//   * detectSessionInUrl off — the workspace never takes a session from a URL fragment.
//
// Every read runs as the signed-in user under the existing row-level security
// (can_read_inspection / can_write_inspection / company_members). The browser never holds the
// service-role key; authorization is the database's, not this UI's.
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

export const WORKSPACE_STORAGE_KEY = 'ledrix-inspector-session';

export const workspace = createClient(
  SUPA_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: WORKSPACE_STORAGE_KEY,
    },
  },
);

export const EVIDENCE_BUCKET = 'inspection-evidence';
