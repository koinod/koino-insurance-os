-- 0081_rls_helpers_and_persistency_rpc.sql
-- Foundational helpers for the rep-vs-manager financial RLS split (0082):
--  - is_agency_manager_or_above(agency): caller is owner/admin/manager/imo
--  - my_rep_id_in_agency(agency): caller's rep_id in that agency (NULL if not a rep)
--
-- Plus persistency_by_rep — SECURITY DEFINER aggregate so the rep-facing
-- Performance page can render per-rep persistency rankings WITHOUT row-
-- reading peers' policies. Aggregate-only exposure (count + %), no raw rows.

create or replace function public.is_agency_manager_or_above(p_agency_id uuid)
returns boolean
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.agency_members m
    where m.user_id  = auth.uid()
      and m.agency_id = p_agency_id
      and m.active
      and m.role in ('owner','admin','manager','imo_owner')
  );
$$;
revoke execute on function public.is_agency_manager_or_above(uuid) from public, anon;
grant  execute on function public.is_agency_manager_or_above(uuid) to authenticated;

create or replace function public.my_rep_id_in_agency(p_agency_id uuid)
returns text
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select r.id from public.reps r
  where r.user_id   = auth.uid()
    and r.agency_id = p_agency_id
  limit 1;
$$;
revoke execute on function public.my_rep_id_in_agency(uuid) from public, anon;
grant  execute on function public.my_rep_id_in_agency(uuid) to authenticated;

create or replace function public.persistency_by_rep(p_agency_id uuid)
returns table(rep_id text, total int, active_count int, persistency_pct numeric)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    p.owner_rep_id,
    count(*)::int,
    count(*) filter (where p.persistency_status in ('active','in_force'))::int,
    round((count(*) filter (where p.persistency_status in ('active','in_force'))::numeric
           / nullif(count(*),0)) * 100, 1)
  from public.policies p
  where p.agency_id = p_agency_id
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.agency_members m
        where m.user_id = auth.uid() and m.agency_id = p_agency_id and m.active
      )
    )
    and p.owner_rep_id is not null
  group by p.owner_rep_id;
$$;
revoke execute on function public.persistency_by_rep(uuid) from public, anon;
grant  execute on function public.persistency_by_rep(uuid) to authenticated;
