-- ─── ROLLBACK for supabase_portal_links.sql ────────────────────────────────────────────
-- Drops portal_links. Effects, all immediate:
--   · every minted view-only and repairs link stops working (they exist only in this table);
--   · every REVOKED original link starts working again — check first:
--       select share_id, revoked_at, revoked_reason from portal_links where scope = 'edit' and revoked_at is not null;
--   · replacement edit links issued by staff stop working.
-- The code keeps running: it reads a missing table as "no minted links, nothing revoked", and the
-- portal's Share buttons show an error instead of sharing (they never fall back to the edit link).
-- NOT APPLIED.
begin;
drop table if exists portal_links;
commit;
notify pgrst, 'reload schema';
-- Verify: select to_regclass('public.portal_links');   -- null
