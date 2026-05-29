-- 0080_leaderboard_wtd_rpc.sql
-- Decouples the rep leaderboard's WTD ranking from raw per-rep policy reads,
-- so migration 0081 can tighten policies RLS to rep-own without breaking the
-- leaderboard. SECURITY DEFINER aggregate: returns per-rep issued AP for the
-- current week (Sunday start, matching the JS), agency-guarded so a caller
-- only ever gets totals for an agency they belong to (no cross-tenant leak,
-- no per-row commission exposure — only aggregate AP for ranking).

create or replace function public.leaderboard_wtd(p_agency_id uuid)
returns table(rep_id text, wtd_ap_cents bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.owner_rep_id, coalesce(sum(p.ap_cents), 0)::bigint
  from public.policies p
  where p.agency_id = p_agency_id
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.agency_members m
        where m.user_id = auth.uid() and m.agency_id = p_agency_id and m.active
      )
    )
    and p.status in ('issued', 'active')
    and p.owner_rep_id is not null
    and p.issued_at >= (current_date - extract(dow from current_date)::int)
  group by p.owner_rep_id;
$$;

revoke execute on function public.leaderboard_wtd(uuid) from public, anon;
grant  execute on function public.leaderboard_wtd(uuid) to authenticated;
