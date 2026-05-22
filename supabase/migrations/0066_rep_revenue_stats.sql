-- 0066_rep_revenue_stats.sql
--
-- Real-time replacement for stale reps.today_cents / reps.mtd_cents counters.
-- These columns initialize to 0 and are never updated by any code path —
-- the leaderboard's "Today" and "MTD" columns showed 0 for every real agency.
--
-- Single RPC returns today + month-to-date in one query (one round-trip per
-- agency hydration). Both windows use America/New_York day/month boundaries
-- to match insurance-ops business calendar.

create or replace function public.revenue_today_and_mtd_by_rep(p_agency uuid)
returns table (
  rep_id          text,
  today_dollars   bigint,
  mtd_dollars     bigint,
  today_policies  int,
  mtd_policies    int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_mtd_start date := date_trunc('month', (now() at time zone 'America/New_York')::date)::date;
begin
  if not (public.is_super_admin() or p_agency = any (public.viewer_agency_ids())) then
    raise exception 'forbidden: not a member of agency %', p_agency;
  end if;
  return query
  select
    p.owner_rep_id as rep_id,
    sum(case when p.created_at >= v_today then p.ap_cents else 0 end)::bigint / 100 as today_dollars,
    sum(case when p.created_at >= v_mtd_start then p.ap_cents else 0 end)::bigint / 100 as mtd_dollars,
    count(*) filter (where p.created_at >= v_today)::int as today_policies,
    count(*) filter (where p.created_at >= v_mtd_start)::int as mtd_policies
  from public.policies p
  where p.agency_id = p_agency
    and p.owner_rep_id is not null
    and p.created_at >= v_mtd_start
  group by p.owner_rep_id;
end;
$$;

revoke all on function public.revenue_today_and_mtd_by_rep(uuid) from public, anon;
grant execute on function public.revenue_today_and_mtd_by_rep(uuid) to authenticated;
