-- ─── home_maintenance_log ────────────────────────────────────────────────────
-- The home's permanent service history — the "Carfax of the home". Each row is a
-- completed maintenance task, repair, or improvement the homeowner logs over time
-- (filter changed, water heater flushed, NEW ROOF installed, exterior painted, …).
-- This is the living-document spine: the inspection is the baseline; this table is
-- everything that happens after, and it transfers with the home.
--
-- Access model mirrors home_repairs / home_projects: the unguessable share_id is
-- the capability; the anon Home App client (the owner with the link) reads/writes
-- its own share's rows. Run once in the Supabase SQL editor. Idempotent.

create table if not exists home_maintenance_log (
  id          uuid primary key default gen_random_uuid(),
  share_id    text not null,
  title       text not null,          -- what was done ("Replaced the roof", "Flushed the water heater")
  system      text,                   -- Roof | HVAC | Water Heater | Exterior | …
  kind        text not null default 'service'
                check (kind in ('service','repair','improvement')),
  note        text,                   -- free-text detail (contractor, cost, warranty)
  photo_url   text,                   -- optional receipt / after photo
  done_date   date not null default current_date,
  source      text not null default 'manual'
                check (source in ('manual','task','voice')),
  reminder_id uuid,                   -- the maintenance task this fulfilled, if any
  created_at  timestamptz not null default now()
);

create index if not exists idx_home_maintenance_log_share on home_maintenance_log(share_id, done_date desc);

alter table home_maintenance_log enable row level security;

-- Permissive anon access, scoped in practice by the secret share_id (same model as
-- home_repairs / home_projects). If you later tighten those, mirror it here.
drop policy if exists home_maintenance_log_anon_all on home_maintenance_log;
create policy home_maintenance_log_anon_all on home_maintenance_log
  for all
  to anon
  using (true)
  with check (true);
