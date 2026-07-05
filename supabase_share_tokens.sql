-- ─────────────────────────────────────────────────────────────────────────────
-- supabase_share_tokens.sql — UNGUESSABLE CLIENT-PORTAL SHARE LINKS (Security #1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: the public Home Portal at ledrixlabs.com/share/<id> was keyed on
-- `home_records.share_id`, which is the inspection id (`insp_<timestamp>`). That
-- value is time-ordered and effectively enumerable — a bad actor could walk the
-- timestamp space and pull real clients' inspection data.
--
-- Fix: add an unguessable, high-entropy `share_token` (128 bits, hex). The app
-- mints one when it publishes a record and hands THAT out as the share link. The
-- portal resolves a record by `share_token` first, then falls back to `share_id`
-- so every previously-issued `insp_…` link (and the marketing sample) keeps
-- working. `share_id` is retained unchanged as the canonical key for all child
-- tables (home_projects / home_reminders / home_repairs / home_maintenance_log).
--
-- SAFE TO RUN ANYTIME. Idempotent. Run this in the Supabase SQL editor BEFORE (or
-- alongside) shipping the app build that writes share_token — until it exists the
-- app degrades gracefully and keeps handing out the legacy id link.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Column (nullable so the add never blocks; backfilled below).
ALTER TABLE public.home_records
  ADD COLUMN IF NOT EXISTS share_token text;

-- 2) Backfill every existing row with a random 128-bit token (32 hex chars).
--    gen_random_bytes() comes from pgcrypto (enabled by default on Supabase).
UPDATE public.home_records
  SET share_token = encode(gen_random_bytes(16), 'hex')
  WHERE share_token IS NULL;

-- 3) Uniqueness — a token must resolve to exactly one record. Partial index so
--    any legacy NULLs (before backfill) don't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS home_records_share_token_key
  ON public.home_records (share_token)
  WHERE share_token IS NOT NULL;

COMMENT ON COLUMN public.home_records.share_token IS
  'Unguessable 128-bit share slug for the public /share/<token> portal link. '
  'Minted by the app on publish; stable across re-finalize. Portal resolves by '
  'share_token first, then falls back to share_id for legacy links.';
