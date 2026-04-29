-- Repflow V2 schema — operator-grade for life & health distribution
-- Drops the prior sailorsbot-style schema (all tables empty as of 2026-04-29)
-- and rebuilds around the data shapes in data.jsx.
--
-- Design notes:
--   - All money in cents (bigint). Never floats.
--   - Enums use Postgres CHECK constraints (cheaper to evolve than CREATE TYPE).
--   - Single-tenant for now (one IMO/agency per deployment). Multi-tenant fork
--     adds an `org_id` column + RLS by membership.
--   - RLS enabled on all tables; permissive policy for authenticated. Tighten
--     when auth UI lands.

------------------------------------------------------------------------------
-- 0. Drop legacy tables
------------------------------------------------------------------------------
drop table if exists public.training_progress cascade;
drop table if exists public.referrals cascade;
drop table if exists public.activity cascade;
drop table if exists public.brain_goals cascade;
drop table if exists public.brain_health cascade;
drop table if exists public.brain_learnings cascade;
drop table if exists public.brain_predictions cascade;
drop table if exists public.brain_signals cascade;
drop table if exists public.prospects cascade;
drop table if exists public.reps cascade;
drop table if exists public.sales_pipeline cascade;
drop table if exists public.connector_configs cascade;
drop table if exists public.agencies cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.support_tickets cascade;
drop table if exists public.rep_metrics cascade;
drop table if exists public.monthly_pnl cascade;
drop table if exists public.users cascade;
drop table if exists public.expenses cascade;
drop table if exists public.sequences cascade;
drop table if exists public.revenue cascade;
drop table if exists public.knowledge_base cascade;
drop function if exists public.get_user_agency_id() cascade;
drop function if exists public.is_superadmin() cascade;
drop function if exists public.rls_auto_enable() cascade;

------------------------------------------------------------------------------
-- 1. Reps — producers/agents on the floor
------------------------------------------------------------------------------
create table public.reps (
  id          text primary key,                          -- short slug ("marc")
  name        text not null,
  handle      text not null,
  tier        text not null check (tier in ('bronze','silver','gold','platinum','diamond')),
  mtd_cents   bigint not null default 0,
  today_cents bigint not null default 0,
  streak_days integer not null default 0,
  dials       integer not null default 0,
  presence    text not null default 'idle' check (presence in ('live','idle','off')),
  appts       integer not null default 0,
  color       text,                                       -- gradient css string
  created_at  timestamptz not null default now()
);
create index reps_tier_idx on public.reps (tier);
create index reps_mtd_idx  on public.reps (mtd_cents desc);

