-- 1778891250_rls_harden.sql
--
-- Minimum-safe RLS remediation for the gaps catalogued in
-- audits/RLS_AUDIT.md. Strategy:
--   1. Drop every leftover `auth write X using(true) with check(true)` policy
--      created by 0002_fill_missing_domains.sql:597 that was never replaced.
--   2. Drop the residual `anon read X using(true)` policies for the 0001 init
--      tables (reps, pipeline, queue, courses, recordings, connections,
--      hardware, ai_agents, workflows) and one straggler followup_rules.
--   3. Where the table has agency_id, install a tenant-scoped write policy.
--      Where it doesn't, leave write to the server only (no replacement) and
--      document it.
--
-- Idempotent: all `drop policy if exists`. The new create policies use
-- `if not exists` semantics by virtue of being preceded by their drop.
-- Depends on 1778891249_close_schema_drift.sql for: reps.agency_id, carriers.agency_id.
--
-- Not applied. Review then `supabase db push`.

begin;

set local search_path = public;

------------------------------------------------------------------------------
-- A. Drop residual blanket `anon read X` policies on 0001 tables.
--    0001:220-228 created these and they were never dropped.
------------------------------------------------------------------------------
drop policy if exists "anon read reps"        on public.reps;
drop policy if exists "anon read pipeline"    on public.pipeline;
drop policy if exists "anon read queue"       on public.queue;
drop policy if exists "anon read courses"     on public.courses;
drop policy if exists "anon read recordings"  on public.recordings;
drop policy if exists "anon read connections" on public.connections;
drop policy if exists "anon read hardware"    on public.hardware;
drop policy if exists "anon read ai_agents"   on public.ai_agents;
drop policy if exists "anon read workflows"   on public.workflows;
-- 0006_anon_demo_read.sql had previously re-installed scoped anon-demo reads
-- on a subset of these tables — those are scoped to the public demo agency_id
-- and are intentionally kept. If they were also dropped here, they would need
-- to be re-installed afterward. (They are NOT named "anon read X".)

-- straggler: followup_rules anon read was not in 0024's drop list.
drop policy if exists "anon read followup_rules" on public.followup_rules;

------------------------------------------------------------------------------
-- B. Drop residual blanket `auth write X` policies. From 0001 (lines 209-217)
--    and 0002 (line 597 loop), these were never replaced.
------------------------------------------------------------------------------

-- 0001 batch
drop policy if exists "auth write reps"        on public.reps;
drop policy if exists "auth write pipeline"    on public.pipeline;
drop policy if exists "auth write queue"       on public.queue;
drop policy if exists "auth write courses"     on public.courses;
drop policy if exists "auth write recordings"  on public.recordings;
drop policy if exists "auth write connections" on public.connections;
drop policy if exists "auth write hardware"    on public.hardware;
drop policy if exists "auth write ai_agents"   on public.ai_agents;
drop policy if exists "auth write workflows"   on public.workflows;

-- 0002 loop batch — only those NOT already dropped by 0015 / 0024.
drop policy if exists "auth write agent_runs"           on public.agent_runs;
drop policy if exists "auth write attributions"         on public.attributions;
drop policy if exists "auth write clients"              on public.clients;
drop policy if exists "auth write coaching_notes"       on public.coaching_notes;
drop policy if exists "auth write coaching_sessions"    on public.coaching_sessions;
drop policy if exists "auth write followup_rules"       on public.followup_rules;
drop policy if exists "auth write forecast_overrides"   on public.forecast_overrides;
drop policy if exists "auth write forecast_runs"        on public.forecast_runs;
drop policy if exists "auth write households"           on public.households;
drop policy if exists "auth write interviews"           on public.interviews;
drop policy if exists "auth write message_reads"        on public.message_reads;
drop policy if exists "auth write messages"             on public.messages;
drop policy if exists "auth write nigos"                on public.nigos;
drop policy if exists "auth write notifications"        on public.notifications;
drop policy if exists "auth write recruits"             on public.recruits;
drop policy if exists "auth write sequences"            on public.sequences;
drop policy if exists "auth write thread_members"       on public.thread_members;
drop policy if exists "auth write threads"              on public.threads;
drop policy if exists "auth write touchpoints"          on public.touchpoints;

