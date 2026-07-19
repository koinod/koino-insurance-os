-- 0110_rep_activity_10pm_eastern_day.sql
--
-- RepFlow's production day resets at 10 PM Eastern. Manual tracker taps
-- already persist an activity_date from the browser; canonical sources
-- (calls, appointments, policies) need the same business-day bucketing.

set local search_path = public;

create or replace function public.repflow_business_date(p_ts timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select ((p_ts at time zone 'America/New_York') + interval '2 hours')::date;
$$;

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
      public.repflow_business_date(ce.created_at) as activity_date,
      count(distinct coalesce(ce.call_sid, ce.id::text))::integer as dials,
      count(distinct coalesce(ce.call_sid, ce.id::text)) filter (
        where lower(coalesce(ce.status, '')) in ('completed','in-progress','answered')
      )::integer as contacts
    from public.call_events ce
    where ce.agency_id = p_agency
      and ce.rep_id is not null
      and public.repflow_business_date(ce.created_at) between p_start and v_end
      and (p_rep_ids is null or ce.rep_id = any (p_rep_ids))
    group by ce.rep_id, public.repflow_business_date(ce.created_at)
  ),
  appts as (
    select
      a.owner_rep_id as rep_id,
      public.repflow_business_date(a.starts_at) as activity_date,
      count(*)::integer as appointments
    from public.appointments a
    where a.agency_id = p_agency
      and a.owner_rep_id is not null
      and a.status in ('scheduled','rescheduled','completed')
      and public.repflow_business_date(a.starts_at) between p_start and v_end
      and (p_rep_ids is null or a.owner_rep_id = any (p_rep_ids))
    group by a.owner_rep_id, public.repflow_business_date(a.starts_at)
  ),
  policy_rows as (
    select
      p.owner_rep_id as rep_id,
      public.repflow_business_date(p.created_at) as activity_date,
      count(*)::integer as deals,
      coalesce(sum(p.ap_cents), 0)::bigint as ap_cents
    from public.policies p
    where p.agency_id = p_agency
      and p.owner_rep_id is not null
      and public.repflow_business_date(p.created_at) between p_start and v_end
      and (p_rep_ids is null or p.owner_rep_id = any (p_rep_ids))
    group by p.owner_rep_id, public.repflow_business_date(p.created_at)
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

revoke all on function public.repflow_business_date(timestamptz) from public, anon;
grant execute on function public.repflow_business_date(timestamptz) to authenticated;
revoke all on function public.rep_activity_rollup(uuid, date, date, text[]) from public, anon;
grant execute on function public.rep_activity_rollup(uuid, date, date, text[]) to authenticated;
