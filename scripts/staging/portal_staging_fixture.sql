-- STAGING ONLY - homeowner portal fixture for a NEW, EMPTY Supabase project
--
-- (Homeowner security pass 4, 2026-10-20.) NEVER run this against
-- production. It creates the tables the portal routes use, in their WORST
-- plausible pre-migration state (anon policies on, bucket public, a
-- dashboard-style storage policy), and one test home - so that
-- supabase_home_documents_private.sql and supabase_portal_links.sql can be
-- applied, checked and rolled back for real.
--
-- The production home_records / home_reminders / home_projects tables were
-- made in the dashboard and exist in no repo file, so their columns here are
-- the ones the website reads and writes (app/api/share/[token]/route.ts
-- FIELDS, app/share/[id]/page.tsx types), not a copy of production.
--
-- Guard: it refuses to run in a database that already holds any home record
-- not made by this file.
--
-- HOW TO RUN: open this FILE and copy from it (or: pbcopy < this file).
-- Do not copy it out of a terminal or chat window: those wrap long lines,
-- and a wrap inside a column list is a syntax error. Every line here is
-- kept under 80 characters so a narrow window cannot split one.
--
-- Output: the test home's share_id and its ORIGINAL (edit) token. Keep the
-- token out of chat, tickets and screenshots - it is a working credential
-- for the staging home.

-- The table check runs as dynamic SQL, and only once the table is known to
-- exist: PL/pgSQL resolves table names in an IF before it evaluates the
-- AND, so a plain reference fails in an empty project ("does not exist").
do $$
declare
  real_homes boolean;
begin
  if to_regclass('public.home_records') is not null then
    execute 'select exists (select 1 from public.home_records '
         || 'where share_id not like ''stg_%'')'
      into real_homes;
    if real_homes then
      raise exception 'STOP: real home records here; staging only.';
    end if;
  end if;
end $$;

begin;

create table if not exists public.home_records (
  id              uuid primary key default gen_random_uuid(),
  share_id        text not null unique,
  share_token     text unique,
  inspector_id    uuid,
  address         text,
  city            text,
  state           text,
  zip             text,
  year_built      text,
  sqft            text,
  beds            text,
  baths           text,
  garage          text,
  inspection_type text,
  inspection_date text,
  inspector       text,
  company         text,
  license_number  text,
  sop_mode        text,
  anomalies       jsonb not null default '[]'::jsonb,
  specs           jsonb not null default '[]'::jsonb,
  profile         jsonb,
  pdf_url         text,
  cover_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.home_records enable row level security;
revoke all on public.home_records from anon;

create table if not exists public.home_reminders (
  id            uuid primary key default gen_random_uuid(),
  share_id      text not null,
  title         text not null,
  system        text,
  due_date      date,
  recurrence    text,
  completed     boolean not null default false,
  snoozed_until date,
  notes         text,
  seeded        boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.home_projects (
  id              uuid primary key default gen_random_uuid(),
  share_id        text not null,
  title           text not null,
  system          text,
  priority        text,
  status          text not null default 'identified',
  description     text,
  recommendation  text,
  budget_estimate text,
  contractor_type text,
  notes           text,
  photos          jsonb not null default '[]'::jsonb,
  appliance_info  jsonb,
  seeded          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.home_reports (
  id              uuid primary key default gen_random_uuid(),
  share_id        text not null,
  inspector_id    uuid,
  version         text not null,
  inspection_date text,
  pdf_path        text,
  html_path       text,
  published_at    timestamptz not null default now(),
  unique (share_id, version)
);

create table if not exists public.floor_plans (
  inspection_id   text primary key,
  inspector_id    uuid,
  layout          jsonb,
  fingerprint     text,
  last_attempt_at timestamptz,
  updated_at      timestamptz default now()
);

-- These three as the repo files create them (supabase_home_documents.sql
-- etc.), anon policy included.
create table if not exists public.home_documents (
  id         uuid primary key default gen_random_uuid(),
  share_id   text not null,
  name       text not null,
  url        text not null,
  path       text,
  kind       text,
  size       integer,
  created_at timestamptz not null default now()
);

create table if not exists public.home_maintenance_log (
  id          uuid primary key default gen_random_uuid(),
  share_id    text not null,
  title       text not null,
  system      text,
  kind        text not null default 'service'
                check (kind in ('service', 'repair', 'improvement')),
  note        text,
  photo_url   text,
  done_date   date not null default current_date,
  source      text not null default 'manual'
                check (source in ('manual', 'task', 'voice')),
  reminder_id uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.home_repairs (
  id             uuid primary key default gen_random_uuid(),
  share_id       text not null,
  anomaly_ref    text,
  item           text,
  location       text,
  severity       text,
  remedy         text,
  generated_text text,
  edited_text    text,
  status         text not null default 'included'
                   check (status in ('included', 'excluded')),
  source_fp      text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.home_documents enable row level security;
drop policy if exists home_documents_anon_all on public.home_documents;
create policy home_documents_anon_all on public.home_documents
  for all to anon using (true) with check (true);
-- The worst case the migration must undo.
grant all on public.home_documents to anon, authenticated;

-- The website's routes use service_role. Production's tables give it these
-- through the project's default privileges; a new project may not (found
-- 2026-10-20: service_role had nothing, and every route answered 404).
grant select, insert, update, delete on
  public.home_records, public.home_reminders, public.home_projects,
  public.home_reports, public.floor_plans, public.home_documents,
  public.home_maintenance_log, public.home_repairs
  to service_role;

-- The bucket as supabase_home_documents.sql told the owner to make it:
-- PUBLIC, no limits.
insert into storage.buckets (id, name, public)
  values ('home-documents', 'home-documents', true)
  on conflict (id) do update
    set public = true, file_size_limit = null, allowed_mime_types = null;

-- A dashboard-style policy about this bucket alone - the migration must
-- drop it.
drop policy if exists "stg home-documents public read" on storage.objects;
create policy "stg home-documents public read" on storage.objects
  for select to anon
  using (bucket_id = 'home-documents');

-- One test home with two findings.
insert into public.home_records
  (share_id, share_token, address, city, state, zip, inspection_date,
   anomalies)
values (
  'stg_home_a',
  encode(extensions.gen_random_bytes(16), 'hex'),
  '1 Staging Ln', 'Boise', 'ID', '83702', '2026-10-20',
  '[{"id":"f1","unit":"Electrical",
     "description":"Panel cover blocked","severity":"deficiency"},
    {"id":"f2","unit":"Roof",
     "description":"Lifted shingles","severity":"maintenance"}]'::jsonb
)
on conflict (share_id) do nothing;

commit;

-- The test home's edit link token. Open  <preview>/share/<share_token>
select share_id, share_token
  from public.home_records
 where share_id = 'stg_home_a';
