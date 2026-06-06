-- Per-user daily AI usage cap for the free Home App beta.
-- Bounds cost so an open beta can't run up a surprise bill. Only the server
-- (service role) touches this; the increment is atomic. Run once in the
-- Supabase SQL editor. Idempotent.

create table if not exists ledrix_usage (
  user_id uuid  not null,
  day     date  not null,
  count   int   not null default 0,
  primary key (user_id, day)
);

alter table ledrix_usage enable row level security;
-- No public policies on purpose — only the service role (the /api routes) writes here.

-- Atomic increment-and-return: one row per user per day, count++ on conflict.
create or replace function increment_ledrix_usage(uid uuid, d date)
returns int
language plpgsql
security definer
as $$
declare c int;
begin
  insert into ledrix_usage (user_id, day, count) values (uid, d, 1)
  on conflict (user_id, day) do update set count = ledrix_usage.count + 1
  returning count into c;
  return c;
end;
$$;
