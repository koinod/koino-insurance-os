-- 0020 super_admin section-drill RPCs.
--
-- Companion to 0019. Adds the platform RPCs needed for the per-section
-- wiring delta documented in SUPERADMIN_AUDIT_REPORT.md (F) — every drill
-- the previous pass left as a stub now has a real query behind it.
--
-- New functions (all security-definer, all gated on is_super_admin()):
--   platform_hq_mrr_trend(days)              — daily MRR series for sparkline
--   platform_fleet_status()                   — hardware + ai_agents joined
--   platform_audit_export(...)                — CSV-friendly audit pull
--   flag_blocker_on_operator(agency,kind,...) — writer that feeds the BLOCKERS card
--   resolve_blocker(blocker_id, note)         — closes a blocker + audits the close
--
-- Also seeds three example feature flags so the new consumer (lib/feature-flags.js)
-- has something to read on first boot.

------------------------------------------------------------------------------
-- 1. MRR sparkline — daily series for last p_days
------------------------------------------------------------------------------
-- We don't yet have a daily MRR snapshot table. This computes a synthetic
-- series from the live subscriptions table: for each day in the window, sum
-- amount_cents where started_at <= day < canceled_at (or canceled_at is null).
-- If subscriptions doesn't exist, returns the window of days with mrr_cents=0
-- rather than 500ing.

create or replace function public.platform_hq_mrr_trend(p_days int default 7)
returns table (day date, mrr_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_subs boolean;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  select exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='subscriptions'
  ) into v_has_subs;
  if not v_has_subs then
    return query
      select gs::date as day, 0::bigint as mrr_cents
        from generate_series(now()::date - (p_days - 1), now()::date, '1 day'::interval) gs;
    return;
  end if;
  return query
    with days as (
      select gs::date as d
        from generate_series(now()::date - (p_days - 1), now()::date, '1 day'::interval) gs
    )
    select d.d as day,
           coalesce((
             select sum(s.amount_cents)::bigint
               from public.subscriptions s
              where s.status in ('active','trialing')
                and coalesce(s.created_at, s.started_at, now()) <= (d.d + 1)
                and (s.canceled_at is null or s.canceled_at > d.d)
           ), 0) as mrr_cents
      from days d
      order by d.d;
exception
  when undefined_column then
    -- subscriptions schema differs from what we expect; degrade gracefully
    return query
      select gs::date as day, 0::bigint as mrr_cents
        from generate_series(now()::date - (p_days - 1), now()::date, '1 day'::interval) gs;
end;
$$;
grant execute on function public.platform_hq_mrr_trend(int) to authenticated;

------------------------------------------------------------------------------
-- 2. Fleet status — hardware + ai_agents joined
------------------------------------------------------------------------------
-- The hardware table has no agency_id (it's platform-shared infra), so this
-- is a straight cross-tenant fetch with no scope concern. We still gate on
-- super_admin so the auth chain is consistent with the other platform RPCs.

create or replace function public.platform_fleet_status()
returns table (
  host_id          text,
  host_name        text,
  kind             text,
  status           text,
  uptime_text      text,
  load_pct         integer,
  agent_count      integer,
  last_heartbeat   timestamptz,
  heartbeat_age_s  bigint,
  agents           jsonb
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
      h.id, h.name, h.kind, h.status,
      h.uptime_text, h.load_pct, h.agent_count,
      h.last_heartbeat,
      extract(epoch from (now() - h.last_heartbeat))::bigint as heartbeat_age_s,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id, 'name', a.name,
            'success_rate', a.success_rate,
            'last_seen', a.last_seen
          ) order by a.last_seen desc
        )
        from public.ai_agents a where a.host_id = h.id
      ), '[]'::jsonb) as agents
    from public.hardware h
    order by h.last_heartbeat desc;
end;
$$;
grant execute on function public.platform_fleet_status() to authenticated;

