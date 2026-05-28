-- 0076_close_cross_tenant_read_leaks_permissive_true
-- Applied to prod via apply_migration (MCP = source of truth); this file mirrors it.
--
-- Cross-tenant READ leaks: each table below had a permissive SELECT (or
-- anon+auth) policy with USING (true). PostgreSQL OR-combines permissive
-- policies, so that `true` policy overrode the properly-scoped `tenant rw` /
-- `tenant write` (ALL) sibling — every authenticated user read every agency's
-- rows (client PII, households, messages, coaching notes, recruiting, etc.).
--
-- Each table retains a scoped policy that already covers SELECT (cmd=ALL,
-- scoped by is_super_admin() OR agency_id IN viewer_agency_ids(), an EXISTS join
-- for child tables, or a role+downline scope for coaching_*). Dropping the
-- redundant USING(true) policy closes the leak with no loss of legitimate
-- access. Verified each sibling before writing this migration.
--
-- NOTE: the anon-key policies on auto_quote_requests / auto_quote_results /
-- auto_quoter_settings / carrier_sessions / call_recordings are intentionally
-- NOT touched here — they are load-bearing for quote_agent.py, which talks to
-- PostgREST with the PUBLIC anon key. Tightening them requires re-architecting
-- that daemon onto a per-rep scoped token (tracked as a follow-up).

drop policy if exists "auth read attributions"        on public.attributions;
drop policy if exists "auth read clients"             on public.clients;
drop policy if exists "auth read coaching_notes"      on public.coaching_notes;
drop policy if exists "auth read coaching_sessions"   on public.coaching_sessions;
drop policy if exists "auth read followup_rules"      on public.followup_rules;
drop policy if exists "auth read forecast_overrides"  on public.forecast_overrides;
drop policy if exists "auth read forecast_runs"       on public.forecast_runs;
drop policy if exists "auth read households"          on public.households;
drop policy if exists "auth read interviews"          on public.interviews;
drop policy if exists "auth read message_reads"       on public.message_reads;
drop policy if exists "auth read messages"            on public.messages;
drop policy if exists "auth read nigos"               on public.nigos;
drop policy if exists "auth read nigo"                on public.nigo_items;
drop policy if exists "auth read notifications"       on public.notifications;
drop policy if exists "auth read recruits"            on public.recruits;
drop policy if exists "auth read sequences"           on public.sequences;
drop policy if exists "auth read thread_members"      on public.thread_members;
drop policy if exists "auth read threads"             on public.threads;
drop policy if exists "auth read touchpoints"         on public.touchpoints;
drop policy if exists "anyone read org_settings"      on public.org_settings;

-- activity_log: global audit log (actor_email + diff, no tenant column). USING
-- (true) for authenticated let any user read every agency's audit trail. No
-- scoped sibling, so restrict the read to super_admin (audit data is admin tooling).
drop policy if exists "authed read activity" on public.activity_log;
create policy "authed read activity" on public.activity_log
  as permissive for select to authenticated
  using (is_super_admin());

-- Verify: none of these tables still expose a literal USING(true) read to a
-- non-service role.
do $$
declare leak_count int;
begin
  select count(*) into leak_count
    from pg_policies
   where schemaname='public'
     and tablename in ('attributions','clients','coaching_notes','coaching_sessions',
                       'followup_rules','forecast_overrides','forecast_runs','households',
                       'interviews','message_reads','messages','nigos','nigo_items',
                       'notifications','recruits','sequences','thread_members','threads',
                       'touchpoints','org_settings','activity_log')
     and btrim(qual)='true'
     and not ('service_role' = any(roles));
  if leak_count <> 0 then
    raise exception 'expected 0 residual permissive-true policies on these tables, found %', leak_count;
  end if;
end $$;
