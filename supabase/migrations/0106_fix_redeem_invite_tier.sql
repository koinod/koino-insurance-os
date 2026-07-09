-- 0106_fix_redeem_invite_tier.sql
-- Fixes the redeem_invite function by defaulting tier to 'bronze'
-- to avoid violating the NOT NULL constraint on public.reps.

create or replace function public.redeem_invite(p_token text)
returns text
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_inv   public.agency_invites%rowtype;
  v_uid   uuid := auth.uid();
  v_rep   text;
  v_existing_role text;
begin
  select * into v_inv from public.agency_invites where token = p_token;
  if not found then
    raise exception 'invite token not found';
  end if;

  -- Revoked check
  if v_inv.revoked_at is not null then
    raise exception 'invite has been revoked';
  end if;

  -- Expiry check (null expires_at = permanent)
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'invite has expired';
  end if;

  -- Max-use check (null max_uses = unlimited)
  if v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses then
    raise exception 'invite has reached its maximum number of uses';
  end if;

  -- Check if this user is already a member
  select role into v_existing_role
    from public.agency_members
   where user_id = v_uid and agency_id = v_inv.agency_id and active
   limit 1;
  if v_existing_role is not null then
    -- Idempotent: already a member, just return their role
    return v_existing_role;
  end if;

  -- Generate a new rep_id
  v_rep := 'r_' || replace(gen_random_uuid()::text, '-', '');

  -- Insert reps row
  -- FIX: Default tier to 'bronze' to satisfy NOT NULL constraint
  insert into public.reps (id, name, agency_id, upline_id, tier)
  select v_rep,
         coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), 'New Rep'),
         v_inv.agency_id,
         v_inv.upline_rep_id,
         'bronze'
  on conflict (id) do nothing;

  -- Insert agency_members row
  insert into public.agency_members (agency_id, user_id, rep_id, role, active, joined_at)
  values (v_inv.agency_id, v_uid, v_rep, v_inv.role, true, now())
  on conflict (agency_id, user_id) do update set active = true, role = excluded.role;

  -- Increment use_count; stamp used_at only on first use
  update public.agency_invites
     set use_count = use_count + 1,
         used_at   = coalesce(used_at, now())
   where token = p_token;

  -- Audit event
  insert into public.invite_events (token, event, agency_id, actor_uid, payload)
  values (p_token, 'redeem', v_inv.agency_id, v_uid,
          jsonb_build_object('rep_id', v_rep, 'role', v_inv.role, 'use_count', v_inv.use_count + 1));

  return v_inv.role;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
