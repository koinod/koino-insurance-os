-- 0022 Super Admin Ian
--
-- Promotes iankmeeks@gmail.com to system-wide super_admin.
-- Enhances RBAC helpers to allow super_admins to see/manage every agency.

------------------------------------------------------------------------------
-- 1. Helper: is_super_admin()
------------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
     where user_id = auth.uid()
       and role = 'super_admin'
       and active = true
  )
$$;

grant execute on function public.is_super_admin() to authenticated;

------------------------------------------------------------------------------
-- 2. Update RBAC helpers to support super_admin
------------------------------------------------------------------------------

create or replace function public.viewer_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Super admin sees everything
  select id from public.agencies
   where public.is_super_admin()
  union
  -- Direct membership
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
$$;

create or replace function public.viewer_agency_ids_v2()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Super admin sees everything
  select id from public.agencies
   where public.is_super_admin()
  union
  -- Direct membership
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
  union
  -- Via IMO admin/staff role
  select a.id from public.agencies a
   where a.imo_id in (select public.viewer_imo_ids())
$$;

------------------------------------------------------------------------------
-- 3. Update the Auto-admin trigger logic
------------------------------------------------------------------------------
create or replace function public.koino_promote_admin_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text := lower(new.email);
  v_admin_set  text[] := array['iankmeeks@gmail.com'];
  v_agency_id  uuid;
  v_rep_id     text;
  v_handle     text;
begin
  if v_email is null or not (v_email = any (v_admin_set)) then
    return new;
  end if;

  select id into v_agency_id
  from public.agencies
  where lower(coalesce(name, '')) = 'koino hq'
  limit 1;

  if v_agency_id is null then
    insert into public.agencies (id, name)
    values (gen_random_uuid(), 'Koino HQ')
    returning id into v_agency_id;
  end if;

  v_rep_id := 'admin-' || split_part(v_email, '@', 1);
  v_handle := '@' || split_part(v_email, '@', 1);

  insert into public.reps (id, name, handle, tier, agency_id, user_id, onboarded_at)
  values (v_rep_id, 'Ian Meeks', v_handle, 'platinum', v_agency_id, new.id, now())
  on conflict (id) do update
    set user_id = excluded.user_id,
        agency_id = excluded.agency_id;

  insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
  values (v_agency_id, new.id, 'super_admin', v_rep_id, now(), true)
  on conflict (agency_id, user_id) do update
    set role = 'super_admin', rep_id = v_rep_id, active = true;

  return new;
end;
$$;

------------------------------------------------------------------------------
-- 4. Immediate Promotion for iankmeeks@gmail.com
------------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  v_agency_id uuid;
begin
  select id into v_uid
  from auth.users
  where lower(email) = 'iankmeeks@gmail.com'
  limit 1;

  if v_uid is not null then
    -- Ensure Koino HQ exists
    select id into v_agency_id from public.agencies where lower(name) = 'koino hq' limit 1;
    if v_agency_id is null then
      insert into public.agencies (name) values ('Koino HQ') returning id into v_agency_id;
    end if;

    -- Ensure Ian has a reps row
    insert into public.reps (id, name, handle, tier, agency_id, user_id, onboarded_at)
    values ('admin-iankmeeks', 'Ian Meeks', '@iankmeeks', 'platinum', v_agency_id, v_uid, now())
    on conflict (id) do update set user_id = excluded.user_id, tier = 'platinum';

    -- Promote in agency_members
    insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
    values (v_agency_id, v_uid, 'super_admin', 'admin-iankmeeks', now(), true)
    on conflict (agency_id, user_id) do update set role = 'super_admin', active = true;
  end if;
end $$;
