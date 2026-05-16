-- 0042_rls_harden.sql
--
-- ⚠️  Applied in production as 0049+0050+0051 (per-table pass strategy).
--     This file is the consolidated record of what was actually applied
--     after the original 0042 was discovered to be production-unsafe.
--
-- Original 0042 strategy: drop every `auth write X using(true) with check(true)`
-- leak from 0002_fill_missing_domains.sql:597 + 0001 init, then install
-- tenant-scoped replacements only on tables that had `agency_id`. Tables
-- without agency_id were left with NO write policy at all, on the assumption
-- that all writes went through `security definer` RPCs.
--
-- Production reality (2026-05-16 grep): direct client `sb.from('messages|
-- threads|notifications|recruits|coaching_*').{insert,update,delete}` calls
-- exist in the codebase. Applying the original 0042 as-is would have locked
-- authenticated writes to those tables → app down.
--
-- Resolution: applied as three passes via the Supabase MCP `apply_migration`
-- tool (see deployed migration tracker entries 0049/0050/0051). This file
-- consolidates them as a documentation record. NOT re-runnable as-is
-- because the leak policies it would drop have already been dropped.
--
-- See `audits/MIGRATION_APPLY_2026-05-16.md` for the full account.

set local search_path = public;

-- ── PASS 1 (additive — agency_id columns + scoped policies parallel to leak) ──
alter table public.recruits           add column if not exists agency_id uuid;
alter table public.notifications      add column if not exists agency_id uuid;
alter table public.threads            add column if not exists agency_id uuid;
alter table public.households         add column if not exists agency_id uuid;
alter table public.interviews         add column if not exists agency_id uuid;
alter table public.followup_rules     add column if not exists agency_id uuid;
alter table public.forecast_overrides add column if not exists agency_id uuid;
alter table public.forecast_runs      add column if not exists agency_id uuid;

-- Best-effort notifications backfill (handle → reps.handle → reps.agency_id),
-- then assign orphans to the atlas-demo agency.
update public.notifications n
   set agency_id = r.agency_id
  from public.reps r
 where n.recipient_handle = r.handle
   and n.agency_id is null;
update public.notifications
   set agency_id = 'd88e26b9-e8f4-49a7-bfa1-3d84a51506a1'::uuid
 where agency_id is null;

-- Scoped tenant policies. viewer_agency_ids() is set-returning so use
-- `IN (SELECT public.viewer_agency_ids())`.
drop policy if exists "tenant rw agent_runs" on public.agent_runs;
create policy "tenant rw agent_runs" on public.agent_runs
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw attributions" on public.attributions;
create policy "tenant rw attributions" on public.attributions
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = attributions.lead_pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = attributions.lead_pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw clients" on public.clients;
create policy "tenant rw clients" on public.clients
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = clients.lead_pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = clients.lead_pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw coaching_notes" on public.coaching_notes;
create policy "tenant rw coaching_notes" on public.coaching_notes
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.reps r where r.id = coaching_notes.rep_id
     and r.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.reps r where r.id = coaching_notes.rep_id
     and r.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw coaching_sessions" on public.coaching_sessions;
create policy "tenant rw coaching_sessions" on public.coaching_sessions
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.reps r where r.id = coaching_sessions.rep_id
     and r.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.reps r where r.id = coaching_sessions.rep_id
     and r.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw followup_rules" on public.followup_rules;
create policy "tenant rw followup_rules" on public.followup_rules
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw forecast_overrides" on public.forecast_overrides;
create policy "tenant rw forecast_overrides" on public.forecast_overrides
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw forecast_runs" on public.forecast_runs;
create policy "tenant rw forecast_runs" on public.forecast_runs
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw households" on public.households;
create policy "tenant rw households" on public.households
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw interviews" on public.interviews;
create policy "tenant rw interviews" on public.interviews
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw message_reads" on public.message_reads;
create policy "tenant rw message_reads" on public.message_reads
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.messages m join public.threads th on th.id = m.thread_id
     where m.id = message_reads.message_id
       and th.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.messages m join public.threads th on th.id = m.thread_id
     where m.id = message_reads.message_id
       and th.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw messages" on public.messages;