------------------------------------------------------------------------------
-- 2. Pipeline — leads in motion (Kanban board source)
------------------------------------------------------------------------------
create table public.pipeline (
  id          uuid primary key default gen_random_uuid(),
  lead_name   text not null,
  age         integer,
  state       text,                                       -- US state code
  stage       text not null check (stage in ('New','Contacted','Quoted','App In','Issued','Lost')),
  product     text,                                       -- "Med Supp Plan G", "Final Expense $15K"
  ap_cents    bigint not null default 0,                  -- annual premium
  days_in_stage integer not null default 0,
  last_activity_text text,
  next_action text,
  source      text,                                       -- "FB Lead Form", "T65 list", "Inbound call", ...
  owner_rep_id text references public.reps(id) on delete set null,
  consent     text not null default 'verified' check (consent in ('verified','pending','none')),
  heat        text not null default 'warm' check (heat in ('fresh','hot','warm','cold')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index pipeline_stage_idx on public.pipeline (stage);
create index pipeline_owner_idx on public.pipeline (owner_rep_id);
create index pipeline_heat_idx  on public.pipeline (heat) where heat in ('fresh','hot');

------------------------------------------------------------------------------
-- 3. Queue — dial queue (live speed-to-lead funnel)
------------------------------------------------------------------------------
create table public.queue (
  id              uuid primary key default gen_random_uuid(),
  lead_name       text not null,
  age             integer,
  state           text,
  source          text,
  product         text,
  elapsed_seconds integer not null default 0,
  score           integer not null check (score between 0 and 100),
  created_at      timestamptz not null default now()
);
create index queue_score_idx on public.queue (score desc);

------------------------------------------------------------------------------
-- 4. Courses — training catalog
------------------------------------------------------------------------------
create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  track        text,                                      -- "FE", "Compliance", "Med Supp", "AEP"
  duration_min integer not null default 0,
  status       text not null default 'assigned' check (status in ('assigned','in-progress','due','complete')),
  created_at   timestamptz not null default now()
);
create index courses_track_idx on public.courses (track);

------------------------------------------------------------------------------
-- 5. Recordings — call recordings + AI scoring
------------------------------------------------------------------------------
create table public.recordings (
  id              uuid primary key default gen_random_uuid(),
  lead_name       text not null,
  rep_id          text references public.reps(id) on delete set null,
  recorded_at     timestamptz not null default now(),
  duration_sec    integer not null default 0,
  talk_ratio_pct  integer not null default 50 check (talk_ratio_pct between 0 and 100),
  open_questions  integer not null default 0,
  ai_summary      text,
  tpmo_flag       text not null default 'ok' check (tpmo_flag in ('ok','warn','violation')),
  soa_flag        text not null default 'n/a' check (soa_flag in ('n/a','captured','scheduled','missing')),
  score           integer not null check (score between 0 and 100)
);
create index recordings_rep_idx on public.recordings (rep_id, recorded_at desc);

------------------------------------------------------------------------------
-- 6. Connections — third-party integrations (carriers, comms, etc.)
------------------------------------------------------------------------------
create table public.connections (
  id         text primary key,                            -- "twilio", "vapi", "uhc"
  name       text not null,
  category   text not null,                               -- "Comms", "Dialer", "Carrier", "E-app", ...
  status     text not null default 'ok' check (status in ('ok','warn','down')),
  meta       text,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 7. Hardware — agent fleet (Mac Minis, VPS)
------------------------------------------------------------------------------
create table public.hardware (
  id         text primary key,
  name       text not null,
  kind       text not null,                               -- "Mac Mini M4", "Hetzner CCX23"
  status     text not null default 'ok' check (status in ('ok','warn','down')),
  uptime_text text,
  load_pct   integer not null default 0 check (load_pct between 0 and 100),
  agent_count integer not null default 0,
  last_heartbeat timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 8. AI agents (named ai_agents to avoid auth namespace collisions)
------------------------------------------------------------------------------
create table public.ai_agents (
  id           text primary key,
  name         text not null,
  host_id      text references public.hardware(id) on delete set null,
  reqs_per_day text,                                       -- "1.2k/d" — kept as display
  success_rate numeric(5,2),                               -- 0.00 .. 100.00
  last_seen    timestamptz not null default now(),
  description  text
);
create index ai_agents_host_idx on public.ai_agents (host_id);

------------------------------------------------------------------------------
-- 9. Workflows — automations
------------------------------------------------------------------------------
create table public.workflows (
  id        text primary key,
  name      text not null,
  runs_per_day text,
  last_run  timestamptz not null default now()
);

------------------------------------------------------------------------------
-- 10. RLS — enable on every table, permissive read/write for authenticated.
--     Tighten once auth UI ships; tighten further per-rep / per-org for the
--     multi-tenant fork.
------------------------------------------------------------------------------
alter table public.reps        enable row level security;
alter table public.pipeline    enable row level security;
alter table public.queue       enable row level security;
alter table public.courses     enable row level security;
alter table public.recordings  enable row level security;
alter table public.connections enable row level security;
alter table public.hardware    enable row level security;
alter table public.ai_agents   enable row level security;
alter table public.workflows   enable row level security;

create policy "auth read reps"        on public.reps        for select to authenticated using (true);
create policy "auth read pipeline"    on public.pipeline    for select to authenticated using (true);
create policy "auth read queue"       on public.queue       for select to authenticated using (true);
create policy "auth read courses"     on public.courses     for select to authenticated using (true);
create policy "auth read recordings"  on public.recordings  for select to authenticated using (true);
create policy "auth read connections" on public.connections for select to authenticated using (true);
create policy "auth read hardware"    on public.hardware    for select to authenticated using (true);
create policy "auth read ai_agents"   on public.ai_agents   for select to authenticated using (true);
create policy "auth read workflows"   on public.workflows   for select to authenticated using (true);

create policy "auth write reps"        on public.reps        for all to authenticated using (true) with check (true);
create policy "auth write pipeline"    on public.pipeline    for all to authenticated using (true) with check (true);
create policy "auth write queue"       on public.queue       for all to authenticated using (true) with check (true);
create policy "auth write courses"     on public.courses     for all to authenticated using (true) with check (true);
create policy "auth write recordings"  on public.recordings  for all to authenticated using (true) with check (true);
create policy "auth write connections" on public.connections for all to authenticated using (true) with check (true);
create policy "auth write hardware"    on public.hardware    for all to authenticated using (true) with check (true);
create policy "auth write ai_agents"   on public.ai_agents   for all to authenticated using (true) with check (true);
create policy "auth write workflows"   on public.workflows   for all to authenticated using (true) with check (true);

-- Public anon read for the demo / prototype phase. Remove once login lands.
create policy "anon read reps"        on public.reps        for select to anon using (true);
create policy "anon read pipeline"    on public.pipeline    for select to anon using (true);
create policy "anon read queue"       on public.queue       for select to anon using (true);
create policy "anon read courses"     on public.courses     for select to anon using (true);
create policy "anon read recordings"  on public.recordings  for select to anon using (true);
create policy "anon read connections" on public.connections for select to anon using (true);
create policy "anon read hardware"    on public.hardware    for select to anon using (true);
create policy "anon read ai_agents"   on public.ai_agents   for select to anon using (true);
create policy "anon read workflows"   on public.workflows   for select to anon using (true);
