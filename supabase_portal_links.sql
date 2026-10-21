-- ─── portal_links: view-only and repairs-only links, and link revocation ──────────────────
--
-- Homeowner security pass 2, 2026-10-19. Companion to lib/shareAccess.ts (resolvePortalToken),
-- app/api/portal-links/route.ts and lib/portalPolicy.ts (scopeAllows). NOT APPLIED — review, then
-- run by hand.
--
-- ── WHAT IT HOLDS ──────────────────────────────────────────────────────────────────────
-- One row per link that is NOT the original home_records.share_token:
--   scope 'read'     view-only, minted from an edit link (portal "Share")
--   scope 'repairs'  the repair request only (portal "Share link" on Repairs)
--   scope 'edit'     staff use only: a REVOCATION of an original share_token (revoked_at set), or
--                    a replacement edit link issued to a homeowner
-- Only the SHA-256 of a token is stored. A row whose hash matches a token decides that token
-- before home_records is consulted, so a revoked original link stops working without touching
-- home_records — the inspector's record, which the app re-syncs (and re-sends the same token).
--
-- ── ORDER ──────────────────────────────────────────────────────────────────────────────
-- Code first or SQL first both work. Before this runs, PostgREST answers 404 for portal_links,
-- which the code reads as "no minted links, nothing revoked" — today's behaviour exactly. After
-- it runs, the portal's Share mints view-only links and repair links start working.
--
-- ── PRE-CHECK (read-only) ──────────────────────────────────────────────────────────────
-- select to_regclass('public.portal_links');                       -- expect null
-- select extname from pg_extension where extname = 'pgcrypto';     -- needed for the staff runbook

begin;

create table if not exists portal_links (
  id             uuid primary key default gen_random_uuid(),
  share_id       text not null,
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scope          text not null check (scope in ('edit', 'read', 'repairs')),
  created_via    text not null default 'portal' check (created_via in ('portal', 'staff')),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_reason text,
  -- A link minted from the portal can never carry edit.
  check (created_via = 'staff' or scope in ('read', 'repairs'))
);

create index if not exists idx_portal_links_share on portal_links (share_id, created_at desc);

-- Service role only (the website's routes). No client role may read hashes or mint links.
alter table portal_links enable row level security;
revoke all on portal_links from anon, authenticated;
-- The routes are service_role, and they look up, mint and revoke (select, insert, update). Granted
-- explicitly: on a project whose default privileges give new tables nothing (found 2026-10-20 on a
-- new Supabase project), the lookup would be refused, and lib/shareAccess.ts fails closed on any
-- refusal other than 404, so EVERY portal link would stop working. A no-op where already granted.
grant select, insert, update on portal_links to service_role;

commit;
-- Make PostgREST see the new table now (Supabase usually reloads on DDL; this is harmless if so).
notify pgrst, 'reload schema';

-- ── POST-CHECK (read-only) — every status must be 'ok' ─────────────────────────────────
-- select 'table exists' as check, case when to_regclass('public.portal_links') is not null then 'ok' else 'MISSING' end
-- union all
-- select 'rls on', case when relrowsecurity then 'ok' else 'OPEN' end from pg_class where oid = 'public.portal_links'::regclass
-- union all
-- select 'no client grants', case when count(*) = 0 then 'ok' else 'OPEN' end
--   from information_schema.role_table_grants where table_name = 'portal_links' and grantee in ('anon', 'authenticated')
-- union all
-- select 'service_role can look up, mint, revoke',
--        case when has_table_privilege('service_role', 'public.portal_links', 'select')
--              and has_table_privilege('service_role', 'public.portal_links', 'insert')
--              and has_table_privilege('service_role', 'public.portal_links', 'update')
--             then 'ok' else 'MISSING' end;
-- Then: open a portal with its original link → Share → the shared URL is a different /share/<token>
-- that shows the "View-only link" banner; Repairs → Share link opens /share/<token>/repairs.
--
-- ── STAFF RUNBOOK (run by hand, one home at a time) ───────────────────────────────────
-- Revoke a homeowner's ORIGINAL link (homeowner removal / leaked link). Note: the same token is the
-- QR code printed in the delivered PDF — revoking it also stops that QR working. The inspector's
-- own access (the app, signed in) is unaffected.
--   insert into portal_links (share_id, token_hash, scope, created_via, revoked_at, revoked_reason)
--   select share_id, encode(extensions.digest(share_token, 'sha256'), 'hex'), 'edit', 'staff', now(), '<reason>'
--     from home_records where share_id = '<insp_…>' and share_token is not null
--   on conflict (token_hash) do update set revoked_at = now(), revoked_reason = excluded.revoked_reason;
--
-- Issue a REPLACEMENT edit link (returns the new token once — send it to the homeowner, keep no copy):
--   with t as (select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=') as tok)
--   insert into portal_links (share_id, token_hash, scope, created_via)
--   select '<insp_…>', encode(extensions.digest(tok, 'sha256'), 'hex'), 'edit', 'staff' from t
--   returning (select tok from t) as new_token;
--
-- Revoke every minted link for a home:
--   update portal_links set revoked_at = now(), revoked_reason = '<reason>'
--    where share_id = '<insp_…>' and revoked_at is null;
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────────────────
-- supabase_portal_links_ROLLBACK.sql