-- 0002 loop, catalog tables — write is server-side only; drop the blanket.
drop policy if exists "auth write aep_periods"   on public.aep_periods;
drop policy if exists "auth write carriers"      on public.carriers;
drop policy if exists "auth write lead_sources"  on public.lead_sources;
drop policy if exists "auth write nigo_reasons"  on public.nigo_reasons;
drop policy if exists "auth write products"      on public.products;

------------------------------------------------------------------------------
-- C. Install tenant-scoped write policies for tables that already have
--    agency_id (per init + 0015 + 1778891249).
------------------------------------------------------------------------------

-- reps: needs reps.agency_id (added in 1778891249).
create policy "tenant write reps" on public.reps
  for all to authenticated
  using       (public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()));

-- pipeline: needs pipeline.agency_id (added in 1778891249).
create policy "tenant write pipeline" on public.pipeline
  for all to authenticated
  using       (public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()));

-- queue: no agency_id today. The minimum-safe move is to scope writes via
-- pipeline_id (queue.pipeline_id -> pipeline.agency_id) — but that schema
-- relationship is not provable from this branch's migrations. TODO: confirm
-- queue→pipeline FK exists in deployed DB; if so, scope through it. For now,
-- forbid client writes entirely (server-only with service-role key).
-- (No replacement policy. Reads remain scoped per 0015:132-134.)

-- connections, hardware, ai_agents, workflows, courses, recordings: no
-- agency_id in the current schema. Server-only writes for now; flag for
-- phase 2.

-- sequences: agency_id added in 0031:28 but it's nullable; scope writes that
-- have a non-null agency_id, and forbid writes that leave it null.
create policy "tenant write sequences" on public.sequences
  for all to authenticated
  using       (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id = ANY (public.viewer_agency_ids())))
  with check  (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id = ANY (public.viewer_agency_ids())));

-- carriers, products: scoped now that 1778891249 added agency_id.
create policy "tenant write carriers" on public.carriers
  for all to authenticated
  using       (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id = ANY (public.viewer_agency_ids())))
  with check  (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id = ANY (public.viewer_agency_ids())));

create policy "tenant write products" on public.products
  for all to authenticated
  using       (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id = ANY (public.viewer_agency_ids())))
  with check  (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id = ANY (public.viewer_agency_ids())));

------------------------------------------------------------------------------
-- D. Make sure RLS is actually enabled on the tables we just hardened.
--    Idempotent — safe even if already enabled.
------------------------------------------------------------------------------
alter table public.reps         enable row level security;
alter table public.pipeline     enable row level security;
alter table public.queue        enable row level security;
alter table public.courses      enable row level security;
alter table public.recordings   enable row level security;
alter table public.connections  enable row level security;
alter table public.hardware     enable row level security;
alter table public.ai_agents    enable row level security;
alter table public.workflows    enable row level security;
alter table public.agent_runs   enable row level security;
alter table public.attributions enable row level security;
alter table public.clients      enable row level security;
alter table public.coaching_notes      enable row level security;
alter table public.coaching_sessions   enable row level security;
alter table public.followup_rules      enable row level security;
alter table public.forecast_overrides  enable row level security;
alter table public.forecast_runs       enable row level security;
alter table public.households          enable row level security;
alter table public.interviews          enable row level security;
alter table public.message_reads       enable row level security;
alter table public.messages            enable row level security;
alter table public.nigos               enable row level security;
alter table public.notifications       enable row level security;
alter table public.recruits            enable row level security;
alter table public.sequences           enable row level security;
alter table public.thread_members      enable row level security;
alter table public.threads             enable row level security;
alter table public.touchpoints         enable row level security;
alter table public.aep_periods   enable row level security;
alter table public.carriers      enable row level security;
alter table public.lead_sources  enable row level security;
alter table public.nigo_reasons  enable row level security;
alter table public.products      enable row level security;

commit;

-- TODO follow-ups (NOT applied here):
--   1. Phase 2 for tables without agency_id (recruits/threads/notifications/
--      sequences/forecast_*/followup_rules/interviews/households/clients/
--      attributions/touchpoints/nigos) — either add agency_id and scope, or
--      keep server-only and verify the client never tries to mutate.
--   2. Decide whether anon reads on agency_lead_sources inbound webhook flow
--      are actually needed (lead_drip phase 1 added them — confirm or revoke).
--   3. queue → pipeline relationship: confirm FK and scope queue writes.
