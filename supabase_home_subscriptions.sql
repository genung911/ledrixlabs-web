-- ─── home_subscriptions ──────────────────────────────────────────────────────
-- The homeowner's premium entitlement. One row per signed-in Supabase user; the
-- Stripe webhook (service role) is the ONLY writer. The signed-in user may read
-- their own row to know whether their premium features (Ledrix analysis, photo
-- analysis, chat, the living maintenance record) are unlocked. Run once. Idempotent.

create table if not exists home_subscriptions (
  user_id                text primary key,   -- Supabase auth uid
  email                  text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',  -- active | trialing | past_due | canceled | inactive
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists idx_home_subscriptions_sub on home_subscriptions(stripe_subscription_id);

alter table home_subscriptions enable row level security;

-- Read-your-own-row for the authenticated user (to reflect entitlement in the UI).
-- All writes are server-side only (the webhook uses the service-role key, which bypasses RLS).
drop policy if exists home_subscriptions_own_read on home_subscriptions;
create policy home_subscriptions_own_read on home_subscriptions
  for select to authenticated using (auth.uid()::text = user_id);
