-- 0019 super_admin platform layer.
--
-- Closes SUPERADMIN_AUDIT_REPORT findings A1, A2, A7, A8, A9. Adds:
--   * public.koino_super_admins  — allowlist independent of agency_members
--   * public.is_super_admin()     — security-definer helper, every RLS predicate
--                                   that needs "Ian sees everything" reads this
--   * public.viewer_agency_ids()  — rewritten to short-circuit on is_super_admin
--   * public.me()                  — extended return shape with is_super_admin
--   * public.platform_*()          — cross-tenant read helpers, super-admin only
--   * public.super_admin_act_as()  — sets the active agency for impersonation
--   * agency_audit_log             — idempotent ensure (lives in earlier non-
--                                    checked-in migration on the live DB; this
--                                    creates it if missing so locally-replayed
--                                    chains work)
--   * org_settings                 — same idempotent ensure
--   * feature_flag.* keys          — seed defaults
--
-- All new RLS policies follow the same pattern as 0015: viewer_agency_ids()
-- handles tenant scoping. Super-admin bypass is built into the helper, not
-- copied into every policy, so existing policies (and any future tenant
-- table that uses the pattern) pick up the bypass automatically.

------------------------------------------------------------------------------
-- 1. Idempotent ensure: agency_audit_log + org_settings
------------------------------------------------------------------------------
-- Both tables are referenced by checked-in code (page-admin.jsx,
-- api/stripe/webhook.js, api/cron/manager-inactivity.js, page-billing.jsx,
-- data.jsx orgSettingsSave) but their CREATE TABLE lives in a Supabase MCP
-- migration that was never exported to git. Re-create idempotently so the
-- chain replays cleanly on a fresh project.

create table if not exists public.agency_audit_log (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid,
  actor_user_id uuid,
  actor_role  text,
  kind        text not null,             -- 'login', 'invite_sent', 'super_admin_act_as_start', etc.
  action      text,                       -- legacy: free-form verb
  target      text,                       -- legacy: target slug
  metadata    jsonb not null default '{}'::jsonb,
  severity    text not null default 'info' check (severity in ('info','warn','danger','success')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_agency_created on public.agency_audit_log (agency_id, created_at desc);
create index if not exists idx_audit_kind on public.agency_audit_log (kind);
create index if not exists idx_audit_created on public.agency_audit_log (created_at desc);

alter table public.agency_audit_log enable row level security;

create table if not exists public.org_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table public.org_settings enable row level security;

-- Ensure agencies.config jsonb (used by lib/agency-config.js + the
-- per-agency feature-flag editor). Same idempotent-ensure rationale as
-- agency_audit_log / org_settings — the column lives in an un-exported
-- Supabase MCP migration on the live DB but isn't in checked-in chain.
alter table public.agencies add column if not exists config   jsonb not null default '{}'::jsonb;
alter table public.agencies add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.agencies add column if not exists is_demo  boolean not null default false;

------------------------------------------------------------------------------
-- 2. koino_super_admins — the allowlist
------------------------------------------------------------------------------
-- Source of truth for platform-admin privilege. Decoupled from
-- agency_members.role so that being a super-admin is orthogonal to being
-- (or not being) a member of any specific agency.

create table if not exists public.koino_super_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users(id) on delete set null,
  active      boolean not null default true,
  notes       text
);
create index if not exists idx_koino_super_admins_email on public.koino_super_admins (lower(email));

alter table public.koino_super_admins enable row level security;

------------------------------------------------------------------------------
-- 3. is_super_admin() — single helper used everywhere
------------------------------------------------------------------------------
-- Security definer so the function can read koino_super_admins regardless of
-- the caller's RLS context. Stable (cached within a statement).

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.koino_super_admins
     where user_id = auth.uid() and active = true
  )
$$;

grant execute on function public.is_super_admin() to authenticated, anon;

------------------------------------------------------------------------------
-- 4. viewer_agency_ids() — super-admin sees every agency
------------------------------------------------------------------------------
-- Replaces 0015's version. Same return shape, so every existing policy that
-- reads `agency_id in (select public.viewer_agency_ids())` picks up the
-- bypass without modification.

create or replace function public.viewer_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.agencies where public.is_super_admin()
  union
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
$$;

grant execute on function public.viewer_agency_ids() to authenticated, anon;

------------------------------------------------------------------------------
-- 5. me() — extended with is_super_admin
------------------------------------------------------------------------------
-- /api/me reads this. Frontend gates platform-admin UI on
-- (is_super_admin OR role='super_admin') so the two paths stay in sync even
-- as we migrate users off the role='super_admin' shorthand.