create policy "tenant rw messages" on public.messages
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.threads th where th.id = messages.thread_id
     and th.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.threads th where th.id = messages.thread_id
     and th.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw nigos" on public.nigos;
create policy "tenant rw nigos" on public.nigos
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = nigos.pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = nigos.pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw notifications" on public.notifications;
create policy "tenant rw notifications" on public.notifications
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw recruits" on public.recruits;
create policy "tenant rw recruits" on public.recruits
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw sequences" on public.sequences;
create policy "tenant rw sequences" on public.sequences
  for all to authenticated
  using       (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id IN (SELECT public.viewer_agency_ids())))
  with check  (public.is_super_admin() OR (agency_id IS NOT NULL AND agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw thread_members" on public.thread_members;
create policy "tenant rw thread_members" on public.thread_members
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.threads th where th.id = thread_members.thread_id
     and th.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.threads th where th.id = thread_members.thread_id
     and th.agency_id IN (SELECT public.viewer_agency_ids())));

drop policy if exists "tenant rw threads" on public.threads;
create policy "tenant rw threads" on public.threads
  for all to authenticated
  using       (public.is_super_admin() OR agency_id IS NULL OR agency_id IN (SELECT public.viewer_agency_ids()))
  with check  (public.is_super_admin() OR agency_id IN (SELECT public.viewer_agency_ids()));

drop policy if exists "tenant rw touchpoints" on public.touchpoints;
create policy "tenant rw touchpoints" on public.touchpoints
  for all to authenticated
  using (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = touchpoints.lead_pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())))
  with check (public.is_super_admin() OR exists (
    select 1 from public.pipeline p where p.id = touchpoints.lead_pipeline_id
     and p.agency_id IN (SELECT public.viewer_agency_ids())));

-- ── PASS 2 + 3 (drop the leaks; scoped policies above now gate writes) ──
drop policy if exists "auth write attributions"       on public.attributions;
drop policy if exists "auth write clients"            on public.clients;
drop policy if exists "auth write touchpoints"        on public.touchpoints;
drop policy if exists "auth write nigos"              on public.nigos;
drop policy if exists "auth write message_reads"      on public.message_reads;
drop policy if exists "auth write households"         on public.households;
drop policy if exists "auth write interviews"         on public.interviews;
drop policy if exists "auth write followup_rules"     on public.followup_rules;
drop policy if exists "auth write forecast_overrides" on public.forecast_overrides;
drop policy if exists "auth write forecast_runs"      on public.forecast_runs;
drop policy if exists "auth write agent_runs"         on public.agent_runs;
drop policy if exists "auth write sequences"          on public.sequences;
drop policy if exists "auth write aep_periods"        on public.aep_periods;
drop policy if exists "auth write lead_sources"       on public.lead_sources;
drop policy if exists "auth write nigo_reasons"       on public.nigo_reasons;
drop policy if exists "auth write carriers"           on public.carriers;
drop policy if exists "auth write products"           on public.products;
drop policy if exists "auth write messages"           on public.messages;
drop policy if exists "auth write threads"            on public.threads;
drop policy if exists "auth write notifications"      on public.notifications;
drop policy if exists "auth write recruits"           on public.recruits;
drop policy if exists "auth write coaching_notes"     on public.coaching_notes;
drop policy if exists "auth write coaching_sessions"  on public.coaching_sessions;
drop policy if exists "auth write thread_members"     on public.thread_members;

-- ── 0052 (recruits funnel columns — separate tracker entry; included here
--    for completeness on a fresh-DB run path) ──
alter table public.recruits add column if not exists stage text
  check (stage in ('Applied','Discovery','Onboarding','Licensed')) default 'Applied';
alter table public.recruits add column if not exists applied_at    timestamptz default now();
alter table public.recruits add column if not exists discovery_at  timestamptz;
alter table public.recruits add column if not exists onboarded_at  timestamptz;
alter table public.recruits add column if not exists licensed_at   timestamptz;
alter table public.recruits add column if not exists owner_rep_id  text references public.reps(id);
create index if not exists recruits_agency_stage_idx on public.recruits(agency_id, stage);
