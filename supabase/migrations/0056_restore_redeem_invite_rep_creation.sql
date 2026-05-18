-- 0056_restore_redeem_invite_rep_creation.sql
--
-- Fixes the redeem_invite regression introduced by 0037.
--
-- 0037 kept the single-tenancy guard but deleted the rep-creation block from
-- 0009. The current production function:
--   - inserts agency_members + marks invite used,                     ✓
--   - does NOT create a public.reps row,                              ✗
--   - does NOT stamp upline_id from agency_invites.upline_rep_id,     ✗
--   - does NOT create the onboarding_progress row,                    ✗
--   - returns NULL instead of the new rep_id.                         ✗
--
-- Observable damage in prod (2026-05-18): 8 reps, 0 with upline_id; the
-- "downline" tree is empty; managers can't see invited reps; isaiah.auman02
-- is an active manager with no rep row at all.
--
-- This migration restores the full 0009 redeem-side semantics while keeping
-- the 0037 single-tenancy guard, and backfills the one known orphan.
--
-- (Filename uses 0056 because the user-suggested 0049 collides with the
-- already-applied 0049_rls_pass1_agency_id_cols_and_scoped_policies.)

create or replace function public.redeem_invite(p_token text)
returns text
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_inv             record;
  v_uid             uuid := auth.uid();
  v_existing_rep    text;
  v_conflict_agency uuid;
  v_repid           text;
begin
  if v_uid is null then
    raise exception 'must be signed in to redeem an invite';
  end if;

  select * into v_inv from public.agency_invites where token = p_token;
  if not found then
    raise exception 'invite not found';
  end if;

  -- Idempotent re-redeem: return the existing rep_id, not null.
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

  -- Single-tenancy guard (preserved from 0037). Owners + super_admins bypass —
  -- an IMO owner legitimately spans multiple agencies.
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

  -- 1. agency_members row (rep_id=null initially; we link below once reps exists).
  insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
  values (v_inv.agency_id, v_uid, v_inv.role, null, now(), true)
  on conflict (agency_id, user_id) do update
     set role = excluded.role, active = true;

  -- 2. Synthesized rep_id from the uid (matches the 0009 pattern). Owners
  -- without rep responsibilities still get a rep row so the hierarchy /
  -- onboarding tree has a node — Quote tool, downline_of, and the Recruiting
  -- UI all assume every active member has a rep row.
  v_repid := 'rep-' || substring(replace(v_uid::text, '-', '') from 1 for 12);

  -- 3. reps row with upline_id stamped from the invite. on-conflict preserves
  -- any manually-set upline_id (don't overwrite an admin reassignment).
  insert into public.reps
    (id, name, handle, tier, mtd_cents, today_cents, streak_days, dials,
     presence, appts, agency_id, user_id, upline_id, email, onboarded_at)
  values
    (v_repid, coalesce(v_inv.email_hint, 'New ' || v_inv.role),
     '@' || v_repid, 'bronze', 0, 0, 0, 0, 'idle', 0,
     v_inv.agency_id, v_uid, v_inv.upline_rep_id, v_inv.email_hint, null)
  on conflict (id) do update
     set user_id   = v_uid,
         upline_id = coalesce(public.reps.upline_id, v_inv.upline_rep_id),
         agency_id = v_inv.agency_id;

  -- 4. Link the membership to the rep.
  update public.agency_members
     set rep_id = v_repid
   where agency_id = v_inv.agency_id and user_id = v_uid;

  -- 5. Onboarding scaffold so the wizard has somewhere to write.
  insert into public.onboarding_progress (rep_id, agency_id)
  values (v_repid, v_inv.agency_id)
  on conflict (rep_id) do nothing;

  -- 6. Mark invite redeemed (kept last so a failure earlier doesn't burn the token).
  update public.agency_invites
     set used_at = now(), used_by = v_uid
   where token = p_token;

  return v_repid;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;

-- ─── Backfill the one known orphan (isaiah.auman02@gmail.com) ──────────────
--
-- Joined 2026-05-16, active manager in d548e8ea, no rep row. The invite that
-- brought them in had upline_rep_id = null (Ian Kobe minted it as owner) —
-- so the new rep lands as a root under the agency, which is correct.
do $$
declare
  v_uid     uuid := '50780406-f3fa-4a16-b677-a08c3aee4091';
  v_agency  uuid := 'd548e8ea-9fab-4c7e-a700-c3b10976f1d8';
  v_email   text := 'isaiah.auman02@gmail.com';
  v_repid   text;
begin
  -- Skip if they already have a rep row (idempotency for re-runs).
  if exists (select 1 from public.reps where user_id = v_uid and agency_id = v_agency) then
    return;
  end if;
  -- Skip if they aren't actually still an active member.
  if not exists (
    select 1 from public.agency_members
     where user_id = v_uid and agency_id = v_agency and active
  ) then
    return;
  end if;

  v_repid := 'rep-' || substring(replace(v_uid::text, '-', '') from 1 for 12);

  insert into public.reps
    (id, name, handle, tier, mtd_cents, today_cents, streak_days, dials,
     presence, appts, agency_id, user_id, upline_id, email, onboarded_at)
  values
    (v_repid, 'Isaiah Auman (02)', '@' || v_repid, 'bronze', 0, 0, 0, 0,
     'idle', 0, v_agency, v_uid, null, v_email, null)
  on conflict (id) do nothing;

  update public.agency_members
     set rep_id = v_repid
   where user_id = v_uid and agency_id = v_agency and rep_id is null;

  insert into public.onboarding_progress (rep_id, agency_id)
  values (v_repid, v_agency)
  on conflict (rep_id) do nothing;
end $$;