create or replace function public.me()
returns table (
  rep_id          text,
  user_id         uuid,
  full_name       text,
  handle          text,
  role            text,
  tier            text,
  agency_id       uuid,
  agency_name     text,
  upline_id       text,
  is_super_admin  boolean
)
language sql
security invoker
stable
as $$
  select
    r.id                              as rep_id,
    r.user_id                         as user_id,
    r.name                            as full_name,
    r.handle                          as handle,
    coalesce(am.role, 'rep')          as role,
    r.tier                            as tier,
    r.agency_id                       as agency_id,
    a.name                            as agency_name,
    r.upline_id                       as upline_id,
    public.is_super_admin()           as is_super_admin
  from public.reps r
  left join public.agencies       a  on a.id = r.agency_id
  left join public.agency_members am on am.user_id  = r.user_id
                                    and am.agency_id = r.agency_id
                                    and am.active is not false
  where r.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.me() to anon, authenticated;

-- Sibling: returns is_super_admin even when me() returns 0 rows (no rep row
-- yet for the user — e.g. fresh super-admin who never onboarded into an IMO).
-- /api/me uses this as a fallback.
create or replace function public.viewer_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin();
$$;

grant execute on function public.viewer_is_super_admin() to anon, authenticated;

------------------------------------------------------------------------------
-- 6. RLS policies — koino_super_admins, agency_audit_log, org_settings
------------------------------------------------------------------------------

-- koino_super_admins: super-admins can read their own allowlist; service role
-- is the only writer.
drop policy if exists "super_admin self read" on public.koino_super_admins;
create policy "super_admin self read" on public.koino_super_admins
  for select to authenticated
  using (public.is_super_admin());

-- agency_audit_log: tenants see their own rows; super-admins see everything.
drop policy if exists "tenant read audit" on public.agency_audit_log;
create policy "tenant read audit" on public.agency_audit_log
  for select to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
  );

drop policy if exists "tenant insert audit" on public.agency_audit_log;
create policy "tenant insert audit" on public.agency_audit_log
  for insert to authenticated
  with check (
    public.is_super_admin()
    or agency_id in (select public.viewer_agency_ids())
  );

-- org_settings: super-admin owns global config; everyone reads.
drop policy if exists "anyone read org_settings"  on public.org_settings;
drop policy if exists "super_admin write org_settings" on public.org_settings;
create policy "anyone read org_settings" on public.org_settings
  for select to anon, authenticated using (true);
create policy "super_admin write org_settings" on public.org_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

------------------------------------------------------------------------------
-- 7. Cross-agency platform RPCs (super-admin only)
------------------------------------------------------------------------------
-- These are the explicit, narrow read paths that the platform-admin UI
-- uses for the HQ / Agencies / Users / Audit cross-tenant views. They
-- short-circuit on is_super_admin() so any non-super caller hits a hard
-- 'forbidden' raise. Security definer so they can read past tenant RLS.

