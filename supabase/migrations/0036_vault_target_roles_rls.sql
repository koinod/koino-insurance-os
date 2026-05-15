-- 0036_vault_target_roles_rls.sql
-- Enforce target_roles[] at the database layer for agency_scripts /
-- agency_docs / training_courses.
--
-- Before today, target_roles[] was a UI-only privacy hint. A rep authenticated
-- to agency X could `select * from agency_scripts` and the database happily
-- returned rows whose target_roles only contained ['owner']. The UI filtered
-- them on render, but the data was still on the wire and the row was
-- inspectable via the network panel.
--
-- This migration introduces public.viewer_role_in(agency_id) — returns the
-- caller's role string in that agency, or null — and AND-s a target-role
-- check into the SELECT policies. Managers + owners + super_admins remain
-- exempt (they see everything, because they author and audit).
--
-- Idempotent. Drops both the old policy names ("tenant read scripts" from
-- the 0024 lockdown phase AND the original "auth agency read" from 0010)
-- before re-creating, so it lands cleanly regardless of which generation of
-- policy is currently installed.

create or replace function public.viewer_role_in(p_agency_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select role
    from public.agency_members
   where user_id = auth.uid()
     and agency_id = p_agency_id
     and active = true
   limit 1;
$$;
grant execute on function public.viewer_role_in(uuid) to authenticated;

-- agency_scripts -----------------------------------------------------------
drop policy if exists "tenant read scripts" on public.agency_scripts;
drop policy if exists "auth agency read"    on public.agency_scripts;
create policy "tenant read scripts" on public.agency_scripts
  for select to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_is_manager_in(agency_id)
      or target_roles is null
      or target_roles = '{}'::text[]
      or coalesce(public.viewer_role_in(agency_id), 'rep') = any (target_roles)
    )
  );

-- agency_docs --------------------------------------------------------------
drop policy if exists "tenant read docs" on public.agency_docs;
drop policy if exists "auth agency read" on public.agency_docs;
create policy "tenant read docs" on public.agency_docs
  for select to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_is_manager_in(agency_id)
      or target_roles is null
      or target_roles = '{}'::text[]
      or coalesce(public.viewer_role_in(agency_id), 'rep') = any (target_roles)
    )
  );

-- training_courses (target_roles has been there since 0019) ----------------
drop policy if exists "tenant read courses" on public.training_courses;
create policy "tenant read courses" on public.training_courses
  for select to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_is_manager_in(agency_id)
      or target_roles is null
      or target_roles = '{}'::text[]
      or coalesce(public.viewer_role_in(agency_id), 'rep') = any (target_roles)
    )
  );
