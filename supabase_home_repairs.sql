-- ─── home_repairs ────────────────────────────────────────────────────────────
-- The buyer's Repair Request list: one neutral repair REQUEST per inspection
-- finding the BUYER chooses to ask the seller to address. Distinct from
-- home_projects (personal home-improvement) because this is shared externally as
-- a request to the seller. The BUYER decides what to include and owns the wording;
-- the AI draft and any agent are advisory only.
--
-- Access model mirrors home_projects: the unguessable share_id is the capability,
-- and the anon Home App client (the buyer with the link) reads/writes its own
-- share's rows. CONFIRM these policies match your existing home_projects policies
-- before running — keep them consistent. Run once in the Supabase SQL editor.
-- Idempotent.

create table if not exists home_repairs (
  id             uuid primary key default gen_random_uuid(),
  share_id       text not null,
  anomaly_ref    text,                  -- ties back to the source finding (defect↔request)
  item           text,                  -- short component label (e.g. "Electrical panel")
  location       text,
  severity       text,                  -- report vocab: critical | anomaly | cosmetic
  remedy         text,                  -- requested corrective action
  generated_text text,                  -- AI draft (the request wording)
  edited_text    text,                  -- buyer HITL override; null = use generated_text
  status         text not null default 'included'
                   check (status in ('included','excluded')),
  source_fp      text,                  -- fingerprint of the finding the text was generated from
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_home_repairs_share on home_repairs(share_id, sort_order);

alter table home_repairs enable row level security;

-- Permissive anon access, scoped in practice by the secret share_id (the same
-- model home_projects uses). If you later tighten home_projects to a stricter
-- policy, mirror it here.
drop policy if exists home_repairs_anon_all on home_repairs;
create policy home_repairs_anon_all on home_repairs
  for all
  to anon
  using (true)
  with check (true);
