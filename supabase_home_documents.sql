-- ─── home_documents ──────────────────────────────────────────────────────────
-- The homeowner's document locker: appliance manuals, receipts, warranties, and any
-- other file pertaining to the house. Rows are share-scoped (secured in practice by the
-- unguessable share_id, same posture as the other home_* tables). The FILE itself is
-- uploaded server-side via /api/docs (service role) into the public `home-documents`
-- storage bucket; this table just indexes them. Run once. Idempotent.
--
-- ALSO REQUIRED (one-time, in the Supabase dashboard): create a PUBLIC storage bucket
-- named `home-documents` (Storage → New bucket → Public). No storage RLS policy needed —
-- writes go through the service role in /api/docs.

create table if not exists home_documents (
  id          uuid primary key default gen_random_uuid(),
  share_id    text not null,
  name        text not null,
  url         text not null,        -- public URL in the home-documents bucket
  path        text,                 -- storage object path (for deletion)
  kind        text,                 -- manual | receipt | warranty | report | other
  size        integer,
  created_at  timestamptz not null default now()
);

create index if not exists idx_home_documents_share on home_documents(share_id, created_at desc);

alter table home_documents enable row level security;

-- Share-scoped access (read/insert/delete) via the anon proxy, like the other home_* tables.
drop policy if exists home_documents_anon_all on home_documents;
create policy home_documents_anon_all on home_documents for all to anon using (true) with check (true);
