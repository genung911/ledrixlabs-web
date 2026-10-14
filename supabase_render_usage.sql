-- Per-user daily PDF render budget (Security F1, 2026-10-14). Owner ruling: 20 server renders per
-- inspector per day. Bounds the paid remote browser behind /api/render-pdf, since sign-up is open.
-- Separate from ledrix_usage on purpose: a PDF must not spend AI quota, and vice versa.
--
-- Only the server (service role, /api/render-pdf) touches this. Run once in the Supabase SQL editor.
-- Idempotent. Changes no existing rows.
--
-- Rollback: drop function public.increment_render_usage(uuid, date); drop table public.render_usage;
-- (the route fails OPEN when the function is missing — renders continue, uncounted).

begin;

create table if not exists public.render_usage (
  user_id uuid not null,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table public.render_usage enable row level security;
-- No policies on purpose — only the service role reads or writes here.
revoke all on public.render_usage from public, anon, authenticated;

-- Atomic increment-and-return: one row per user per day, count++ on conflict.
create or replace function public.increment_render_usage(uid uuid, d date)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c int;
begin
  insert into public.render_usage (user_id, day, count) values (uid, d, 1)
  on conflict (user_id, day) do update set count = public.render_usage.count + 1
  returning count into c;
  return c;
end;
$$;

revoke execute on function public.increment_render_usage(uuid, date) from public, anon, authenticated;
grant  execute on function public.increment_render_usage(uuid, date) to service_role;

commit;

-- Post-apply check (read-only). Expect: rls=true, anon/auth execute=false, service_role execute=true.
select
  (select relrowsecurity from pg_class where oid = 'public.render_usage'::regclass)                          as rls,
  has_function_privilege('anon',          'public.increment_render_usage(uuid, date)', 'execute')           as anon_exec,
  has_function_privilege('authenticated', 'public.increment_render_usage(uuid, date)', 'execute')           as auth_exec,
  has_function_privilege('service_role',  'public.increment_render_usage(uuid, date)', 'execute')           as service_exec,
  has_table_privilege('anon',          'public.render_usage', 'select')                                    as anon_select,
  has_table_privilege('authenticated', 'public.render_usage', 'select')                                    as auth_select;
