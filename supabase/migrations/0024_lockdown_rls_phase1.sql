-- 0024_lockdown_rls_phase1.sql
--
-- Phase 1 multi-tenancy lockdown.
--
-- Closes two classes of leak found by `pg_policies` audit on 2026-05-09:
--   1. Tables that exposed `anon read true` on tenant-owned data
--      (notifications, messages, payouts, tasks, leads, NIGOs, ...).
--      Anyone hitting `/rest/v1/<table>` with the public anon key could
--      read every row across every agency.
--   2. Tables whose `authenticated` SELECT/ALL policies used `qual=true`,
--      meaning any signed-in user could read or mutate any other agency's
--      data. Replaced with scoping against `viewer_agency_ids()` (the
--      existing SECURITY DEFINER helper that returns the caller's
--      agency set, with super-admin returning all).
--
-- Tables WITHOUT a direct `agency_id` column (recruits, threads,
-- notifications, sequences, forecast_*, followup_rules, interviews,
-- households, clients, attributions, touchpoints, nigos) need either
-- column backfill or FK-join policies; deferred to migration
-- 0025_lockdown_rls_phase2.sql so this one stays mechanical and
-- reviewable.
--
-- Reference reads on truly global catalogs stay anon-readable:
--   aep_periods, nigo_reasons, lead_sources, carriers, products,
--   sequences (catalog shape), followup_templates (when not yet
--   agency-scoped). These are explicitly listed at the bottom.
--
-- Agent-token tables keep their anon write paths (agent_install_tokens,
-- auto_quote_*, call_recordings, carrier_sessions); a future migration
-- will validate the install token instead of relying on `qual=true`.
--

set local search_path = public;

-- =============================================================
-- A) ANON READ LOCKDOWN — drop policies that grant unauthenticated
--    access to tenant-owned tables.
-- =============================================================

drop policy if exists "anon read aep_assignments"     on public.aep_assignments;
drop policy if exists "anon read agent_deployments"   on public.agent_deployments;
drop policy if exists "anon read agent_runs"          on public.agent_runs;
drop policy if exists "anon read attributions"        on public.attributions;
drop policy if exists "anon read book_entries"        on public.book_entries;
drop policy if exists "anon read carrier_appointments" on public.carrier_appointments;
drop policy if exists "anon read clawbacks"           on public.clawbacks;
drop policy if exists "anon read clients"             on public.clients;
drop policy if exists "anon read coaching_notes"      on public.coaching_notes;
drop policy if exists "anon read coaching_sessions"   on public.coaching_sessions;
drop policy if exists "anon read followup_rules"      on public.followup_rules;
drop policy if exists "anon read forecast_overrides"  on public.forecast_overrides;
drop policy if exists "anon read forecast_runs"       on public.forecast_runs;
drop policy if exists "anon read households"          on public.households;
drop policy if exists "anon read interviews"          on public.interviews;
drop policy if exists "anon read message_reads"       on public.message_reads;
drop policy if exists "anon read messages"            on public.messages;
drop policy if exists "anon read nigos"               on public.nigos;
drop policy if exists "anon read notifications"       on public.notifications;
drop policy if exists "anon read payouts"             on public.payouts;
drop policy if exists "anon read recruits"            on public.recruits;
drop policy if exists "anon read sequence_enrollments" on public.sequence_enrollments;
drop policy if exists "anon read sequences"           on public.sequences;
drop policy if exists "anon read tasks"               on public.tasks;
drop policy if exists "anon read thread_members"      on public.thread_members;
drop policy if exists "anon read threads"             on public.threads;
drop policy if exists "anon read tier_changes"        on public.tier_changes;
drop policy if exists "anon read tiering_overrides"   on public.tiering_overrides;
drop policy if exists "anon read touchpoints"         on public.touchpoints;
drop policy if exists "anon read vault_files"         on public.vault_files;

-- agency_audit_log was readable by both anon and authenticated under one
-- policy; replace with auth-only and gate to super_admin or the agency's
-- own audit trail.
drop policy if exists "agent reads audit"             on public.agency_audit_log;
drop policy if exists "agent writes audit"            on public.agency_audit_log;
create policy "auth read agency_audit_log_scoped" on public.agency_audit_log
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth insert agency_audit_log_scoped" on public.agency_audit_log
  for insert to authenticated
  with check ( agency_id = ANY (public.viewer_agency_ids()) );

-- agency_expenses had `anon expenses ops ALL true` — drop entirely.
drop policy if exists "anon expenses ops"             on public.agency_expenses;

-- agencies had `anon manages agencies for admin ALL true` — that is the
-- "any anon caller can create/update/delete any agency" hole. Drop it.
-- Owner-write policy already exists and is correctly scoped.
drop policy if exists "anon manages agencies for admin" on public.agencies;
drop policy if exists "anon reads agency setup"       on public.agencies;
-- New: anon needs to read agencies during the invite-redeem flow only.
-- We allow read by id ONLY if there's a matching unredeemed invite for
-- the requesting session. PostgREST anon callers don't have a session,
-- so the safer pattern is to surface the agency name in the redeem RPC
-- itself rather than via a SELECT. For now: deny anon entirely.

