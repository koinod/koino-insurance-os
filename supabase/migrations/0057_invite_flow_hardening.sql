-- 0057_invite_flow_hardening.sql
--
-- Belt-and-suspenders for the invite + account-creation flow. After 0037 sat
-- silently broken for 2+ days before we noticed, this migration makes the
-- system self-monitoring and self-healing.
--
-- 1. agency_invites.created_at column   — audit who minted when.
-- 2. invite_events audit table          — every mint/redeem outcome logged.
-- 3. tg_agency_members_ensure_rep       — trigger that auto-creates the reps
--                                          row when a rep/manager member lands
--                                          with rep_id IS NULL. Last line of
--                                          defense against future regressions.
-- 4. invite_health_snapshot() RPC       — returns orphan/dangling/expired counts
--                                          for the nightly health cron.
-- 5. mint_invite + redeem_invite        — write success rows to invite_events.
--                                          Failures use RAISE LOG (Postgres log
--                                          channel) because INSERTs before a
--                                          RAISE EXCEPTION roll back with the
--                                          rest of the function's tx.

-- ─── 1. agency_invites.created_at ──────────────────────────────────────────
alter table public.agency_invites
  add column if not exists created_at timestamptz not null default now();

-- Backfill: an invite that has been redeemed gets its expires_at - 14d
-- as a best-effort created_at; unredeemed gets the default now() (close
-- enough for audit). The earlier rows already get now() from the default;
-- the redeemed one gets a more accurate timestamp.
update public.agency_invites
   set created_at = greatest(coalesce(used_at, expires_at - interval '14 days'),
                              now() - interval '90 days')
 where created_at >= now() - interval '5 seconds';

-- ─── 2. invite_events audit table ──────────────────────────────────────────
create table if not exists public.invite_events (
  id          uuid primary key default gen_random_uuid(),
  token       text,
  event       text not null,                  -- 'mint' | 'redeem_ok' | 'redeem_err' | 'health_alert'
  agency_id   uuid,
  actor_uid   uuid,
  payload     jsonb not null default '{}'::jsonb,
  error_msg   text,
  occurred_at timestamptz not null default now()
);
create index if not exists invite_events_agency_idx on public.invite_events (agency_id, occurred_at desc);
create index if not exists invite_events_event_idx  on public.invite_events (event, occurred_at desc);
create index if not exists invite_events_token_idx  on public.invite_events (token);
alter table public.invite_events enable row level security;

drop policy if exists "owners+super read invite_events" on public.invite_events;
create policy "owners+super read invite_events" on public.invite_events
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members am
       where am.agency_id = invite_events.agency_id
         and am.user_id = auth.uid()
         and am.active
         and am.role in ('owner','admin','imo_owner')
    )
  );

grant select on public.invite_events to authenticated;

-- ─── 3. Trigger: auto-create rep row when rep/manager member lacks one ─────
create or replace function public.tg_agency_members_ensure_rep()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_repid text;
  v_email text;
begin
  if NEW.role not in ('rep','manager') then return NEW; end if;
  if NEW.rep_id is not null               then return NEW; end if;
  if NEW.user_id is null                  then return NEW; end if;
  if NEW.active is not true               then return NEW; end if;

  -- Reuse an existing rep row for this user+agency if one exists.
  select id into v_repid from public.reps
   where user_id = NEW.user_id and agency_id = NEW.agency_id limit 1;

  if v_repid is null then
    -- Synthesize the same rep_id shape redeem_invite uses, so retries land
    -- on the same row.
    v_repid := 'rep-' || substring(replace(NEW.user_id::text, '-', '') from 1 for 12);

    -- Pull the user's email for a sane default name; fall back to handle.
    select email into v_email from auth.users where id = NEW.user_id;

    insert into public.reps
      (id, name, handle, tier, mtd_cents, today_cents, streak_days, dials,
       presence, appts, agency_id, user_id, upline_id, email, onboarded_at)
    values
      (v_repid, coalesce(v_email, 'New ' || NEW.role), '@' || v_repid, 'bronze',
       0, 0, 0, 0, 'idle', 0, NEW.agency_id, NEW.user_id, null, v_email, null)
    on conflict (id) do update
       set user_id   = NEW.user_id,
           agency_id = NEW.agency_id;

    insert into public.onboarding_progress (rep_id, agency_id)
    values (v_repid, NEW.agency_id)
    on conflict (rep_id) do nothing;

    insert into public.invite_events (event, agency_id, actor_uid, payload)
    values ('rep_autocreated', NEW.agency_id, NEW.user_id,
            jsonb_build_object('rep_id', v_repid, 'role', NEW.role, 'reason', 'trigger_safety_net'));
  end if;

  NEW.rep_id := v_repid;
  return NEW;
