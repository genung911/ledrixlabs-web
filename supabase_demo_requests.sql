-- Demo requests from the marketing site's "Request a demo" form.
-- /api/demo-request inserts here with the public anon key, so RLS allows anon to
-- INSERT only — never SELECT. Read submissions from the Supabase dashboard or with
-- the service-role key; they are NOT publicly readable.

create table if not exists public.demo_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  company    text not null,
  email      text not null,
  source     text,
  created_at timestamptz not null default now()
);

alter table public.demo_requests enable row level security;

drop policy if exists "anon insert demo_requests" on public.demo_requests;
create policy "anon insert demo_requests"
  on public.demo_requests
  for insert
  to anon
  with check (true);
