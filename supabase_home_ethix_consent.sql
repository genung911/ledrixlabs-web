-- ─── home_ethix_consent ──────────────────────────────────────────────────────
-- Ethix opt-in: the homeowner's own, revocable choice to share anonymized, aggregate,
-- NON-personal signals about their home (and, Phase 3, be paid for it). One row per
-- signed-in Supabase user. The server (service role, /api/ethix) is the ONLY writer —
-- a legal consent record must be tamper-proof, so unlike the share-scoped tables it is
-- NOT writable via the anon proxy. The user may read their OWN row to reflect their
-- choice in the UI. Mirrors home_subscriptions. Run once. Idempotent.

create table if not exists home_ethix_consent (
  user_id          text primary key,   -- Supabase auth uid
  email            text,
  opted_in         boolean not null default false,
  categories       jsonb   not null default '[]'::jsonb,   -- chosen category keys (see lib/ethix.ts)
  consent_version  text,
  earned_cents     integer not null default 0,             -- stays 0 in Phase 1 (nothing sold yet)
  updated_at       timestamptz not null default now()
);

alter table home_ethix_consent enable row level security;

-- Read-your-own-row only. All writes are server-side via the service-role key (bypasses RLS),
-- so no holder of a share link can flip someone's consent.
drop policy if exists home_ethix_consent_own_read on home_ethix_consent;
create policy home_ethix_consent_own_read on home_ethix_consent
  for select to authenticated using (auth.uid()::text = user_id);
