-- ─── STAGING ONLY — read-only checks for the homeowner portal migrations ────────────────
--
-- (Homeowner security pass 4, 2026-10-20.) Run each block on its own in the STAGING project's SQL
-- editor and save the output (copy as CSV/markdown into the validation notes). Everything here is
-- read-only except block S4, which is the staff revocation runbook filled in for the staging home.
-- The checks are copied from supabase_home_documents_private.sql and supabase_portal_links.sql;
-- if the two ever differ, the migration file is the one that counts.

-- ── S0 · Am I in staging? (run FIRST, every session) ──────────────────────────────────
-- Expect: non_staging_homes = 0. Anything else → STOP, you are in the wrong project.
select current_database() as db,
       (select count(*) from public.home_records) as homes,
       (select count(*) from public.home_records where share_id not like 'stg_%') as non_staging_homes;

-- ── S1 · PRE-CHECK (before either migration) — SAVE THIS OUTPUT ───────────────────────
-- Expected after the fixture: public = true, both limits NULL; one policy "stg home-documents
-- public read"; anon and authenticated grants present; portal_links = NULL.
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'home-documents';
select policyname, roles, cmd, qual, with_check from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual,'') ilike '%home-documents%' or coalesce(with_check,'') ilike '%home-documents%');
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'home_documents' and grantee in ('anon', 'authenticated') order by 1, 2;
select to_regclass('public.portal_links') as portal_links;
select extname from pg_extension where extname = 'pgcrypto';                 -- expect one row

-- ── S2 · POST-CHECK, supabase_home_documents_private.sql — every status 'ok' ─────────
select 'bucket private' as check, case when public then 'OPEN' else 'ok' end as status
  from storage.buckets where id = 'home-documents'
union all
select 'bucket size limit 20 MB', case when file_size_limit = 20971520 then 'ok' else 'WRONG' end
  from storage.buckets where id = 'home-documents'
union all
select 'bucket type allow-list exact', case when cardinality(allowed_mime_types) = 13 and allowed_mime_types @> array[
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'image/gif', 'text/plain', 'text/csv', 'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] then 'ok' else 'WRONG' end
  from storage.buckets where id = 'home-documents'
union all
select 'no storage policy names the bucket', case when count(*) = 0 then 'ok' else 'OPEN' end
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual,'') ilike '%home-documents%' or coalesce(with_check,'') ilike '%home-documents%')
union all
select 'home_documents rls on', case when relrowsecurity then 'ok' else 'OPEN' end
  from pg_class where oid = 'public.home_documents'::regclass
union all
select 'no client grant on home_documents', case when count(*) = 0 then 'ok' else 'OPEN' end
  from information_schema.role_table_grants where table_name = 'home_documents' and grantee in ('anon', 'authenticated')
union all
select 'no policy on home_documents', case when count(*) = 0 then 'ok' else 'OPEN' end
  from pg_policies where schemaname = 'public' and tablename = 'home_documents'
union all
select 'service_role can list, file, delete',
       case when has_table_privilege('service_role', 'public.home_documents', 'select')
             and has_table_privilege('service_role', 'public.home_documents', 'insert')
             and has_table_privilege('service_role', 'public.home_documents', 'delete')
            then 'ok' else 'MISSING' end;

-- ── S3 · POST-CHECK, supabase_portal_links.sql — every status 'ok' ───────────────────
select 'table exists' as check, case when to_regclass('public.portal_links') is not null then 'ok' else 'MISSING' end as status
union all
select 'rls on', case when relrowsecurity then 'ok' else 'OPEN' end from pg_class where oid = 'public.portal_links'::regclass
union all
select 'no client grants', case when count(*) = 0 then 'ok' else 'OPEN' end
  from information_schema.role_table_grants where table_name = 'portal_links' and grantee in ('anon', 'authenticated')
union all
select 'no policies', case when count(*) = 0 then 'ok' else 'OPEN' end
  from pg_policies where schemaname = 'public' and tablename = 'portal_links'
union all
select 'service_role can look up, mint, revoke',
       case when has_table_privilege('service_role', 'public.portal_links', 'select')
             and has_table_privilege('service_role', 'public.portal_links', 'insert')
             and has_table_privilege('service_role', 'public.portal_links', 'update')
            then 'ok' else 'MISSING' end;

-- ── S4 · STAFF RUNBOOK for the staging home (WRITES — staging only) ──────────────────
-- S4a  Revoke the ORIGINAL edit link of stg_home_a:
--   insert into portal_links (share_id, token_hash, scope, created_via, revoked_at, revoked_reason)
--   select share_id, encode(extensions.digest(share_token, 'sha256'), 'hex'), 'edit', 'staff', now(), 'staging test'
--     from home_records where share_id = 'stg_home_a' and share_token is not null
--   on conflict (token_hash) do update set revoked_at = now(), revoked_reason = excluded.revoked_reason;
-- S4b  Issue a replacement edit link (copy new_token once; it is a credential):
--   with t as (select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=') as tok)
--   insert into portal_links (share_id, token_hash, scope, created_via)
--   select 'stg_home_a', encode(extensions.digest(tok, 'sha256'), 'hex'), 'edit', 'staff' from t
--   returning (select tok from t) as new_token;
-- S4c  Undo S4a (so later steps can use the original link again):
--   delete from portal_links where share_id = 'stg_home_a' and scope = 'edit' and created_via = 'staff' and revoked_at is not null;

-- ── S5 · After the upload tests — what is stored and filed ───────────────────────────
-- Expect: every home_documents.path is '<share>/<ms>_<hex>_<name>' (never '/_incoming/'), its
-- object exists, and the only '_incoming/' objects are ones made deliberately by the tests.
select d.name, d.path, d.size, d.url, (o.id is not null) as object_exists, o.metadata->>'mimetype' as stored_type
  from public.home_documents d
  left join storage.objects o on o.bucket_id = 'home-documents' and o.name = d.path
 where d.share_id = 'stg_home_a' order by d.created_at;
select name, metadata->>'size' as size, metadata->>'mimetype' as type, created_at
  from storage.objects where bucket_id = 'home-documents' and name like 'stg_home_a/%' order by name;
select id, scope, created_via, revoked_at from public.portal_links where share_id = 'stg_home_a' order by created_at;
