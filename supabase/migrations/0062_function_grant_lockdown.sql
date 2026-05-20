-- 0062_function_grant_lockdown.sql
--
-- Resolves Supabase Security Advisor warnings:
--   *_security_definer_function_executable (105 warnings, 53 unique functions)
--
-- Strategy: REVOKE ALL on every flagged function from PUBLIC + anon +
-- authenticated, then GRANT EXECUTE back to the minimal role set required
-- by the actual caller (frontend RPC, server route, or trigger).
--
-- Idempotent: REVOKE ALL is safe to re-run; GRANT EXECUTE is too.
-- Classification source: audit cross-referencing pg_proc ACLs +
-- grep of all `sb.rpc("...")` / `await rpc("...")` / `/rest/v1/rpc/...`
-- call sites in the frontend (page-*.jsx), backend (api/**), and shell
-- installers (install.sh, agent-runner.sh).
--
-- See companion audit doc for per-function rationale.

begin;

-- ===========================================================================
-- TRIGGER FUNCTIONS — never invoked as RPC. Triggers fire under the table
-- owner regardless of caller role, so EXECUTE grant to app roles is unneeded.
-- ===========================================================================

revoke all on function public.profiles_updated_at()                       from public, anon, authenticated;
grant execute on function public.profiles_updated_at()                    to postgres, service_role;

revoke all on function public.handle_new_user_profile()                   from public, anon, authenticated;
grant execute on function public.handle_new_user_profile()                to postgres, service_role;

revoke all on function public.tg_agency_members_ensure_rep()              from public, anon, authenticated;
grant execute on function public.tg_agency_members_ensure_rep()           to postgres, service_role;

revoke all on function public.training_courses_set_updated_at()           from public, anon, authenticated;
grant execute on function public.training_courses_set_updated_at()        to postgres, service_role;

revoke all on function public.vault_segments_set_updated_at()             from public, anon, authenticated;
grant execute on function public.vault_segments_set_updated_at()          to postgres, service_role;

revoke all on function public.vault_starter_after_agency_insert()         from public, anon, authenticated;
grant execute on function public.vault_starter_after_agency_insert()      to postgres, service_role;

-- ===========================================================================
-- ANON-NEEDED — must remain callable pre-auth (shell installer using anon
-- publishable key, magic-link / invite redemption, anonymous demo identity).
-- ===========================================================================

revoke all on function public.me()                                        from public;
grant execute on function public.me()                                     to anon, authenticated;

revoke all on function public.downline_of(text)                           from public;
grant execute on function public.downline_of(text)                        to anon, authenticated;

revoke all on function public.redeem_invite(text)                         from public;
grant execute on function public.redeem_invite(text)                      to anon, authenticated;

revoke all on function public.enroll_host(text, text, text, text)         from public;
grant execute on function public.enroll_host(text, text, text, text)      to anon, authenticated;

revoke all on function public.heartbeat_host(text, integer)               from public;
grant execute on function public.heartbeat_host(text, integer)            to anon, authenticated;

revoke all on function public.host_pull_deployments(text)                 from public;
grant execute on function public.host_pull_deployments(text)              to anon, authenticated;

revoke all on function public.host_post_run(uuid, text, text, text, text, integer, integer) from public;
grant execute on function public.host_post_run(uuid, text, text, text, text, integer, integer) to anon, authenticated;

revoke all on function public.rba_redeem_install_token(text, text, text, text, integer, text, text[]) from public;
grant execute on function public.rba_redeem_install_token(text, text, text, text, integer, text, text[]) to anon, authenticated;

-- ===========================================================================
-- AUTH-ONLY — called by signed-in user via frontend RPC or app-server route
-- forwarding the user JWT. Anon must be denied.
-- ===========================================================================

revoke all on function public.approve_carrier_scrape_finding(uuid, text)              from public, anon;
grant execute on function public.approve_carrier_scrape_finding(uuid, text)           to authenticated;

revoke all on function public.complete_onboarding_step(uuid, text, jsonb)             from public, anon;
grant execute on function public.complete_onboarding_step(uuid, text, jsonb)          to authenticated;

revoke all on function public.create_agency(text, text, text)                         from public, anon;
grant execute on function public.create_agency(text, text, text)                      to authenticated;

revoke all on function public.create_agency_for_owner(jsonb)                          from public, anon;
grant execute on function public.create_agency_for_owner(jsonb)                       to authenticated;

revoke all on function public.create_inbound_lead_source(uuid, text, text, text, integer, jsonb, text) from public, anon;
grant execute on function public.create_inbound_lead_source(uuid, text, text, text, integer, jsonb, text) to authenticated;

revoke all on function public.create_notification(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, text, text, text) to authenticated;

revoke all on function public.current_agency_id()                                     from public, anon;
grant execute on function public.current_agency_id()                                  to authenticated;

revoke all on function public.downline_agency_ids()                                   from public, anon;
grant execute on function public.downline_agency_ids()                                to authenticated;

revoke all on function public.get_my_profile()                                        from public, anon;
grant execute on function public.get_my_profile()                                     to authenticated;

revoke all on function public.is_super_admin()                                        from public, anon;
grant execute on function public.is_super_admin()                                     to authenticated;

revoke all on function public.log_audit(uuid, text, text, jsonb, text)                from public, anon;
grant execute on function public.log_audit(uuid, text, text, jsonb, text)             to authenticated;

revoke all on function public.manager_pnl_snapshot(uuid, date, date, text)            from public, anon;
grant execute on function public.manager_pnl_snapshot(uuid, date, date, text)         to authenticated;

revoke all on function public.mark_all_notifications_read(uuid)                       from public, anon;
grant execute on function public.mark_all_notifications_read(uuid)                    to authenticated;

revoke all on function public.mark_notification_read(uuid)                            from public, anon;
grant execute on function public.mark_notification_read(uuid)                         to authenticated;

revoke all on function public.mint_invite(uuid, text, text, text)                     from public, anon;
grant execute on function public.mint_invite(uuid, text, text, text)                  to authenticated;

revoke all on function public.provision_rep_for_member(text, text, text, text, text, text[], text[]) from public, anon;
grant execute on function public.provision_rep_for_member(text, text, text, text, text, text[], text[]) to authenticated;

revoke all on function public.provision_sub_agency(text, text, text, text, text, text)        from public, anon;
grant execute on function public.provision_sub_agency(text, text, text, text, text, text)     to authenticated;

revoke all on function public.provision_sub_agency(text, text, text, text, text, text, text)  from public, anon;
grant execute on function public.provision_sub_agency(text, text, text, text, text, text, text) to authenticated;

revoke all on function public.rba_complete_command(uuid, text, jsonb, text)           from public, anon;
grant execute on function public.rba_complete_command(uuid, text, jsonb, text)        to authenticated, service_role;

revoke all on function public.rba_issue_install_token(text)                           from public, anon;
grant execute on function public.rba_issue_install_token(text)                        to authenticated;

revoke all on function public.rba_post_command(uuid, text, jsonb)                     from public, anon;
grant execute on function public.rba_post_command(uuid, text, jsonb)                  to authenticated;

revoke all on function public.rba_request_confirmation(uuid, uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.rba_request_confirmation(uuid, uuid, text, text, jsonb, text) to authenticated, service_role;

revoke all on function public.rba_resolve_confirmation(uuid, text)                    from public, anon;
grant execute on function public.rba_resolve_confirmation(uuid, text)                 to authenticated;

revoke all on function public.rba_revoke_install(uuid)                                from public, anon;
grant execute on function public.rba_revoke_install(uuid)                             to authenticated;

revoke all on function public.reject_carrier_scrape_finding(uuid, text, text)         from public, anon;
grant execute on function public.reject_carrier_scrape_finding(uuid, text, text)      to authenticated;

revoke all on function public.save_profile(jsonb)                                     from public, anon;
grant execute on function public.save_profile(jsonb)                                  to authenticated;

revoke all on function public.security_advisor_report()                               from public, anon;
grant execute on function public.security_advisor_report()                            to authenticated;

revoke all on function public.start_agency_onboarding(uuid)                           from public, anon;
grant execute on function public.start_agency_onboarding(uuid)                        to authenticated;

revoke all on function public.suggested_agents_for_role(text)                         from public, anon;
grant execute on function public.suggested_agents_for_role(text)                      to authenticated;

revoke all on function public.update_agency_onboarding(uuid, jsonb)                   from public, anon;
grant execute on function public.update_agency_onboarding(uuid, jsonb)                to authenticated;

revoke all on function public.user_is_in_demo()                                       from public, anon;
grant execute on function public.user_is_in_demo()                                    to authenticated;

revoke all on function public.viewer_agency_id_array()                                from public, anon;
grant execute on function public.viewer_agency_id_array()                             to authenticated;

revoke all on function public.viewer_agency_ids()                                     from public, anon;
grant execute on function public.viewer_agency_ids()                                  to authenticated;

revoke all on function public.viewer_is_manager_in(uuid)                              from public, anon;
grant execute on function public.viewer_is_manager_in(uuid)                           to authenticated;

revoke all on function public.viewer_owner_agency_ids()                               from public, anon;
grant execute on function public.viewer_owner_agency_ids()                            to authenticated;

revoke all on function public.viewer_role_in(uuid)                                    from public, anon;
grant execute on function public.viewer_role_in(uuid)                                 to authenticated;

revoke all on function public.write_audit(text, text, jsonb)                          from public, anon;
grant execute on function public.write_audit(text, text, jsonb)                       to authenticated;

-- ===========================================================================
-- SERVICE-ROLE-ONLY — invoked exclusively by Vercel API routes (service key),
-- Stripe webhooks, or cron jobs. App roles must not be able to call.
-- ===========================================================================

revoke all on function public.connector_health_set(uuid, text, text, text, integer)   from public, anon, authenticated;
grant execute on function public.connector_health_set(uuid, text, text, text, integer) to service_role;

revoke all on function public.connector_upsert_token(text, text, text, text, text, jsonb, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.connector_upsert_token(text, text, text, text, text, jsonb, text[], timestamptz) to service_role;

revoke all on function public.invite_health_snapshot()                                from public, anon, authenticated;
grant execute on function public.invite_health_snapshot()                             to service_role;

revoke all on function public.rba_claim_command(uuid)                                 from public, anon, authenticated;
grant execute on function public.rba_claim_command(uuid)                              to service_role;

revoke all on function public.reset_demo_agency(text)                                 from public, anon, authenticated;
grant execute on function public.reset_demo_agency(text)                              to service_role;

revoke all on function public.sms_outbox_expire_stale()                               from public, anon, authenticated;
grant execute on function public.sms_outbox_expire_stale()                            to service_role;

revoke all on function public.upsert_agency_subscription(text, text, text, timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.upsert_agency_subscription(text, text, text, timestamptz, timestamptz, integer, uuid) to service_role;

revoke all on function public.vault_seed_starter_for_agency(uuid)                     from public, anon, authenticated;
grant execute on function public.vault_seed_starter_for_agency(uuid)                  to service_role;

commit;
