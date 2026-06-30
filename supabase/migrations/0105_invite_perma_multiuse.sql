-- 0105_invite_perma_multiuse.sql
-- Adds permanent/multi-use invite support to agency_invites.
-- New columns:
--   max_uses   integer  — NULL = unlimited; 1 = single-use (default), N = N uses
--   use_count  integer  — how many times redeemed
--   label      text     — human name for the link (e.g. "Orlando Recruiting Drop")
--   revoked_at timestamptz — set by revoke_invite() to soft-delete the link

-- ─── 1. New columns ──────────────────────────────────────────────────────────
alter table public.agency_invites
  add column if not exists max_uses  integer default 1,
  add column if not exists use_count integer not null default 0,
  add column if not exists label     text,
  add column if not exists revoked_at timestamptz;

-- max_uses=1 is already the old behavior (single-use).
-- Backfill existing rows:
update public.agency_invites set max_uses = 1 where max_uses is null;

-- ─── 2. Index for fast "is invite still valid?" checks ───────────────────────
create index if not exists idx_agency_invites_valid
  on public.agency_invites (token)
  where revoked_at is null;

-- ─── 3. Update redeem_invite to honour max_uses and use_count ─────────────────
-- Replaces the old single-use stamp logic with an atomic counter increment.
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
  insert into public.reps (id, name, agency_id, upline_id)
  select v_rep,
         coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), 'New Rep'),
         v_inv.agency_id,
         v_inv.upline_rep_id
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

-- ─── 4. Update mint_invite to accept label + max_uses + perma flag ───────────
create or replace function public.mint_invite(
  p_agency_id   uuid,
  p_role        text,
  p_email_hint  text,
  p_upline_rep_id text default null,
  p_label       text default null,
  p_max_uses    integer default 1,
  p_perma       boolean default false
)
returns text
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_token     text;
  v_my_rep    text;
  v_my_role   text;
  v_is_super  boolean := public.is_super_admin();
  v_expires   timestamptz;
begin
  -- Expiry: null = permanent, otherwise 14 days default
  v_expires := case when p_perma then null else now() + interval '14 days' end;

  -- Auth checks
  if not v_is_super then
    select rep_id, role into v_my_rep, v_my_role
      from public.agency_members
     where user_id = auth.uid() and agency_id = p_agency_id and active
     order by joined_at asc limit 1;

    if v_my_role is null then
      raise exception 'you are not an active member of this agency';
    end if;

    if v_my_role not in ('owner','admin','imo_owner','manager') then
      raise exception 'role % cannot mint invites', v_my_role;
    end if;

    if v_my_role = 'manager' then
      if p_upline_rep_id is null then p_upline_rep_id := v_my_rep; end if;
      if p_upline_rep_id <> v_my_rep and not exists (
        select 1 from public.downline_of(v_my_rep) d where d.rep_id = p_upline_rep_id
      ) then
        raise exception 'manager can only mint invites within own downline';
      end if;
    end if;
  end if;

  v_token := 'rfi_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.agency_invites
    (token, agency_id, role, email_hint, invited_by, upline_rep_id,
     expires_at, label, max_uses, use_count)
  values
    (v_token, p_agency_id, coalesce(p_role, 'rep'), p_email_hint,
     auth.uid(), p_upline_rep_id,
     v_expires, p_label, coalesce(p_max_uses, 1), 0);

  insert into public.invite_events (token, event, agency_id, actor_uid, payload)
  values (v_token, 'mint', p_agency_id, auth.uid(),
          jsonb_build_object(
            'role', p_role, 'upline', p_upline_rep_id,
            'email_hint', p_email_hint, 'label', p_label,
            'max_uses', p_max_uses, 'perma', p_perma
          ));

  return v_token;
end;
$$;

grant execute on function public.mint_invite(uuid, text, text, text, text, integer, boolean) to authenticated;

-- ─── 5. revoke_invite function ───────────────────────────────────────────────
create or replace function public.revoke_invite(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_inv   public.agency_invites%rowtype;
  v_my_role text;
begin
  select * into v_inv from public.agency_invites where token = p_token;
  if not found then raise exception 'invite not found'; end if;

  -- Must be member of that agency with minting privileges, or super admin
  if not public.is_super_admin() then
    select role into v_my_role
      from public.agency_members
     where user_id = auth.uid() and agency_id = v_inv.agency_id and active
     limit 1;
    if v_my_role not in ('owner','admin','imo_owner','manager') then
      raise exception 'only managers/owners can revoke invites';
    end if;
  end if;

  update public.agency_invites set revoked_at = now() where token = p_token;

  insert into public.invite_events (token, event, agency_id, actor_uid, payload)
  values (p_token, 'revoke', v_inv.agency_id, auth.uid(), '{}'::jsonb);
end;
$$;

grant execute on function public.revoke_invite(text) to authenticated;

-- ─── 6. RLS: allow agency members to read their own agency invites ────────────
drop policy if exists "members read own agency invites" on public.agency_invites;
create policy "members read own agency invites"
  on public.agency_invites for select
  using (
    public.is_super_admin()
    or agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and active
    )
  );