-- =============================================================
-- B) AUTHENTICATED SCOPE FIX — replace `qual=true` with
--    `agency_id = ANY (viewer_agency_ids())` on tables that have a
--    direct agency_id column.
-- =============================================================

-- agent_deployments
drop policy if exists "auth read agent_deployments"  on public.agent_deployments;
drop policy if exists "auth write agent_deployments" on public.agent_deployments;
create policy "auth read agent_deployments" on public.agent_deployments
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth write agent_deployments" on public.agent_deployments
  for all to authenticated
  using  ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) )
  with check ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- agent_runs
drop policy if exists "authed read agent_runs" on public.agent_runs;
drop policy if exists "auth read agent_runs"   on public.agent_runs;
create policy "auth read agent_runs" on public.agent_runs
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- agent_install_tokens — tighten authenticated reads to caller's agency.
-- Anon write path stays via agent token redemption (separate policy).
drop policy if exists "auth read agent_install_tokens"  on public.agent_install_tokens;
drop policy if exists "authed read tokens"              on public.agent_install_tokens;
drop policy if exists "auth write agent_install_tokens" on public.agent_install_tokens;
create policy "auth read agent_install_tokens" on public.agent_install_tokens
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth write agent_install_tokens" on public.agent_install_tokens
  for all to authenticated
  using  ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) )
  with check ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- agency_expenses
drop policy if exists "authed read agency_expenses"  on public.agency_expenses;
drop policy if exists "authed write agency_expenses" on public.agency_expenses;
create policy "auth read agency_expenses" on public.agency_expenses
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth write agency_expenses" on public.agency_expenses
  for all to authenticated
  using  ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) )
  with check ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- automation_runs
drop policy if exists "auth read agency"  on public.automation_runs;
drop policy if exists "auth insert"       on public.automation_runs;
create policy "auth read automation_runs" on public.automation_runs
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth insert automation_runs" on public.automation_runs
  for insert to authenticated
  with check ( agency_id = ANY (public.viewer_agency_ids()) );

-- automation_rules SELECT was true; the existing ALL policy is already
-- scoped via me().role inside CASE — keep that, just fix SELECT.
drop policy if exists "auth read agency" on public.automation_rules;
create policy "auth read automation_rules" on public.automation_rules
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- cross_sell_queue / cross_sell_rules
drop policy if exists "auth read agency" on public.cross_sell_queue;
drop policy if exists "auth read agency" on public.cross_sell_rules;
create policy "auth read cross_sell_queue" on public.cross_sell_queue
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth read cross_sell_rules" on public.cross_sell_rules
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- followup_runs / followup_templates
drop policy if exists "auth insert own"  on public.followup_runs;
drop policy if exists "auth read agency" on public.followup_runs;
create policy "auth read followup_runs" on public.followup_runs
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth insert followup_runs" on public.followup_runs
  for insert to authenticated
  with check ( agency_id = ANY (public.viewer_agency_ids()) );

drop policy if exists "auth read agency" on public.followup_templates;
create policy "auth read followup_templates" on public.followup_templates
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- onboarding_progress
drop policy if exists "auth read agency" on public.onboarding_progress;
create policy "auth read onboarding_progress" on public.onboarding_progress
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- quote_runs
drop policy if exists "auth insert"       on public.quote_runs;
drop policy if exists "auth read agency"  on public.quote_runs;
create policy "auth read quote_runs" on public.quote_runs
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth insert quote_runs" on public.quote_runs
  for insert to authenticated
  with check ( agency_id = ANY (public.viewer_agency_ids()) );

-- sequence_enrollments (it had agency_id and owner_rep_id)
drop policy if exists "auth read sequence_enrollments"  on public.sequence_enrollments;
drop policy if exists "auth write sequence_enrollments" on public.sequence_enrollments;
create policy "auth read sequence_enrollments" on public.sequence_enrollments
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth write sequence_enrollments" on public.sequence_enrollments
  for all to authenticated
  using  ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) )
  with check ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- tiering_overrides (agency_id, rep_id)
drop policy if exists "auth read tiering_overrides"  on public.tiering_overrides;
drop policy if exists "auth write tiering_overrides" on public.tiering_overrides;
create policy "auth read tiering_overrides" on public.tiering_overrides
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );
create policy "auth write tiering_overrides" on public.tiering_overrides
  for all to authenticated
  using  ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) )
  with check ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- vault_artifacts (agency_id, rep_id)