------------------------------------------------------------------------------
-- 3. Audit export — same shape as platform_audit_recent but flat for CSV
------------------------------------------------------------------------------
create or replace function public.platform_audit_export(
  p_hours int default 168,
  p_kind text default null,
  p_agency uuid default null,
  p_limit int default 5000
)
returns table (
  when_ts        timestamptz,
  agency         text,
  kind           text,
  target         text,
  actor_email    text,
  actor_role     text,
  severity       text,
  metadata_json  text
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
      l.created_at,
      a.name,
      coalesce(l.kind, l.action),
      l.target,
      u.email::text,
      l.actor_role,
      l.severity,
      l.metadata::text
    from public.agency_audit_log l
    left join public.agencies a on a.id = l.agency_id
    left join auth.users     u on u.id = l.actor_user_id
    where l.created_at > now() - (p_hours::text || ' hours')::interval
      and (p_kind   is null or l.kind = p_kind or l.action = p_kind)
      and (p_agency is null or l.agency_id = p_agency)
    order by l.created_at desc
    limit p_limit;
end;
$$;
grant execute on function public.platform_audit_export(int, text, uuid, int) to authenticated;

------------------------------------------------------------------------------
-- 4. flag_blocker_on_operator — writer that feeds the HQ BLOCKERS card
------------------------------------------------------------------------------
-- Any process (cron, agent, manual UI) can call this to surface an
-- operator-dependent item. Audit row with kind='blocker_on_operator' is
-- what the BLOCKERS panel reads.

create or replace function public.flag_blocker_on_operator(
  p_agency_id uuid,
  p_kind text,
  p_target text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_severity text default 'warn'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Anyone with access to the target agency OR a super-admin can flag a
  -- blocker. Use viewer_agency_ids() to check membership.
  if not public.is_super_admin()
     and p_agency_id is not null
     and p_agency_id not in (select public.viewer_agency_ids()) then
    raise exception 'forbidden: not a member of agency %', p_agency_id;
  end if;
  insert into public.agency_audit_log
    (agency_id, actor_user_id, actor_role, kind, action, target, metadata, severity)
  values
    (p_agency_id, auth.uid(), 'system', 'blocker_on_operator',
     p_kind, p_target, coalesce(p_metadata, '{}'::jsonb), coalesce(p_severity, 'warn'))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.flag_blocker_on_operator(uuid, text, text, jsonb, text) to authenticated;

------------------------------------------------------------------------------
-- 5. resolve_blocker — closes a blocker
------------------------------------------------------------------------------
-- Writes a follow-up audit row referencing the original, and patches the
-- original row's metadata with `resolved=true, resolved_at=now()`. The HQ
-- BLOCKERS card filters by `metadata->>'resolved' is null` (added below).

create or replace function public.resolve_blocker(p_blocker_id uuid, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_kind   text;
  v_target text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden: super_admin required';
  end if;
  select agency_id, kind, target into v_agency, v_kind, v_target
    from public.agency_audit_log where id = p_blocker_id;
  if v_agency is null and v_kind is null then
    raise exception 'blocker not found: %', p_blocker_id;
  end if;
  update public.agency_audit_log
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('resolved', true,
                                          'resolved_at', now(),
                                          'resolved_by', auth.uid(),
                                          'resolution_note', coalesce(p_note, ''))
   where id = p_blocker_id;
  insert into public.agency_audit_log
    (agency_id, actor_user_id, actor_role, kind, action, target, metadata, severity)
  values
    (v_agency, auth.uid(), 'super_admin', 'blocker_resolved',
     'blocker_resolved', v_target,
     jsonb_build_object('blocker_id', p_blocker_id, 'note', coalesce(p_note, '')),
     'info');
end;
$$;
grant execute on function public.resolve_blocker(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- 6. Seed three example feature flags
------------------------------------------------------------------------------
-- Idempotent — won't clobber values an operator has already set. The
-- comments name the consumer file for each flag so a future audit can
-- trace flag usage. (For now only predictive_cards is read at runtime;
-- the other two are scaffolding.)

insert into public.org_settings (key, value)
values
  ('feature_flag.predictive_cards', 'true'::jsonb),
  ('feature_flag.repflow_desktop_install', 'false'::jsonb),
  ('feature_flag.stripe_billing_admin', 'false'::jsonb)
on conflict (key) do nothing;

comment on column public.org_settings.value is
  'For feature_flag.* keys: scalar JSON value (bool / number / string / JSON). Read via window.featureFlag(name, default) in lib/feature-flags.js. Per-agency overrides live in agencies.config.feature_flags.<name>.';
