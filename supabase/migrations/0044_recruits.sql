-- 1778891444_recruits.sql
-- Rookie of the Year Play — recruiting funnel for sales reps.
--
-- Canonical 4-stage funnel: Applied → Discovery → Onboarding → Licensed.
-- Distinct from the existing recruiting_applicants/_campaigns tables, which
-- model an outreach workbench (campaigns + DMs). This `recruits` table is
-- the simpler funnel-of-record for tracking individual rep candidates from
-- first application through full licensing.
--
-- Tenant scope: via app.active_agency_id GUC (set per-request by the API
-- layer). Matches the pattern used by tenant policies elsewhere in the
-- schema. agencies + reps tables already exist (0001/0015).
--
-- Note: public.reps.id is text (slug), not uuid — FK typed accordingly.

create table if not exists public.recruits (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id),
  name            text not null,
  email           text,
  phone           text,
  source          text,
  stage           text not null
                  check (stage in ('Applied','Discovery','Onboarding','Licensed'))
                  default 'Applied',
  applied_at      timestamptz default now(),
  discovery_at    timestamptz,
  onboarded_at    timestamptz,
  licensed_at     timestamptz,
  owner_rep_id    text references public.reps(id),
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.recruits enable row level security;

drop policy if exists recruits_tenant_select on public.recruits;
create policy recruits_tenant_select on public.recruits
  for select
  using (agency_id = current_setting('app.active_agency_id', true)::uuid);

drop policy if exists recruits_tenant_write on public.recruits;
create policy recruits_tenant_write on public.recruits
  for all
  using (agency_id = current_setting('app.active_agency_id', true)::uuid);

create index if not exists recruits_agency_stage_idx
  on public.recruits(agency_id, stage);
