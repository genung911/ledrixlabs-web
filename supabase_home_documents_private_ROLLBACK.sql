-- ─── ROLLBACK for supabase_home_documents_private.sql — EMERGENCY ONLY ─────────────────
--
-- Re-opens public links to every homeowner document. Use only if the web build containing the
-- token-scoped /api/docs has to be reverted to the old build that links /object/public/… URLs.
-- Storage policies dropped by the apply step are NOT recreated: their definitions were whatever
-- the pre-check printed — recreate from that output if they were legitimate. NOT APPLIED.

begin;
update storage.buckets set public = true where id = 'home-documents';
-- The old build's portal read home_documents through /api/portal (service role), so the table grants
-- need no restoring. If the pre-check showed grants for anon/authenticated, re-grant them by hand.
-- Restore the two limits to what the apply step's PRE-CHECK printed (NULL = no limit):
-- update storage.buckets set file_size_limit = <pre-check value>, allowed_mime_types = <pre-check value>
--  where id = 'home-documents';
commit;

-- Verify:
-- select id, public from storage.buckets where id = 'home-documents';   -- public = true
