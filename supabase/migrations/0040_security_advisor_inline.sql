-- 0040_security_advisor_inline.sql
-- Inline security advisor so /admin/security can render real findings without
-- depending on the external Supabase Management API. Returns the same shape
-- Supabase's advisor does:
--   { kind, severity, name, table_name, message, cvss_band, remediation }
--
-- Bands map to CVSS-like ranges:
--   ERROR → 7.0–9.9 (High/Critical)
--   WARN  → 4.0–6.9 (Medium)
--   INFO  → 0.1–3.9 (Low)
--
-- super_admin-only read. Reps + managers cannot see this.

create or replace function public.security_advisor_report()
returns table(
  kind text,
  severity text,
  cvss_band text,
  name text,
  schema_name text,
  table_name text,
  message text,
  remediation text
)
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_role text;
begin
  select role into v_role from public.me() limit 1;
  if v_role is null or v_role <> 'super_admin' then
    return;
  end if;

  -- A. Tables in `public` without RLS enabled.
  return query
  select 'rls_disabled'::text          as kind,
         'ERROR'::text                  as severity,
         'High (7.5)'::text             as cvss_band,
         'rls_disabled_in_public'::text as name,
         t.schemaname::text             as schema_name,
         t.tablename::text              as table_name,
         format('Table %I.%I has no RLS enabled. Any authenticated query against PostgREST returns every row.', t.schemaname, t.tablename) as message,
         'ALTER TABLE ' || t.schemaname || '.' || t.tablename || ' ENABLE ROW LEVEL SECURITY;' as remediation
    from pg_tables t
    join pg_class c on c.relname = t.tablename and c.relnamespace = (select oid from pg_namespace where nspname = t.schemaname)
   where t.schemaname = 'public'
     and not c.relrowsecurity
     and t.tablename not like 'pg_%';

  -- B. RLS-enabled tables WITH zero policies.
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

  -- C. Policies with permissive `using (true)` that don't reference an agency/user scoping helper.
  return query
  select 'policy_permissive_true', 'ERROR', 'Critical (9.1)', 'policy_all_authenticated',
         p.schemaname::text, p.tablename::text,
         format('Policy "%s" on %I.%I uses USING (true) — every authenticated request returns every row.', p.policyname, p.schemaname, p.tablename),
         'Rewrite the policy USING clause to scope by agency / role / user_id.'
    from pg_policies p
   where p.schemaname = 'public'
     and p.qual ilike '%true%' and p.qual !~ '\b(viewer_agency_ids|viewer_role_in|viewer_is_manager_in|agency_id|user_id|auth\.uid|me\(\))\b';

  -- D. SECURITY DEFINER functions in public without pinned search_path.
  return query
  select 'func_no_searchpath', 'WARN', 'Medium (6.1)', 'function_security_definer_no_searchpath',
         n.nspname::text, p.proname::text,
         format('Function %I.%I is SECURITY DEFINER but does not pin search_path — a malicious user with create privilege on a referenced schema could intercept.', n.nspname, p.proname),
         'ALTER FUNCTION ' || n.nspname || '.' || p.proname || '(...) SET search_path = public, pg_temp;'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (p.proconfig is null or not exists (
       select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
     ));

  -- E. Auth-sensitive table names exposed to PostgREST.
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
$$;

grant execute on function public.security_advisor_report() to authenticated;
