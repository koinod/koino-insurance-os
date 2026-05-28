-- 0075_security_advisor_fix_permissive_true_check
-- Applied to prod via apply_migration (MCP = source of truth); this file mirrors it.
--
-- The security_advisor_report() permissive-true check (C) had two bugs that made
-- it report ~59 false-heavy findings:
--   1. It used '\b' for word boundaries. In PostgreSQL regex '\b' is BACKSPACE
--      (word boundary is '\y'), so the scoping-token allow-list NEVER matched and
--      EVERY policy whose USING merely *contained* the substring "true" was
--      flagged — including correctly-scoped policies using
--      current_setting('...jwt...', true), active = true, is_demo = true, etc.
--   2. It flagged service_role policies (which bypass RLS by design) and did not
--      distinguish tenant tables from global reference tables.
--
-- Rewrite C: flag a policy only when its USING is LITERALLY `true` (unscoped),
-- exclude service_role, and rank severity by whether the table carries a
-- tenant-scoping column (CRITICAL for tenant tables, WARN for reference tables).
-- Checks A, B, D, E are unchanged.
create or replace function public.security_advisor_report()
 returns table(kind text, severity text, cvss_band text, name text, schema_name text, table_name text, message text, remediation text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_role text;
begin
  select role into v_role from public.me() limit 1;
  if v_role is null or v_role <> 'super_admin' then
    return;
  end if;

  -- A. Tables in `public` without RLS enabled.
  return query
  select 'rls_disabled'::text, 'ERROR'::text, 'High (7.5)'::text, 'rls_disabled_in_public'::text,
         t.schemaname::text, t.tablename::text,
         format('Table %I.%I has no RLS enabled. Any authenticated query against PostgREST returns every row.', t.schemaname, t.tablename),
         'ALTER TABLE ' || t.schemaname || '.' || t.tablename || ' ENABLE ROW LEVEL SECURITY;'
    from pg_tables t
    join pg_class c on c.relname = t.tablename and c.relnamespace = (select oid from pg_namespace where nspname = t.schemaname)
   where t.schemaname = 'public' and not c.relrowsecurity and t.tablename not like 'pg_%';

  -- B. RLS-enabled tables with zero policies.
  return query
  select 'rls_no_policy', 'WARN', 'Medium (5.3)', 'rls_enabled_no_policy',
         t.schemaname::text, t.tablename::text,
         format('Table %I.%I has RLS enabled but no policies — every authenticated query returns 0 rows. Usually a bug.', t.schemaname, t.tablename),
         'CREATE POLICY ... USING (...) — at minimum an agency-scoped read policy.'
    from pg_tables t
    join pg_class c on c.relname = t.tablename and c.relnamespace = (select oid from pg_namespace where nspname = t.schemaname)
    left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
   where t.schemaname = 'public' and c.relrowsecurity
   group by t.schemaname, t.tablename
  having count(p.policyname) = 0;

  -- C. Policies that are LITERALLY `using (true)` — unscoped. service_role
  --    bypasses RLS so its policies are excluded. CRITICAL when the table
  --    carries tenant-scoping columns; otherwise an intentional global read (WARN).
  return query
  select 'policy_permissive_true',
         case when c.tenant_scoped then 'ERROR' else 'WARN' end,
         case when c.tenant_scoped then 'Critical (9.1)' else 'Low (3.1)' end,
         'policy_all_authenticated',
         p.schemaname::text, p.tablename::text,
         case when c.tenant_scoped
              then format('Policy "%s" on %I.%I uses USING (true) on a tenant-scoped table — every request in role(s) %s returns every agency''s rows.', p.policyname, p.schemaname, p.tablename, p.roles::text)
              else format('Policy "%s" on %I.%I uses USING (true). Table has no tenant column — confirm a global read is intended.', p.policyname, p.schemaname, p.tablename) end,
         case when c.tenant_scoped
              then 'Rewrite the USING clause to scope by agency_id / rep_id / user_id (or is_super_admin()).'
              else 'Reference/lookup table — a global read may be intentional; otherwise scope it.' end
    from pg_policies p
    left join lateral (
       select bool_or(column_name in ('agency_id','rep_id','user_id','owner_rep_id')) as tenant_scoped
         from information_schema.columns
        where table_schema = 'public' and table_name = p.tablename
    ) c on true
   where p.schemaname = 'public'
     and btrim(p.qual) = 'true'
     and not ('service_role' = any(p.roles));

  -- D. SECURITY DEFINER functions in public without `set search_path`.
  return query
  select 'func_no_searchpath', 'WARN', 'Medium (6.1)', 'function_security_definer_no_searchpath',
         n.nspname::text, p.proname::text,
         format('Function %I.%I is SECURITY DEFINER but does not pin search_path — a malicious user with create privilege on a referenced schema could intercept.', n.nspname, p.proname),
         'ALTER FUNCTION ' || n.nspname || '.' || p.proname || '(...) SET search_path = public, pg_temp;'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'));

  -- E. Auth-sensitive table names in public.
  return query
  select 'auth_in_public', 'INFO', 'Low (3.1)', 'sensitive_table_in_public',
         t.schemaname::text, t.tablename::text,
         format('Table %I.%I has auth-sensitive name in public schema — exposed to PostgREST. Confirm intentional.', t.schemaname, t.tablename),
         'Move to a private schema or harden RLS.'
    from pg_tables t
   where t.schemaname = 'public'
     and (t.tablename ilike '%password%' or t.tablename ilike '%credential%' or t.tablename ilike '%secret%');

  return;
end;
$function$;
