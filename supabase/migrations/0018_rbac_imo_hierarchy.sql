-- 0018 RBAC Hierarchy & IMO Tier
-- 
-- Implements the "clonable tree" for access levels:
--   1. IMO (Insurance Marketing Organization) -> Sees multiple Agencies
--   2. Agency (Owner) -> Sees full Agency
--   3. Manager -> Sees recursive downline team
--   4. Rep -> Sees only own data
--
-- Fixes GAP-X4 / GAP-MD1 hardening.

------------------------------------------------------------------------------
-- 1. IMO Tables
------------------------------------------------------------------------------

create table if not exists public.imos (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

alter table public.agencies 
  add column if not exists imo_id uuid references public.imos(id) on delete set null;

create table if not exists public.imo_members (
  imo_id      uuid not null references public.imos(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'staff')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (imo_id, user_id)
);

------------------------------------------------------------------------------
-- 2. RBAC Helpers
------------------------------------------------------------------------------

-- Helper: imos the current viewer belongs to
create or replace function public.viewer_imo_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select imo_id from public.imo_members
   where user_id = auth.uid() and active = true
$$;

-- Helper: agencies the current viewer can see (Direct or via IMO)
create or replace function public.viewer_agency_ids_v2()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Direct membership
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
  union
  -- Via IMO admin/staff role
  select a.id from public.agencies a
   where a.imo_id in (select public.viewer_imo_ids())
$$;

-- Helper: get current rep_id for the viewer
create or replace function public.viewer_rep_id()
returns text
language sql
stable
security invoker
as $$
  select rep_id from public.me() limit 1;
$$;

-- Helper: recursive check if A manages B
create or replace function public.is_manager_of(manager_id text, target_id text)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1 from public.downline_of(manager_id) d
     where d.rep_id = target_id
  )
$$;

------------------------------------------------------------------------------
-- 3. Harden RLS for all data tables
------------------------------------------------------------------------------

-- Pattern:
-- 1. Owner/Admin in Agency or IMO -> Full access to agency rows.
-- 2. Manager -> Access to agency rows where owner_rep_id is in downline.
-- 3. Rep -> Access to agency rows where owner_rep_id = their rep_id.

-- We update the generic "tenant read" policies from 0015 to be more restrictive.

do $$
declare
  tbl text;
  rep_col text;
begin
  for tbl, rep_col in
    select c.relname, a_rep.attname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      -- Find tables with agency_id AND a rep reference
      join pg_attribute a_agency on a_agency.attrelid = c.oid and a_agency.attname = 'agency_id'
      join pg_attribute a_rep on a_rep.attrelid = c.oid and (a_rep.attname in ('owner_rep_id', 'rep_id', 'recruiter_id'))
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in ('agencies','agency_members','imo_members','reps')
  loop
    -- Drop old loose policy
    execute format('drop policy if exists "tenant read %s" on public.%I', tbl, tbl);
    
    -- Create new strict hierarchical policy
    execute format(
      $p$
      create policy "hierarchical read %s" on public.%I
        for select to authenticated
        using (
          -- IMO Admin sees everything in their agencies
          agency_id in (select a.id from public.agencies a where a.imo_id in (select public.viewer_imo_ids()))
          -- Agency Owner sees everything in their agency
          or (
            agency_id in (select agency_id from public.agency_members where user_id = auth.uid() and role in ('owner','admin') and active = true)
          )
          -- Manager/Rep sees only their downline/self
          or (
            agency_id in (select agency_id from public.agency_members where user_id = auth.uid() and active = true)
            and public.is_manager_of(public.viewer_rep_id(), %I)
          )
        )
      $p$, tbl, tbl, rep_col
    );
  end loop;
end$$;

grant select on public.imos to authenticated;
grant select on public.imo_members to authenticated;
grant execute on function public.viewer_imo_ids() to authenticated;
grant execute on function public.viewer_agency_ids_v2() to authenticated;
grant execute on function public.viewer_rep_id() to authenticated;
grant execute on function public.is_manager_of(text, text) to authenticated;
