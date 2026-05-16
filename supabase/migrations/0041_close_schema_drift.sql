-- 1778891249_close_schema_drift.sql
--
-- Closes the diff between code references and supabase/migrations/*.sql DDL
-- discovered in audits/SCHEMA_DRIFT.md. Strategy: additive only — every
-- statement uses `if not exists` and safe defaults. NO DROPs. NO renames.
-- NO data destruction. Tables that exist in the deployed DB but not in this
-- branch's migrations get a defensive `create table if not exists` so a fresh
-- clone-and-deploy can succeed.
--
-- Not applied. Review then `supabase db push`.
--
-- Generated 2026-05-15 by audits/SCHEMA_DRIFT.md.

begin;

------------------------------------------------------------------------------
-- A. Tables referenced in code but missing from this branch's migrations.
--    Shape modeled on observed code usage; columns are intentionally minimal.
--    Real production likely has more — re-pull from deployed schema to sync.
------------------------------------------------------------------------------

create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  name        text,
  plan        text default 'starter',
  state       text default 'active',
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.agency_members (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null,
  role        text not null default 'rep' check (role in ('owner','manager','rep','viewer','super_admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists agency_members_user_idx   on public.agency_members (user_id) where active;
create index if not exists agency_members_agency_idx on public.agency_members (agency_id, active);

create table if not exists public.agency_invites (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  token       text not null unique,
  email_hint  text,
  role        text not null default 'rep',
  expires_at  timestamptz,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.agency_notifications (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  kind        text,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.agency_audit_log (
  id          bigserial primary key,
  agency_id   uuid references public.agencies(id) on delete cascade,
  actor_id    uuid,
  action      text not null,
  target      text,
  payload     jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);

create table if not exists public.agency_calls (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  rep_id      text,
  lead_id     uuid,
  phone       text,
  direction   text check (direction in ('inbound','outbound')),
  status      text,
  started_at  timestamptz,
  ended_at    timestamptz,
  duration_s  int,
  recording_url text,
  created_at  timestamptz not null default now()
);

create table if not exists public.agency_carrier_appointments (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  carrier_id  text,
  status      text default 'pending',
  appointed_at timestamptz,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.agency_onboarding_steps (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  step_key    text not null,
  status      text not null default 'pending' check (status in ('pending','in_progress','done','skipped')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (agency_id, step_key)
);

create table if not exists public.connector_catalog (
  id          text primary key,
  name        text not null,
  category    text,
  sort_order  int default 0,
  fields      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.lead_quotes (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  lead_id     uuid,
  product     text,
  ap_cents    bigint,
  carrier_id  text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.nigo_items (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  policy_id   uuid,
  reason_code text,
  status      text default 'open' check (status in ('open','resolved','dismissed')),
  notes       text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.notification_prefs (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  user_id     uuid,
  channel     text not null check (channel in ('email','sms','push','telegram')),
  category    text not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (user_id, channel, category)
);

create table if not exists public.recruiting_messages (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  applicant_id uuid,
  campaign_id uuid,
  channel     text,
  direction   text check (direction in ('outbound','inbound')),
  body        text,
  sent_at     timestamptz not null default now()
);

create table if not exists public.routing_rules (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  name        text,
  enabled     boolean not null default true,
  priority    int not null default 0,
  conditions  jsonb not null default '[]'::jsonb,
  action      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  owner_id    uuid,
  surface     text not null,
  name        text not null,
  config      jsonb not null default '{}'::jsonb,
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.vault_artifacts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  kind        text,
  source_url  text,
  title       text,
  body        text,
  retention   text default 'keep' check (retention in ('keep','review','purge')),
  created_at  timestamptz not null default now()
);

create table if not exists public.recruiting_campaigns (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  name        text,
  status      text default 'draft',
  created_at  timestamptz not null default now()
);

create table if not exists public.recruiting_applicants (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references public.agencies(id) on delete cascade,
  campaign_id uuid references public.recruiting_campaigns(id) on delete set null,
  full_name   text,
  email       text,
  phone       text,
  status      text default 'new',
  enrolled_at timestamptz not null default now()
);

create table if not exists public.agency_lead_sources (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  vendor      text,
  name        text,
  active      boolean not null default true,
  cost_per_lead_cents bigint not null default 0,
  created_at  timestamptz not null default now()
);
-- The 0031_lead_drip_phase1.sql ALTERs assume this base table exists. If a
-- fresh deploy applies 0031 before this migration the ALTER fails. Place this
-- file lexicographically BEFORE 0031 by renaming or use this command to make
-- 0031 idempotent on a clean DB. (TODO: verify ordering before push.)

------------------------------------------------------------------------------
-- B. Missing columns on tables that already exist.
------------------------------------------------------------------------------

alter table public.agency_expenses
  add column if not exists memo   text,
  add column if not exists status text default 'recorded'
                          check (status in ('recorded','reimbursed','disputed','void'));

alter table public.agent_deployments
  add column if not exists template text,
  add column if not exists version  text;

alter table public.carriers
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists carriers_agency_idx on public.carriers (agency_id);

alter table public.connections
  add column if not exists config        jsonb not null default '{}'::jsonb,
  add column if not exists connector_key text;

alter table public.pipeline
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade,
  add column if not exists phone     text;
create index if not exists pipeline_agency_idx on public.pipeline (agency_id);

alter table public.products
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade;
create index if not exists products_agency_idx on public.products (agency_id);

alter table public.queue
  add column if not exists assigned_rep_id text references public.reps(id) on delete set null;
create index if not exists queue_assigned_rep_idx on public.queue (assigned_rep_id);

alter table public.reps
  add column if not exists agency_id     uuid references public.agencies(id) on delete cascade,
  add column if not exists upline_rep_id text;
create index if not exists reps_agency_idx on public.reps (agency_id);
create index if not exists reps_upline_rep_idx on public.reps (upline_rep_id);

alter table public.sequence_enrollments
  add column if not exists agency_id     uuid references public.agencies(id) on delete cascade,
  add column if not exists next_send_at  timestamptz;
create index if not exists sequence_enrollments_agency_idx on public.sequence_enrollments (agency_id);

-- agency_lead_sources extra columns that 0031 does NOT add but code uses:
alter table public.agency_lead_sources
  add column if not exists email      text,
  add column if not exists phone      text,
  add column if not exists lead_name  text,
  add column if not exists state      text,
  add column if not exists age        int,
  add column if not exists product    text;

commit;