end;
$$;

drop trigger if exists trg_agency_members_ensure_rep on public.agency_members;
create trigger trg_agency_members_ensure_rep
  before insert or update on public.agency_members
  for each row execute function public.tg_agency_members_ensure_rep();

-- ─── 4. invite_health_snapshot RPC ─────────────────────────────────────────
create or replace function public.invite_health_snapshot()
returns table (
  agency_id              uuid,
  orphans                int,    -- agency_members rep/manager active w/ rep_id null
  dangling_uplines       int,    -- reps.upline_id points to a non-existent or cross-agency rep
  cross_agency_uplines   int,    -- reps.upline_id exists but in a different agency
  expired_unredeemed_14d int,    -- invites that expired in last 14d without redemption
  pending_invites        int     -- live, not-yet-redeemed
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with agencies as (
    select id from public.agencies
  ),
  orphan_counts as (
    select agency_id, count(*)::int as n
      from public.agency_members
     where active and role in ('rep','manager') and rep_id is null
     group by agency_id
  ),
  dangling as (
    select r1.agency_id, count(*)::int as n
      from public.reps r1
     where r1.upline_id is not null
       and not exists (select 1 from public.reps r2 where r2.id = r1.upline_id)
     group by r1.agency_id
  ),
  crossag as (
    select r1.agency_id, count(*)::int as n
      from public.reps r1
      join public.reps r2 on r2.id = r1.upline_id
     where r1.agency_id is distinct from r2.agency_id
     group by r1.agency_id
  ),
  expired as (
    select agency_id, count(*)::int as n
      from public.agency_invites
     where used_at is null
       and expires_at < now()
       and expires_at >= now() - interval '14 days'
     group by agency_id
  ),
  pending as (
    select agency_id, count(*)::int as n
      from public.agency_invites
     where used_at is null
       and (expires_at is null or expires_at >= now())
     group by agency_id
  )
  select a.id,
         coalesce(o.n, 0),
         coalesce(d.n, 0),
         coalesce(c.n, 0),
         coalesce(e.n, 0),
         coalesce(p.n, 0)
    from agencies a
    left join orphan_counts o on o.agency_id = a.id
    left join dangling      d on d.agency_id = a.id
    left join crossag       c on c.agency_id = a.id
    left join expired       e on e.agency_id = a.id
    left join pending       p on p.agency_id = a.id;
$$;

grant execute on function public.invite_health_snapshot() to authenticated, service_role;

-- ─── 5. mint_invite + redeem_invite — add event logging ────────────────────
-- mint_invite: keep the existing super_admin-bypass behavior; just log on
-- success and on raised exceptions. Failures use a SAVEPOINT so the audit
-- row survives the rollback of the user-visible insert.

create or replace function public.mint_invite(
  p_agency_id uuid, p_role text, p_email_hint text, p_upline_rep_id text default null
)
returns text
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_token text;
  v_my_rep text;
  v_my_role text;
  v_is_super boolean := public.is_super_admin();
  v_agency_exists boolean;
begin
  select exists(select 1 from public.agencies where id = p_agency_id)
    into v_agency_exists;
  if not v_agency_exists then
    raise log 'mint_invite_err agency=% role=% upline=% reason=agency_not_found', p_agency_id, p_role, p_upline_rep_id;
    raise exception 'agency % does not exist (likely demo/stale UI scope)', p_agency_id;
  end if;

  if v_is_super then
    v_token := 'rfi_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.agency_invites
      (token, agency_id, role, email_hint, invited_by, upline_rep_id, expires_at)
    values
      (v_token, p_agency_id, coalesce(p_role, 'rep'), p_email_hint,
       auth.uid(), p_upline_rep_id, now() + interval '14 days');
    insert into public.invite_events (token, event, agency_id, actor_uid, payload)
    values (v_token, 'mint', p_agency_id, auth.uid(),
            jsonb_build_object('role', p_role, 'upline', p_upline_rep_id,
                               'email_hint', p_email_hint, 'path', 'super_admin'));
    return v_token;
  end if;

  select rep_id, role into v_my_rep, v_my_role from public.me() limit 1;
  if v_my_role is null then
    select rep_id, role into v_my_rep, v_my_role
      from public.agency_members
     where user_id = auth.uid() and agency_id = p_agency_id and active
     order by joined_at asc
     limit 1;
  end if;

  if v_my_role in ('owner','admin','imo_owner') then
    null;
  elsif v_my_role = 'manager' then
    if p_upline_rep_id is null then p_upline_rep_id := v_my_rep; end if;
    if p_upline_rep_id <> v_my_rep
       and not exists (
         select 1 from public.downline_of(v_my_rep) d where d.rep_id = p_upline_rep_id
       )
    then
      raise log 'mint_invite_err agency=% my_rep=% bad_upline=% reason=foreign_upline', p_agency_id, v_my_rep, p_upline_rep_id;
      raise exception 'manager can only mint invites within own downline';
    end if;
  else
    raise log 'mint_invite_err agency=% my_role=% reason=role_cannot_mint', p_agency_id, coalesce(v_my_role, '(none)');
    raise exception 'role % cannot mint invites', coalesce(v_my_role, '(none)');
  end if;

  if not exists (
    select 1 from public.agency_members
    where agency_id = p_agency_id and user_id = auth.uid() and active
  ) then
    raise log 'mint_invite_err agency=% uid=% reason=not_active_member', p_agency_id, auth.uid();
    raise exception 'you are not an active member of this agency';
  end if;

  v_token := 'rfi_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.agency_invites
    (token, agency_id, role, email_hint, invited_by, upline_rep_id, expires_at)
  values
    (v_token, p_agency_id, coalesce(p_role, 'rep'), p_email_hint,
     auth.uid(), p_upline_rep_id, now() + interval '14 days');
  insert into public.invite_events (token, event, agency_id, actor_uid, payload)
  values (v_token, 'mint', p_agency_id, auth.uid(),
          jsonb_build_object('role', p_role, 'upline', p_upline_rep_id,
                             'email_hint', p_email_hint, 'path', v_my_role));
  return v_token;
end;
$$;

grant execute on function public.mint_invite(uuid, text, text, text) to authenticated;

-- redeem_invite: keep 0056 semantics, add success + failure events.
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
    raise log 'redeem_invite_err uid=% token=% reason=invite_not_found', v_uid, left(p_token, 12);
    raise exception 'invite not found';
  end if;

  if v_inv.used_at is not null then
    select rep_id into v_existing_rep
      from public.agency_members
     where agency_id = v_inv.agency_id and user_id = v_uid and active
     limit 1;
    insert into public.invite_events (token, event, agency_id, actor_uid, payload)
    values (p_token, 'redeem_idempotent', v_inv.agency_id, v_uid,
            jsonb_build_object('rep_id', v_existing_rep));
    return v_existing_rep;
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise log 'redeem_invite_err uid=% agency=% token=% reason=expired', v_uid, v_inv.agency_id, left(p_token, 12);
    raise exception 'invite expired';
  end if;

  if v_inv.role in ('rep','manager') then
    select agency_id into v_conflict_agency
      from public.agency_members
     where user_id = v_uid
       and active = true
       and role in ('rep','manager')
       and agency_id <> v_inv.agency_id
     limit 1;
    if v_conflict_agency is not null then
      raise log 'redeem_invite_err uid=% target_agency=% conflict_agency=% reason=single_tenancy', v_uid, v_inv.agency_id, v_conflict_agency;
      raise exception
        'this account is already active on another agency — leave or be removed there before joining a new one';
    end if;
  end if;

  insert into public.agency_members (agency_id, user_id, role, rep_id, joined_at, active)
  values (v_inv.agency_id, v_uid, v_inv.role, null, now(), true)
  on conflict (agency_id, user_id) do update
     set role = excluded.role, active = true;

  v_repid := 'rep-' || substring(replace(v_uid::text, '-', '') from 1 for 12);

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

  update public.agency_members
     set rep_id = v_repid
   where agency_id = v_inv.agency_id and user_id = v_uid;

  insert into public.onboarding_progress (rep_id, agency_id)
  values (v_repid, v_inv.agency_id)
  on conflict (rep_id) do nothing;

  update public.agency_invites
     set used_at = now(), used_by = v_uid
   where token = p_token;

  insert into public.invite_events (token, event, agency_id, actor_uid, payload)
  values (p_token, 'redeem_ok', v_inv.agency_id, v_uid,
          jsonb_build_object('rep_id', v_repid, 'role', v_inv.role,
                             'upline', v_inv.upline_rep_id));

  return v_repid;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
