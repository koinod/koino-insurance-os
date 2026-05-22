-- 0065_call_events_rep_id.sql
--
-- Make call_events attributable to a rep so the leaderboard "Dials today"
-- column can be a real query instead of a stale counter on reps.dials.
--
--   1. Add nullable rep_id column + index on (rep_id, created_at desc).
--   2. RPC dials_today_by_rep(p_agency uuid) returns (rep_id text, count int)
--      for every rep in the agency that has at least one dial today.
--      RLS via viewer_agency_ids() — caller must be a member of p_agency
--      (or super-admin) to read.
--
-- No backfill needed — call_events currently has 0 rows in prod.
-- /api/dial/outbound.js will start writing rep_id on every new dial in the
-- companion code change.

alter table public.call_events
  add column if not exists rep_id text references public.reps(id) on delete set null;

create index if not exists call_events_rep_idx
  on public.call_events (rep_id, created_at desc);

create or replace function public.dials_today_by_rep(p_agency uuid)
returns table (rep_id text, dials_today int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_super_admin() or p_agency = any (public.viewer_agency_ids())) then
    raise exception 'forbidden: not a member of agency %', p_agency;
  end if;
  return query
  select ce.rep_id, count(*)::int as dials_today
    from public.call_events ce
   where ce.agency_id = p_agency
     and ce.rep_id is not null
     and ce.created_at >= (now() at time zone 'America/New_York')::date
   group by ce.rep_id;
end;
$$;

revoke all on function public.dials_today_by_rep(uuid) from public, anon;
grant execute on function public.dials_today_by_rep(uuid) to authenticated;
