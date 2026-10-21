-- ─── home-documents: private bucket, no client storage access ─────────────────────────
--
-- Homeowner security pass, 2026-10-19. Companion to app/api/docs/route.ts (token-scoped upload,
-- signed retrieval, delete) and lib/portalPolicy.ts. NOT APPLIED — review, then run by hand.
--
-- ── WHY ────────────────────────────────────────────────────────────────────────────────
-- supabase_home_documents.sql told the owner to create `home-documents` as a PUBLIC bucket, and
-- /api/docs returned `/object/public/…` links. The ledger (ledrix-app SUPABASE_LEDGER.md, #37)
-- records the bucket as already private; this file makes that true and checkable rather than
-- assumed, and makes sure no storage policy lets anon/authenticated clients read or write it
-- directly. All legitimate access is the service role inside /api/docs, which bypasses RLS.
--
-- ── ORDER ──────────────────────────────────────────────────────────────────────────────
-- 1. Deploy the web build containing the new /api/docs FIRST. If the bucket is public and the
--    old build is still live, its public links keep working until this runs; after this runs,
--    only the new route can open documents (old public links stop working — intended).
-- 2. Run the PRE-CHECK below and keep its output.
-- 3. Run the APPLY block.
-- 4. Run the POST-CHECK. Every row must read ok.
--
-- Touches no rows in home_documents and no stored objects.

-- ── PRE-CHECK (read-only) ─────────────────────────────────────────────────────────────
-- KEEP THIS OUTPUT — the rollback restores the two limits from it.
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'home-documents';
-- select policyname, roles, cmd, qual, with_check from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and (coalesce(qual,'') ilike '%home-documents%' or coalesce(with_check,'') ilike '%home-documents%');
-- select count(*) as rows_total, count(path) as rows_with_file,
--        count(*) filter (where url ilike '%/object/public/home-documents/%') as rows_with_public_url
--   from home_documents;
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'home_documents' and grantee in ('anon', 'authenticated');

-- ── APPLY ──────────────────────────────────────────────────────────────────────────────
begin;

-- Private, and the same size and type limits /api/docs enforces (lib/homeDocuments.ts). Uploads now
-- go from the browser straight to storage on a signed URL, so the bucket itself must refuse an
-- oversized or wrong-type file; /api/docs 'complete' re-checks and deletes anything that slips by.
update storage.buckets
   set public = false,
       file_size_limit = 20971520,
       allowed_mime_types = array[
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'image/gif', 'text/plain', 'text/csv', 'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 where id = 'home-documents';
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'home-documents') then
    raise exception 'Bucket home-documents does not exist — nothing to secure; check the bucket id first.';
  end if;
end $$;

-- Drop any dashboard-created policy that names this bucket — but ONLY a policy about this bucket
-- alone. A policy whose expression also names another bucket (inspection-pdfs,
-- inspection-evidence, or anything else) guards other features: dropping it would remove their
-- access too, so the whole transaction is aborted instead and the policy must be split by hand.
do $$
declare p record;
begin
  for p in
    select policyname, coalesce(qual,'') || ' ' || coalesce(with_check,'') as expr from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual,'') ilike '%home-documents%' or coalesce(with_check,'') ilike '%home-documents%')
  loop
    if regexp_replace(p.expr, 'home-documents', '', 'gi') ~* '''[a-z0-9_-]+''::text'
       or p.expr !~* 'bucket_id' then
      raise exception 'Policy "%" on storage.objects names home-documents together with something else (%). Not dropped; split it by hand, then re-run.', p.policyname, p.expr;
    end if;
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

-- The table itself: same posture as supabase_portal_lockdown.sql (service role only).
drop policy if exists home_documents_anon_all on home_documents;
alter table home_documents enable row level security;
-- Nothing signed in reads this table directly either (the Home app does not use it; verified
-- 2026-10-20 against ledrix-app/src), so authenticated loses its grant too.
revoke all on home_documents from anon, authenticated;
-- The website's routes reach this table only as service_role, so grant exactly what /api/docs does
-- (list, file, delete). A no-op where the project's default privileges already grant it; required
-- where they do not (found 2026-10-20: a new Supabase project gave service_role nothing, and every
-- route answered 404).
grant select, insert, delete on home_documents to service_role;

commit;

-- ── POST-CHECK (read-only) — every status must be 'ok' ─────────────────────────────────
-- select 'bucket private' as check, case when public then 'OPEN' else 'ok' end as status
--   from storage.buckets where id = 'home-documents'
-- union all
-- select 'bucket size limit 20 MB', case when file_size_limit = 20971520 then 'ok' else 'WRONG' end
--   from storage.buckets where id = 'home-documents'
-- union all
-- select 'bucket type allow-list exact', case when cardinality(allowed_mime_types) = 13 and allowed_mime_types @> array[
--          'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
--          'image/gif', 'text/plain', 'text/csv', 'application/msword',
--          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--          'application/vnd.ms-excel',
--          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] then 'ok' else 'WRONG' end
--   from storage.buckets where id = 'home-documents'
-- union all
-- select 'no storage policy names the bucket',
--        case when count(*) = 0 then 'ok' else 'OPEN' end
--   from pg_policies where schemaname = 'storage' and tablename = 'objects'
--    and (coalesce(qual,'') ilike '%home-documents%' or coalesce(with_check,'') ilike '%home-documents%')
-- union all
-- select 'home_documents rls on', case when relrowsecurity then 'ok' else 'OPEN' end
--   from pg_class where oid = 'public.home_documents'::regclass
-- union all
-- select 'no client grant on home_documents',
--        case when count(*) = 0 then 'ok' else 'OPEN' end
--   from information_schema.role_table_grants where table_name = 'home_documents' and grantee in ('anon', 'authenticated')
-- union all
-- select 'service_role can list, file, delete',
--        case when has_table_privilege('service_role', 'public.home_documents', 'select')
--              and has_table_privilege('service_role', 'public.home_documents', 'insert')
--              and has_table_privilege('service_role', 'public.home_documents', 'delete')
--             then 'ok' else 'MISSING' end;
--
-- Then, in a browser: open a portal with a valid token → Docs → a stored file opens (via
-- /api/docs?t=…&id=…). Paste the file's old /object/public/home-documents/… URL → 400/404.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────────────────
-- supabase_home_documents_private_ROLLBACK.sql. It re-opens public links; use only if the new
-- route has to be reverted.