drop policy if exists "auth read vault" on public.vault_artifacts;
create policy "auth read vault_artifacts" on public.vault_artifacts
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- workflow_assignments (agency_id, rep_id)
drop policy if exists "auth read own agency" on public.workflow_assignments;
create policy "auth read workflow_assignments" on public.workflow_assignments
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- =============================================================
-- C) Tables scoped via reps.agency_id (rep_id FK).
--    Helper inline: rep_id IN (rep ids in caller's agencies).
-- =============================================================

-- aep_assignments (rep_id only)
drop policy if exists "auth read aep_assignments"  on public.aep_assignments;
drop policy if exists "auth write aep_assignments" on public.aep_assignments;
create policy "auth read aep_assignments" on public.aep_assignments
  for select to authenticated
  using (
    public.is_super_admin() OR rep_id IN (
      select r.rep_id from public.reps r
      where r.agency_id = ANY (public.viewer_agency_ids())
    )
  );
create policy "auth write aep_assignments" on public.aep_assignments
  for all to authenticated
  using  (
    public.is_super_admin() OR rep_id IN (
      select r.rep_id from public.reps r
      where r.agency_id = ANY (public.viewer_agency_ids())
    )
  )
  with check (
    rep_id IN (
      select r.rep_id from public.reps r
      where r.agency_id = ANY (public.viewer_agency_ids())
    )
  );

-- book_entries (rep_id only)
drop policy if exists "auth read book_entries"  on public.book_entries;
drop policy if exists "auth write book_entries" on public.book_entries;
create policy "auth read book_entries" on public.book_entries
  for select to authenticated
  using (
    public.is_super_admin() OR rep_id IN (
      select r.rep_id from public.reps r
      where r.agency_id = ANY (public.viewer_agency_ids())
    )
  );
create policy "auth write book_entries" on public.book_entries
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- carrier_appointments (rep_id only)
drop policy if exists "auth read carrier_appointments"  on public.carrier_appointments;
drop policy if exists "auth write carrier_appointments" on public.carrier_appointments;
create policy "auth read carrier_appointments" on public.carrier_appointments
  for select to authenticated
  using ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );
create policy "auth write carrier_appointments" on public.carrier_appointments
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- clawbacks (rep_id only)
drop policy if exists "auth read clawbacks"  on public.clawbacks;
drop policy if exists "auth write clawbacks" on public.clawbacks;
create policy "auth read clawbacks" on public.clawbacks
  for select to authenticated
  using ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );
create policy "auth write clawbacks" on public.clawbacks
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- payouts (rep_id only)
drop policy if exists "auth read payouts"  on public.payouts;
drop policy if exists "auth write payouts" on public.payouts;
create policy "auth read payouts" on public.payouts
  for select to authenticated
  using ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );
create policy "auth write payouts" on public.payouts
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- tasks (rep_id only)
drop policy if exists "auth read tasks"  on public.tasks;
drop policy if exists "auth write tasks" on public.tasks;
create policy "auth read tasks" on public.tasks
  for select to authenticated
  using ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );
create policy "auth write tasks" on public.tasks
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- tier_changes (rep_id only)
drop policy if exists "auth read tier_changes"  on public.tier_changes;
drop policy if exists "auth write tier_changes" on public.tier_changes;
create policy "auth read tier_changes" on public.tier_changes
  for select to authenticated
  using ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );
create policy "auth write tier_changes" on public.tier_changes
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- vault_files (rep_id only)
drop policy if exists "auth read vault_files"  on public.vault_files;
drop policy if exists "auth write vault_files" on public.vault_files;
create policy "auth read vault_files" on public.vault_files
  for select to authenticated
  using ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );
create policy "auth write vault_files" on public.vault_files
  for all to authenticated
  using  ( public.is_super_admin() OR rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) )
  with check ( rep_id IN (select r.rep_id from public.reps r where r.agency_id = ANY (public.viewer_agency_ids())) );

-- =============================================================
-- D) Notification recipient tables — notifications has
--    `recipient_handle` (text), notification_prefs has user_id.
--    notification_prefs is per-user; safe to scope by auth.uid().
-- =============================================================

drop policy if exists "auth read notif_prefs"  on public.notification_prefs;
drop policy if exists "auth write notif_prefs" on public.notification_prefs;
create policy "auth read own notification_prefs" on public.notification_prefs
  for select to authenticated
  using ( public.is_super_admin() OR user_id = auth.uid() );
create policy "auth write own notification_prefs" on public.notification_prefs
  for all to authenticated
  using  ( public.is_super_admin() OR user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- =============================================================
-- E) Catalog tables that are intentionally global stay anon-readable.
--    Document them so the next reviewer doesn't think we missed them.
-- =============================================================
--   aep_periods              (calendar reference)
--   nigo_reasons             (reason catalog)
--   lead_sources             (vendor catalog; per-agency join lives in agency_lead_sources)
--   carriers                 (currently has agency_id; phase 2 will scope it)
--   products                 (currently has agency_id; phase 2 will scope it)
--   sequences                (will move to per-agency in phase 2)
--   followup_templates       (will move to per-agency in phase 2)

-- =============================================================
-- F) Sanity: confirm no policy is left with `qual='true'` on the tables
--    we just touched. (NOTE: assertion done out-of-band via pg_policies;
--    no DDL here.)
-- =============================================================
