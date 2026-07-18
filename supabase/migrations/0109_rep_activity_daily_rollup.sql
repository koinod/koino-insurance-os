-- 0109_rep_activity_daily_rollup.sql
--
-- Durable rep activity ledger for Manager Today. Manual taps, imported dialer
-- counts, and future external sources append here; the rollup RPC combines the
-- ledger with canonical call_events, sales appointments, and policies.

set local search_path = public;

create table if not exists public.rep_activity_events (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  rep_id          text not null references public.reps(id) on delete cascade,
  activity_date   date not null,
  metric          text not null check (metric in ('dial','contact','lead','appointment','presentation','deal','lead_spend','ap')),
  delta_count     integer not null default 0,
  amount_cents    integer not null default 0,
  source          text not null default 'manual',
  external_id     text,
  payload         jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists rep_activity_events_agency_date_idx
  on public.rep_activity_events (agency_id, activity_date desc);
create index if not exists rep_activity_events_rep_date_idx
  on public.rep_activity_events (rep_id, activity_date desc);
create unique index if not exists rep_activity_events_external_uidx
  on public.rep_activity_events (agency_id, source, external_id)
  where external_id is not null;

alter table public.rep_activity_events enable row level security;

drop policy if exists "rep_activity_visible" on public.rep_activity_events;
create policy "rep_activity_visible" on public.rep_activity_events
  for select to authenticated using (
    public.is_super_admin() or agency_id in (select public.viewer_agency_ids())
  );

drop policy if exists "rep_activity_insert" on public.rep_activity_events;
create policy "rep_activity_insert" on public.rep_activity_events
  for insert to authenticated with check (
    public.is_super_admin()
    or exists (
      select 1
      from public.agency_members m
      where m.user_id = auth.uid()
        and m.agency_id = rep_activity_events.agency_id
        and m.active = true
    )
  );

drop policy if exists "rep_activity_update_manager" on public.rep_activity_events;
create policy "rep_activity_update_manager" on public.rep_activity_events
  for update to authenticated using (
    public.is_super_admin()
    or exists (
      select 1
      from public.agency_members m
      where m.user_id = auth.uid()
        and m.agency_id = rep_activity_events.agency_id
        and m.active = true
        and m.role in ('manager','owner','super_admin','imo_owner','admin')
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
      from public.agency_members m
      where m.user_id = auth.uid()
        and m.agency_id = rep_activity_events.agency_id
        and m.active = true
        and m.role in ('manager','owner','super_admin','imo_owner','admin')
    )
  );

create or replace function public.rep_activity_rollup(
  p_agency uuid,
  p_start date,
  p_end date default null,
  p_rep_ids text[] default null
)
returns table (
  rep_id text,
  activity_date date,
  dials integer,
  contacts integer,
  leads integer,
  appointments integer,
  presentations integer,
  deals integer,
  ap_cents bigint,
  lead_spend_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_end date := coalesce(p_end, p_start);
begin
  if not (public.is_super_admin() or p_agency in (select public.viewer_agency_ids())) then
    raise exception 'forbidden: not a member of agency %', p_agency;
  end if;

  return query
  with manual as (
    select
      e.rep_id,
      e.activity_date,
      sum(e.delta_count) filter (where e.metric = 'dial')::integer as dials,
      sum(e.delta_count) filter (where e.metric = 'contact')::integer as contacts,
      sum(e.delta_count) filter (where e.metric = 'lead')::integer as leads,
      sum(e.delta_count) filter (where e.metric = 'appointment')::integer as appointments,
      sum(e.delta_count) filter (where e.metric = 'presentation')::integer as presentations,
      sum(e.delta_count) filter (where e.metric = 'deal')::integer as deals,
      sum(e.amount_cents) filter (where e.metric = 'ap')::bigint as ap_cents,
      sum(e.amount_cents) filter (where e.metric = 'lead_spend')::bigint as lead_spend_cents
    from public.rep_activity_events e
    where e.agency_id = p_agency
      and e.activity_date between p_start and v_end
      and (p_rep_ids is null or e.rep_id = any (p_rep_ids))
    group by e.rep_id, e.activity_date
  ),
  calls as (
    select
      ce.rep_id,
      (ce.created_at at time zone 'America/New_York')::date as activity_date,
      count(distinct coalesce(ce.call_sid, ce.id::text))::integer as dials,
      count(distinct coalesce(ce.call_sid, ce.id::text)) filter (
        where lower(coalesce(ce.status, '')) in ('completed','in-progress','answered')
      )::integer as contacts
    from public.call_events ce
    where ce.agency_id = p_agency
      and ce.rep_id is not null
      and (ce.created_at at time zone 'America/New_York')::date between p_start and v_end
      and (p_rep_ids is null or ce.rep_id = any (p_rep_ids))
    group by ce.rep_id, (ce.created_at at time zone 'America/New_York')::date
  ),
  appts as (
    select
      a.owner_rep_id as rep_id,
      (a.starts_at at time zone 'America/New_York')::date as activity_date,
      count(*)::integer as appointments
    from public.appointments a
    where a.agency_id = p_agency
      and a.owner_rep_id is not null
      and a.status in ('scheduled','rescheduled','completed')
      and (a.starts_at at time zone 'America/New_York')::date between p_start and v_end
      and (p_rep_ids is null or a.owner_rep_id = any (p_rep_ids))
    group by a.owner_rep_id, (a.starts_at at time zone 'America/New_York')::date
  ),
  policy_rows as (
    select
      p.owner_rep_id as rep_id,
      (p.created_at at time zone 'America/New_York')::date as activity_date,
      count(*)::integer as deals,
      coalesce(sum(p.ap_cents), 0)::bigint as ap_cents
    from public.policies p
    where p.agency_id = p_agency
      and p.owner_rep_id is not null
      and (p.created_at at time zone 'America/New_York')::date between p_start and v_end
      and (p_rep_ids is null or p.owner_rep_id = any (p_rep_ids))
    group by p.owner_rep_id, (p.created_at at time zone 'America/New_York')::date
  ),
  unioned as (
    select m.rep_id, m.activity_date,
      coalesce(m.dials, 0) dials, coalesce(m.contacts, 0) contacts, coalesce(m.leads, 0) leads,
      coalesce(m.appointments, 0) appointments, coalesce(m.presentations, 0) presentations,
      coalesce(m.deals, 0) deals, coalesce(m.ap_cents, 0) ap_cents,
      coalesce(m.lead_spend_cents, 0) lead_spend_cents
    from manual m
    union all
    select c.rep_id, c.activity_date, c.dials, c.contacts, 0, 0, 0, 0, 0, 0 from calls c
    union all
    select a.rep_id, a.activity_date, 0, 0, 0, a.appointments, 0, 0, 0, 0 from appts a
    union all
    select p.rep_id, p.activity_date, 0, 0, 0, 0, 0, p.deals, p.ap_cents, 0 from policy_rows p
  )
  select
    u.rep_id,
    u.activity_date,
    greatest(0, sum(u.dials))::integer as dials,
    greatest(0, sum(u.contacts))::integer as contacts,
    greatest(0, sum(u.leads))::integer as leads,
    greatest(0, sum(u.appointments))::integer as appointments,
    greatest(0, sum(u.presentations))::integer as presentations,
    greatest(0, sum(u.deals))::integer as deals,
    greatest(0, sum(u.ap_cents))::bigint as ap_cents,
    greatest(0, sum(u.lead_spend_cents))::bigint as lead_spend_cents
  from unioned u
  group by u.rep_id, u.activity_date
  order by u.activity_date desc, u.rep_id;
end;
$$;

revoke all on function public.rep_activity_rollup(uuid, date, date, text[]) from public, anon;
grant execute on function public.rep_activity_rollup(uuid, date, date, text[]) to authenticated;

do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin alter publication supabase_realtime add table public.rep_activity_events; exception when duplicate_object then null; end;
  end if;
end $$;