create or replace function public.platform_agencies_summary(p_include_demo boolean default false)
returns table (
  id            uuid,
  name          text,
  slug          text,
  plan          text,
  is_demo       boolean,
  member_count  integer,
  rep_count     integer,
  open_nigos    integer,
  mrr_cents     bigint,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  return query
    select
      a.id,
      a.name,
      a.slug,
      coalesce((a.settings->>'plan')::text, 'trial')                   as plan,
      coalesce(a.is_demo, false)                                       as is_demo,
      (select count(*)::int from public.agency_members m where m.agency_id = a.id and m.active is not false) as member_count,
      (select count(*)::int from public.reps r where r.agency_id = a.id) as rep_count,
      coalesce((select count(*)::int from public.nigos n where n.agency_id = a.id and n.status = 'open'), 0) as open_nigos,
      coalesce((
        select sum((s.amount_cents)::bigint) from public.subscriptions s
         where s.agency_id = a.id and s.status in ('active','trialing')
      ), 0)::bigint                                                    as mrr_cents,
      a.created_at
    from public.agencies a
    where (p_include_demo or coalesce(a.is_demo, false) = false)
    order by a.created_at desc;
exception
  when undefined_table then
    -- subscriptions / nigos tables may not exist on a fresh project; return
    -- the agencies list without those aggregates rather than 500ing.
    return query
      select a.id, a.name, a.slug,
             coalesce((a.settings->>'plan')::text, 'trial')   as plan,
             coalesce(a.is_demo, false)                       as is_demo,
             (select count(*)::int from public.agency_members m where m.agency_id = a.id and m.active is not false) as member_count,
             (select count(*)::int from public.reps r where r.agency_id = a.id) as rep_count,
             0::int                                            as open_nigos,
             0::bigint                                         as mrr_cents,
             a.created_at
        from public.agencies a
       where (p_include_demo or coalesce(a.is_demo, false) = false)
       order by a.created_at desc;
end;
$$;

grant execute on function public.platform_agencies_summary(boolean) to authenticated;

create or replace function public.platform_users_summary(p_limit int default 200, p_offset int default 0)
returns table (
  user_id      uuid,
  email        text,
  agencies     text,
  roles        text,
  is_super     boolean,
  last_sign_in timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  return query
    select
      u.id                              as user_id,
      u.email::text                     as email,
      coalesce(string_agg(distinct a.name, ', '), '—') as agencies,
      coalesce(string_agg(distinct m.role, ', '), '—') as roles,
      exists(select 1 from public.koino_super_admins s where s.user_id = u.id and s.active = true) as is_super,
      u.last_sign_in_at                 as last_sign_in
    from auth.users u
    left join public.agency_members m on m.user_id = u.id and m.active is not false
    left join public.agencies        a on a.id = m.agency_id
    group by u.id, u.email, u.last_sign_in_at
    order by u.last_sign_in_at desc nulls last
    limit p_limit offset p_offset;
end;
$$;

grant execute on function public.platform_users_summary(int, int) to authenticated;

create or replace function public.platform_audit_recent(p_limit int default 200, p_kind text default null, p_hours int default 24)
returns table (
  id          uuid,
  agency_id   uuid,
  agency_name text,
  actor_user_id uuid,
  actor_email text,
  actor_role  text,
  kind        text,
  action      text,
  target      text,
  metadata    jsonb,
  severity    text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  return query
    select
      l.id, l.agency_id, a.name as agency_name,
      l.actor_user_id, u.email::text as actor_email,
      l.actor_role, coalesce(l.kind, l.action) as kind, l.action, l.target,
      l.metadata, l.severity, l.created_at
    from public.agency_audit_log l
    left join public.agencies a on a.id = l.agency_id
    left join auth.users     u on u.id = l.actor_user_id
    where l.created_at > now() - (p_hours::text || ' hours')::interval
      and (p_kind is null or l.kind = p_kind or l.action = p_kind)
    order by l.created_at desc
    limit p_limit;
end;
$$;

grant execute on function public.platform_audit_recent(int, text, int) to authenticated;

create or replace function public.platform_hq_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency_count int;
  v_active_24h   int;
  v_audit_24h    int;
  v_mrr_cents    bigint;
  v_open_nigos   int;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  select count(*)::int into v_agency_count from public.agencies where coalesce(is_demo, false) = false;
  select count(distinct actor_user_id)::int into v_active_24h
    from public.agency_audit_log
   where created_at > now() - interval '24 hours' and actor_user_id is not null;
  select count(*)::int into v_audit_24h
    from public.agency_audit_log
   where created_at > now() - interval '24 hours';
  begin
    select coalesce(sum(amount_cents)::bigint, 0) into v_mrr_cents
      from public.subscriptions
     where status in ('active','trialing');
  exception when undefined_table then v_mrr_cents := 0; end;
  begin
    select count(*)::int into v_open_nigos
      from public.nigos
     where status = 'open';
  exception when undefined_table then v_open_nigos := 0; end;

  return jsonb_build_object(
    'agency_count',  v_agency_count,
    'active_24h',    v_active_24h,
    'audit_24h',     v_audit_24h,
    'mrr_cents',     v_mrr_cents,
    'open_nigos',    v_open_nigos,
    'generated_at',  now()
  );
end;
$$;

grant execute on function public.platform_hq_kpis() to authenticated;

------------------------------------------------------------------------------
-- 8. super_admin_act_as — sets the impersonation target + logs both ends
------------------------------------------------------------------------------
-- The frontend already uses localStorage.repflow.active_agency to scope every
-- fetch (data.jsx scope()). This RPC simply validates + logs the start/stop
-- so the target agency's owner can see "Ian was in your tenant on
-- 2026-05-12 at 14:32" in their own audit log.

create or replace function public.super_admin_act_as_start(p_target_agency uuid, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  if not exists (select 1 from public.agencies where id = p_target_agency) then
    raise exception 'agency not found: %', p_target_agency;
  end if;
  insert into public.agency_audit_log
    (agency_id, actor_user_id, actor_role, kind, action, target, severity, metadata)
  values
    (p_target_agency, auth.uid(), 'super_admin', 'super_admin_act_as_start',
     'super_admin_act_as_start', p_target_agency::text, 'warn',
     jsonb_build_object('reason', coalesce(p_reason, '')))
  returning id into v_log_id;
  return v_log_id;
end;
$$;

grant execute on function public.super_admin_act_as_start(uuid, text) to authenticated;

create or replace function public.super_admin_act_as_stop(p_target_agency uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  insert into public.agency_audit_log
    (agency_id, actor_user_id, actor_role, kind, action, target, severity)
  values
    (p_target_agency, auth.uid(), 'super_admin', 'super_admin_act_as_stop',
     'super_admin_act_as_stop', p_target_agency::text, 'info');
end;
$$;

grant execute on function public.super_admin_act_as_stop(uuid) to authenticated;

------------------------------------------------------------------------------
-- 9. Feature flags — global + per-agency editor RPCs
------------------------------------------------------------------------------
-- Global flags live as keys in org_settings under prefix `feature_flag.*`.
-- Per-agency overrides live in `agencies.config jsonb -> 'feature_flags'`.
-- Same storage path as lib/agency-config.js already uses; we just nest one
-- key deeper. UI editor (Flags subpage) reads and writes both surfaces.

create or replace function public.platform_set_global_flag(p_name text, p_value jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  insert into public.org_settings (key, value, updated_at, updated_by)
    values ('feature_flag.' || p_name, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.agency_audit_log (agency_id, actor_user_id, actor_role, kind, action, target, metadata, severity)
    values (null, auth.uid(), 'super_admin', 'feature_flag_changed', 'set_global_flag', p_name,
            jsonb_build_object('value', p_value), 'warn');
end;
$$;
grant execute on function public.platform_set_global_flag(text, jsonb) to authenticated;

create or replace function public.platform_set_agency_flag(p_agency uuid, p_name text, p_value jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  select coalesce(config, '{}'::jsonb) into v_cfg from public.agencies where id = p_agency;
  v_cfg := jsonb_set(v_cfg, array['feature_flags', p_name], p_value, true);
  update public.agencies set config = v_cfg where id = p_agency;
  insert into public.agency_audit_log (agency_id, actor_user_id, actor_role, kind, action, target, metadata, severity)
    values (p_agency, auth.uid(), 'super_admin', 'feature_flag_changed', 'set_agency_flag', p_name,
            jsonb_build_object('value', p_value), 'warn');
end;
$$;
grant execute on function public.platform_set_agency_flag(uuid, text, jsonb) to authenticated;

------------------------------------------------------------------------------
-- 10. Seed super-admins from env (deferred; safe no-op if env unset)
------------------------------------------------------------------------------
-- We can't read env vars from a SQL migration directly. The seed path is:
--   1) UI on platform-admin Users page calls platform_seed_super_admin(email).
--   2) Operator runs an `INSERT ... ON CONFLICT` manually with their list.
-- Either way, we expose a helper that idempotently grants by email if a
-- matching auth.users row exists.

create or replace function public.platform_seed_super_admin(p_email text, p_notes text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  -- The very first call must be made by the service-role key (otherwise no
  -- one is a super-admin yet, so is_super_admin() is false). After that,
  -- only existing super-admins can promote new ones.
  if not public.is_super_admin() and current_user <> 'service_role' then
    raise exception 'forbidden: super_admin or service_role required';
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return false;
  end if;
  insert into public.koino_super_admins (user_id, email, granted_by, active, notes)
    values (v_user_id, lower(p_email), coalesce(auth.uid(), v_user_id), true, p_notes)
  on conflict (user_id) do update set active = true, notes = coalesce(excluded.notes, public.koino_super_admins.notes);
  insert into public.agency_audit_log (agency_id, actor_user_id, actor_role, kind, action, target, severity)
    values (null, coalesce(auth.uid(), v_user_id), 'super_admin', 'super_admin_granted', 'super_admin_granted', p_email, 'warn');
  return true;
end;
$$;
grant execute on function public.platform_seed_super_admin(text, text) to authenticated;

create or replace function public.platform_revoke_super_admin(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return false;
  end if;
  update public.koino_super_admins set active = false where user_id = v_user_id;
  insert into public.agency_audit_log (agency_id, actor_user_id, actor_role, kind, action, target, severity)
    values (null, auth.uid(), 'super_admin', 'super_admin_revoked', 'super_admin_revoked', p_email, 'warn');
  return true;
end;
$$;
grant execute on function public.platform_revoke_super_admin(text) to authenticated;
