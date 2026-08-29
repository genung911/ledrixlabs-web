-- ─── Close the anon door on the portal's seven tables ───────────────────────────────
--
-- Ledrix security fix, 2026-08-29. Companion to app/api/portal/route.ts.
--
-- ── WHAT WAS OPEN ───────────────────────────────────────────────────────────────────
-- These tables carried `for all to anon using (true) with check (true)`. The anon key ships in
-- the app and on the website, so anyone could read, insert, update and DELETE every home's portal
-- data. Verified against production 2026-08-29: 75 reminders across 13 homes and 32 projects
-- across 3 were world-readable, and a no-match DELETE returned 204 — deletion was permitted too.
-- `share_id` is a column in these tables, so the token itself could be harvested and used to load
-- any homeowner's portal — a side door around the /api/share/<token> lockdown.
--
-- ── WHAT REPLACES IT ────────────────────────────────────────────────────────────────
-- Every portal read and write now goes through /api/portal, which holds the SERVICE ROLE
-- server-side, resolves the share token to a share_id, and confines the operation to that one
-- share. The service role bypasses RLS, so once the client no longer touches these tables
-- directly, anon needs no policy at all — and must have none, or the door is still open.
--
-- ── SAFE TO RUN ONLY AFTER THE NEW CODE IS DEPLOYED ─────────────────────────────────
-- Order matters. Deploy the Vercel build that routes through /api/portal FIRST; a portal running
-- the old anon path against these revoked tables would silently read and write nothing. Once the
-- new build is live, run this. It is idempotent and touches no data.

do $$
declare t text;
begin
  foreach t in array array[
    'home_reminders', 'home_projects', 'home_repairs',
    'home_documents', 'home_maintenance_log', 'home_reports', 'floor_plans'
  ] loop
    -- Drop the permissive policies by name where they exist, and belt-and-braces revoke the grant.
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format('drop policy if exists %I on %I', t || '_anon_select', t);
    execute format('drop policy if exists %I on %I', t || '_anon_rw', t);
    -- RLS stays ON. With no policy naming anon, anon can do nothing; the service role bypasses RLS
    -- and is unaffected. authenticated is left alone in case a future signed-in path wants it.
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ── VERIFY AFTER RUNNING ────────────────────────────────────────────────────────────
-- With the anon key, each of these should now return `permission denied` rather than rows:
--   select * from home_reminders limit 1;
--   select * from home_projects  limit 1;
--   select * from home_reports   limit 1;
-- And the portal, loaded with a valid token, should still show everything — it reads through
-- /api/portal, not through anon.
--
-- ── ROLLBACK (emergency only — this REOPENS the hole) ───────────────────────────────
-- Only if the new code has to be reverted. Do NOT leave this in place.
--   -- create policy home_reminders_anon_all on home_reminders for all to anon using (true) with check (true);
--   -- ...repeat per table...
