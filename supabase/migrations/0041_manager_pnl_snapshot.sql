-- 0041_manager_pnl_snapshot.sql
-- Server-side P&L rollup for the manager/owner P&L page.
--
-- Deliverables:
--   A. Idempotent realtime registration for policies + agency_expenses
--   B. manager_pnl_snapshot(p_agency_id, p_from, p_to, p_scope)
--      Returns one row per rep with deals / AP / earned comm / expenses / net.
--      Scoping: 'agency' = all reps; 'downline' = only direct upline children.

------------------------------------------------------------------------------
-- A. Realtime publication (idempotent)
------------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.policies;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_expenses;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END;
END$$;

------------------------------------------------------------------------------
-- B. manager_pnl_snapshot
------------------------------------------------------------------------------
create or replace function public.manager_pnl_snapshot(
  p_agency_id  uuid,
  p_from       date,
  p_to         date,
  p_scope      text default 'agency'   -- 'agency' | 'downline'
)
returns table (
  rep_id              text,
  rep_name            text,
  rep_handle          text,
  deals               bigint,
  submitted_ap_cents  bigint,
  earned_comm_cents   bigint,
  expenses_cents      bigint,
  net_cents           bigint
)
language plpgsql stable security definer set search_path = public, pg_catalog
as $$
declare
  v_role    text;
  v_rep_id  text;
begin
  -- Caller must be an active member of this agency with elevated role.
  select m.role, m.rep_id
    into v_role, v_rep_id
    from public.agency_members m
   where m.agency_id = p_agency_id
     and m.user_id   = auth.uid()
     and m.active    = true
   limit 1;

  if v_role is null or v_role not in ('manager','owner','admin','super_admin') then
    return; -- empty result, no error leakage
  end if;

  return query
  with
  -- Rep universe (scope: all or direct downline of calling manager)
  rep_scope as (
    select r.id as rep_id, r.name as rep_name, r.handle as rep_handle
    from public.reps r
    where r.agency_id = p_agency_id
      and (
        p_scope = 'agency'
        or (
          p_scope = 'downline' and (
            r.id        = v_rep_id
            or r.upline_id = v_rep_id
          )
        )
      )
  ),
  -- Submitted AP: policies whose submission_date falls in [from, to]
  pol as (
    select
      p.owner_rep_id                       as rep_id,
      count(*)::bigint                     as deals,
      coalesce(sum(p.ap_cents), 0)::bigint as ap_cents
    from public.policies p
    where p.agency_id       = p_agency_id
      and p.submission_date >= p_from
      and p.submission_date <= p_to
      and p.owner_rep_id    is not null
    group by p.owner_rep_id
  ),
  -- Earned commissions: commissions.earned_at in [from, to]
  -- Join to policies to enforce agency boundary (commissions.rep_id alone
  -- doesn't carry agency_id; the policy does).
  comm as (
    select
      c.rep_id,
      coalesce(sum(c.amount_cents), 0)::bigint as earned_cents
    from public.commissions c
    join public.policies    p on p.id = c.policy_id
    where p.agency_id  = p_agency_id
      and c.earned_at >= p_from::timestamptz
      and c.earned_at <  (p_to + 1)::timestamptz
    group by c.rep_id
  ),
  -- OOP expenses: agency_expenses rows where paid_by_rep_id = the rep
  exp as (
    select
      e.paid_by_rep_id                         as rep_id,
      coalesce(sum(e.amount_cents), 0)::bigint as expense_cents
    from public.agency_expenses e
    where e.agency_id      = p_agency_id
      and e.paid_at        >= p_from
      and e.paid_at        <= p_to
      and e.paid_by_rep_id is not null
    group by e.paid_by_rep_id
  )
  select
    rs.rep_id,
    rs.rep_name,
    rs.rep_handle,
    coalesce(pol.deals,         0) as deals,
    coalesce(pol.ap_cents,      0) as submitted_ap_cents,
    coalesce(comm.earned_cents, 0) as earned_comm_cents,
    coalesce(exp.expense_cents, 0) as expenses_cents,
    coalesce(comm.earned_cents, 0) - coalesce(exp.expense_cents, 0) as net_cents
  from rep_scope rs
  left join pol  on pol.rep_id  = rs.rep_id
  left join comm on comm.rep_id = rs.rep_id
  left join exp  on exp.rep_id  = rs.rep_id
  where coalesce(pol.deals,         0) > 0
     or coalesce(comm.earned_cents, 0) > 0
     or coalesce(exp.expense_cents, 0) > 0
  order by (coalesce(comm.earned_cents, 0) - coalesce(exp.expense_cents, 0)) desc nulls last;
end;
$$;

grant execute on function public.manager_pnl_snapshot(uuid, date, date, text) to authenticated;
