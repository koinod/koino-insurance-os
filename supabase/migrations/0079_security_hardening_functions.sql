-- 0079_security_hardening_functions.sql
-- Security-advisor hardening (all WARN-level, no behavior change):
--  1. Pin search_path on SECURITY DEFINER functions flagged
--     function_search_path_mutable — prevents search_path hijacking.
--  2. Revoke direct REST EXECUTE (anon, authenticated) on INTERNAL
--     functions (_-prefixed trigger/provision helpers). Triggers and
--     internal callers do NOT check EXECUTE, so this only removes the
--     /rest/v1/rpc/* attack surface — no functional change.

alter function public._carrier_short_id(text)                 set search_path = public, pg_temp;
alter function public._set_agency_carrier_appts_updated_at()  set search_path = public, pg_temp;
alter function public._set_carrier_requests_updated_at()      set search_path = public, pg_temp;
alter function public._provision_carriers_for_new_agency()    set search_path = public, pg_temp;
alter function public._seed_agency_carrier_appointments()     set search_path = public, pg_temp;
alter function public._t_policies_override_commissions()      set search_path = public, pg_temp;
alter function public._t_policies_owner_commission()          set search_path = public, pg_temp;
alter function public._t_set_ledger_agency_id()               set search_path = public, pg_temp;

-- Revoke from PUBLIC (Postgres default grant that anon/authenticated inherit)
-- as well as the roles explicitly. service_role keeps EXECUTE (trusted backend).
revoke execute on function public._provision_carriers_for_new_agency() from public, anon, authenticated;
revoke execute on function public._seed_agency_carrier_appointments()  from public, anon, authenticated;
revoke execute on function public._t_policies_override_commissions()   from public, anon, authenticated;
revoke execute on function public._t_policies_owner_commission()       from public, anon, authenticated;
revoke execute on function public._t_set_ledger_agency_id()            from public, anon, authenticated;
