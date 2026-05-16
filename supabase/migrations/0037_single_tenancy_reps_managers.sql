-- 0037_single_tenancy_reps_managers.sql
-- "Once an account has signed up, it should only be able to be invited to an
-- agency once it's left or been removed from another." (Operator directive.)
--
-- Enforce ONE active agency per user_id, scoped to rep + manager roles.
-- Owners + super_admins are exempt — an IMO owner legitimately spans multiple
-- sub-agencies; a super_admin spans the whole platform.
--
-- Two-layer enforcement:
--   1. Partial unique index   — DB refuses to insert a second active rep/manager
--      row for the same user_id. Belt.
--   2. redeem_invite guard    — RPC raises a clean "already active elsewhere"
--      error instead of letting Postgres throw a unique-violation. Suspenders.
--
-- Existing data check (taken before applying): one user is active on two
-- agencies (owner + super_admin roles) — both exempt from the constraint, so
-- the index lands without backfill.

create unique index if not exists agency_members_one_active_per_user_idx
  on public.agency_members (user_id)
  where active = true and role in ('rep','manager');

create or replace function public.redeem_invite(p_token text)
returns text
language plpgsql security definer
set search_path to 'public','auth' as $$
declare
  v_inv record;
  v_uid uuid := auth.uid();
  v_existing_rep text;
  v_conflict_agency uuid;
begin
  if v_uid is null then
    raise exception 'must be signed in to redeem an invite';
  end if;

  select * into v_inv from public.agency_invites where token = p_token;
  if not found then raise exception 'invite not found'; end if;

  -- Idempotent re-redeem
  if v_inv.used_at is not null then
    select rep_id into v_existing_rep
      from public.agency_members
     where agency_id = v_inv.agency_id and user_id = v_uid and active
     limit 1;
    return v_existing_rep;
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'invite expired';
  end if;

  -- Single-tenancy guard. Owners + super_admins bypass.
  if v_inv.role in ('rep','manager') then
    select agency_id into v_conflict_agency
      from public.agency_members
     where user_id = v_uid
       and active = true
       and role in ('rep','manager')
       and agency_id <> v_inv.agency_id
     limit 1;
    if v_conflict_agency is not null then
      raise exception
        'this account is already active on another agency — leave or be removed there before joining a new one';
    end if;
  end if;

  insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
  values (v_inv.agency_id, v_uid, v_inv.role, null, now(), true)
  on conflict (agency_id, user_id) do update set role = excluded.role, active = true;

  update public.agency_invites set used_at = now(), used_by = v_uid where token = p_token;

  return null;
end;
$$;
