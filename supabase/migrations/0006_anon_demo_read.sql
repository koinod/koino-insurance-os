-- 0006 anon demo read.
--
-- Grants anonymous (i.e. non-logged-in) callers SELECT-only access to
-- rows belonging to the Atlas demo agency. Lets ?demo=1 visitors see a
-- fully-rendered Insurance OS without an account.
--
-- Strategy:
--   * For every public table that has an agency_id column → add an "anon
--     atlas read" policy filtered to Atlas's id.
--   * For agencies itself → only the Atlas row is readable.
--   * For agency_members → only memberships scoped to Atlas.
--   * Tables without agency_id stay as they are (most either reference reps
--     by FK and are joinable from the agency-scoped tables, or already have
--     permissive read policies, e.g. commissions).
--
-- Atlas id is hardcoded; this is the convention the DEMO_AGENCY_ID constant
-- in api/me.js + api/copilot.js points at.

do $$
declare
  r          record;
  policy_sql text;
  atlas_id   constant text := 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9';
begin
  for r in
    select c.table_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name  = 'agency_id'
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'anon atlas read', r.table_name
    );
    execute format(
      'create policy %I on public.%I for select to anon using (agency_id::text = %L)',
      'anon atlas read', r.table_name, atlas_id
    );
  end loop;

  -- agencies has no agency_id column; gate on its own id instead.
  execute format('drop policy if exists %I on public.agencies', 'anon atlas read');
  execute format(
    'create policy %I on public.agencies for select to anon using (id::text = %L)',
    'anon atlas read', atlas_id
  );
end$$;
