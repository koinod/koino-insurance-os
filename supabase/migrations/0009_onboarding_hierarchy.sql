-- 0009 onboarding hierarchy.
--
-- Implements the user's "hierarchy for onboarding tables" ask:
--   - agency_invites carry upline_rep_id (the inviter's rep_id) so when the
--     invitee accepts, their reps.upline_id is auto-stamped — preserves the
--     org tree without manual fix-up.
--   - onboarding_progress tracks per-rep step completion (license_signed,
--     nipr_verified, banking_set, kit_shipped, first_dial). Owners + the
--     inviter (or anyone in their downline upline-chain) can see status.
--   - mint_invite RPC extended to accept p_upline_rep_id; managers (not just
--     owners) can mint invites within their downline.
--   - redeem_invite RPC: when a user signs in via the magic link, looks up
--     the invite, creates their agency_member row, links a reps row with
--     upline_id from the invite, returns the rep_id. Idempotent on the
--     `used_at` flag.

-- ─── columns ─────────────────────────────────────────────────────────
alter table public.agency_invites
  add column if not exists upline_rep_id text references public.reps(id) on delete set null;

-- ─── onboarding_progress ─────────────────────────────────────────────
create table if not exists public.onboarding_progress (
  rep_id text primary key references public.reps(id) on delete cascade,
  agency_id uuid not null,
  license_signed boolean not null default false,
  license_signed_at timestamptz,
  nipr_verified boolean not null default false,
  nipr_verified_at timestamptz,
  banking_set boolean not null default false,
  banking_set_at timestamptz,
  kit_shipped boolean not null default false,
  kit_shipped_at timestamptz,
  first_dial boolean not null default false,
  first_dial_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_onboarding_progress_agency on public.onboarding_progress (agency_id);
alter table public.onboarding_progress enable row level security;

drop policy if exists "anon atlas read" on public.onboarding_progress;
create policy "anon atlas read" on public.onboarding_progress for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth read agency" on public.onboarding_progress;
create policy "auth read agency" on public.onboarding_progress for select to authenticated using (true);

drop policy if exists "auth own + upline write" on public.onboarding_progress;
create policy "auth own + upline write" on public.onboarding_progress for all to authenticated
  using (
    rep_id = (select rep_id from public.me() limit 1)
    or rep_id in (select rep_id from public.downline_of((select rep_id from public.me() limit 1)))
    or (select role from public.me() limit 1) = 'owner'
  )
  with check (
    rep_id = (select rep_id from public.me() limit 1)
    or rep_id in (select rep_id from public.downline_of((select rep_id from public.me() limit 1)))
    or (select role from public.me() limit 1) = 'owner'
  );

-- ─── mint_invite v2: managers can mint within their downline ──────────
create or replace function public.mint_invite(
  p_agency_id uuid, p_role text, p_email_hint text, p_upline_rep_id text default null
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_token text;
  v_my_rep text;
  v_my_role text;
begin
  select rep_id, role into v_my_rep, v_my_role from public.me() limit 1;

  -- Owners can mint for any upline. Managers can mint only when the upline
  -- is themselves OR within their downline.
  if v_my_role = 'owner' then
    null;
  elsif v_my_role = 'manager' then
    if p_upline_rep_id is null then p_upline_rep_id := v_my_rep; end if;
    if p_upline_rep_id <> v_my_rep
       and not exists (
         select 1 from public.downline_of(v_my_rep) d where d.rep_id = p_upline_rep_id
       )
    then
      raise exception 'manager can only mint invites within own downline';
    end if;
  else
    raise exception 'only owners or managers can mint invites';
  end if;

  -- Verify the caller is a member of the target agency.
  if not exists (
    select 1 from public.agency_members
    where agency_id = p_agency_id and user_id = auth.uid() and active
  ) then
    raise exception 'you are not an active member of this agency';
  end if;

  v_token := 'rfi_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.agency_invites (token, agency_id, role, email_hint, invited_by, upline_rep_id, expires_at)
  values (v_token, p_agency_id, coalesce(p_role, 'rep'), p_email_hint, auth.uid(), p_upline_rep_id, now() + interval '14 days');
  return v_token;
end;
$$;

grant execute on function public.mint_invite(uuid, text, text, text) to authenticated;

-- ─── redeem_invite — accept invite, link rep, stamp upline_id ────────
create or replace function public.redeem_invite(p_token text)
returns text  -- the new rep_id
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_inv  record;
  v_uid  uuid := auth.uid();
  v_repid text;
begin
  if v_uid is null then
    raise exception 'must be signed in to redeem an invite';
  end if;

  select * into v_inv from public.agency_invites where token = p_token;
  if not found then
    raise exception 'invite not found';
  end if;
  if v_inv.used_at is not null then
    -- idempotent: return their existing rep id
    select rep_id into v_repid from public.agency_members
      where agency_id = v_inv.agency_id and user_id = v_uid and active
      limit 1;
    return v_repid;
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'invite expired';
  end if;

  -- create or upsert the membership
  insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
  values (v_inv.agency_id, v_uid, v_inv.role, null, now(), true)
  on conflict (agency_id, user_id) do update
    set role = excluded.role, active = true;

  -- create a reps row tied to this user, with upline_id from the invite
  v_repid := 'rep-' || substring(replace(v_uid::text, '-', '') from 1 for 12);
  insert into public.reps (id, name, handle, tier, mtd_cents, today_cents, streak_days, dials, presence, appts, agency_id, user_id, upline_id, onboarded_at)
  values (v_repid, coalesce(v_inv.email_hint, 'New rep'), '@' || v_repid, 'bronze', 0, 0, 0, 0, 'off', 0, v_inv.agency_id, v_uid, v_inv.upline_rep_id, null)
  on conflict (id) do update
    set user_id = v_uid, upline_id = coalesce(public.reps.upline_id, v_inv.upline_rep_id), agency_id = v_inv.agency_id;

  -- link membership to the rep row
  update public.agency_members set rep_id = v_repid
   where agency_id = v_inv.agency_id and user_id = v_uid;

  -- create empty onboarding row
  insert into public.onboarding_progress (rep_id, agency_id) values (v_repid, v_inv.agency_id)
    on conflict (rep_id) do nothing;

  -- mark invite redeemed
  update public.agency_invites
     set used_at = now(), used_by = v_uid
   where token = p_token;

  return v_repid;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;

-- ─── seed Atlas onboarding rows so the demo has data ─────────────────
insert into public.onboarding_progress (rep_id, agency_id, license_signed, license_signed_at, nipr_verified, nipr_verified_at, banking_set, banking_set_at, kit_shipped, kit_shipped_at, first_dial, first_dial_at)
select v.rep_id, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, v.lic, v.lic_at, v.nipr, v.nipr_at, v.bank, v.bank_at, v.kit, v.kit_at, v.dial, v.dial_at
from (values
  ('marc', true,  now() - interval '180 days', true,  now() - interval '180 days', true,  now() - interval '178 days', true,  now() - interval '177 days', true,  now() - interval '177 days'),
  ('dani', true,  now() - interval '120 days', true,  now() - interval '119 days', true,  now() - interval '119 days', true,  now() - interval '118 days', true,  now() - interval '118 days'),
  ('remy', true,  now() - interval '95 days',  true,  now() - interval '95 days',  true,  now() - interval '94 days',  true,  now() - interval '93 days',  true,  now() - interval '92 days'),
  ('alex', true,  now() - interval '40 days',  true,  now() - interval '40 days',  true,  now() - interval '38 days',  true,  now() - interval '37 days',  true,  now() - interval '36 days'),
  ('jada', true,  now() - interval '14 days',  true,  now() - interval '13 days',  false, null,                          true,  now() - interval '12 days',  false, null),
  ('kira', true,  now() - interval '10 days',  false, null,                          false, null,                          false, null,                          false, null),
  ('luis', false, null,                          false, null,                          false, null,                          false, null,                          false, null),
  ('sade', true,  now() - interval '70 days',  true,  now() - interval '70 days',  true,  now() - interval '68 days',  true,  now() - interval '67 days',  true,  now() - interval '66 days'),
  ('tony', true,  now() - interval '50 days',  true,  now() - interval '49 days',  true,  now() - interval '48 days',  true,  now() - interval '47 days',  true,  now() - interval '46 days')
) v(rep_id, lic, lic_at, nipr, nipr_at, bank, bank_at, kit, kit_at, dial, dial_at)
where exists (select 1 from public.reps r where r.id = v.rep_id)
on conflict (rep_id) do nothing;
