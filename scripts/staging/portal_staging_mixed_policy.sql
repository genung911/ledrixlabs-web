-- ─── STAGING ONLY — the bucket migration must REFUSE a policy shared with another bucket ──
--
-- (Homeowner security pass 4, 2026-10-20.) supabase_home_documents_private.sql drops storage
-- policies that name home-documents ALONE, and aborts (changing nothing) when a policy also names
-- another bucket. This proves the abort on real Postgres. Run in the STAGING project, in order:
--
--   1. This file, PART A (creates the shared policy).
--   2. supabase_home_documents_private.sql, APPLY block.
--      Expect: ERROR  Policy "stg shared docs+pdfs read" on storage.objects names home-documents
--              together with something else (…). Not dropped; split it by hand, then re-run.
--   3. portal_staging_checks.sql S1 — expect EXACTLY the pre-migration state (bucket still public,
--      limits NULL, both policies present): the whole transaction rolled back.
--   4. This file, PART B (removes the shared policy). Then continue with the normal apply.

-- PART A
create policy "stg shared docs+pdfs read" on storage.objects for select to anon
  using (bucket_id = 'home-documents' or bucket_id = 'inspection-pdfs');

-- PART B (run after step 3)
-- drop policy if exists "stg shared docs+pdfs read" on storage.objects;
