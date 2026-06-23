-- 0083_expense_pnl_crm_hardening.sql
--
-- Closes the expense/P&L security gap found after the local smoke repair:
-- later lockdown work reintroduced broad agency-member write access to
-- agency_expenses. Expenses now follow the financial-data model:
--   * owner/admin/imo_owner/super_admin: full agency expense ledger
--   * manager: own-created/downline spend only
--   * rep: own out-of-pocket rows only
--
-- Also forces the expense rollup views to run as SECURITY INVOKER so they
-- cannot bypass the row policies above.

-- Later financial RLS depends on direct agency_id columns. Some live DBs had
-- these added out-of-band; make this migration self-contained and backfill
-- from the policy/rep spine before policies reference them.
alter table public.commissions
  add column if not exists agency_id uuid;
alter table public.payouts
  add column if not exists agency_id uuid;
alter table public.clawbacks
  add column if not exists agency_id uuid;

update public.commissions c
   set agency_id = p.agency_id
  from public.policies p
 where c.policy_id = p.id
   and c.agency_id is null;

update public.payouts py
   set agency_id = r.agency_id
  from public.reps r
 where py.rep_id = r.id
   and py.agency_id is null;

update public.clawbacks cb
   set agency_id = p.agency_id
  from public.policies p
 where cb.policy_id = p.id
   and cb.agency_id is null;

update public.clawbacks cb
   set agency_id = r.agency_id
  from public.reps r
 where cb.rep_id = r.id
   and cb.agency_id is null;

create index if not exists commissions_agency_idx on public.commissions (agency_id, earned_at desc);
create index if not exists payouts_agency_idx on public.payouts (agency_id, period_end desc);
create index if not exists clawbacks_agency_idx on public.clawbacks (agency_id, recorded_at desc);

-- ===== Financial table RLS: managers are downline-scoped, owners/admins full =====
drop policy if exists "policies read role-aware"       on public.policies;
drop policy if exists "policies insert agency member"  on public.policies;
drop policy if exists "policies update manager+"       on public.policies;
drop policy if exists "policies delete manager+"       on public.policies;

create policy "policies read scoped finance" on public.policies
  for select to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or owner_rep_id = public.my_rep_id_in_agency(agency_id)
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and owner_rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  );

create policy "policies insert scoped finance" on public.policies
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      agency_id in (select public.viewer_agency_ids())
      and public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    )
    or (
      agency_id in (select public.viewer_agency_ids())
      and public.viewer_role_in(agency_id) = 'manager'
      and owner_rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
    or (
      agency_id in (select public.viewer_agency_ids())
      and owner_rep_id = public.my_rep_id_in_agency(agency_id)
    )
  );

create policy "policies update scoped finance" on public.policies
  for update to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and owner_rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  )
  with check (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and owner_rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  );

create policy "policies delete scoped finance" on public.policies
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and owner_rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  );

drop policy if exists "commissions read role-aware"   on public.commissions;
drop policy if exists "commissions write manager+"    on public.commissions;
drop policy if exists "payouts read role-aware"       on public.payouts;
drop policy if exists "payouts write manager+"        on public.payouts;
drop policy if exists "clawbacks read role-aware"     on public.clawbacks;
drop policy if exists "clawbacks write manager+"      on public.clawbacks;

create policy "commissions read scoped finance" on public.commissions
  for select to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or rep_id = public.my_rep_id_in_agency(agency_id)
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  );

create policy "commissions write owner finance" on public.commissions
  for all to authenticated
  using      (public.is_super_admin() or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin'))
  with check (public.is_super_admin() or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin'));

create policy "payouts read scoped finance" on public.payouts
  for select to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or rep_id = public.my_rep_id_in_agency(agency_id)
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  );

create policy "payouts write owner finance" on public.payouts
  for all to authenticated
  using      (public.is_super_admin() or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin'))
  with check (public.is_super_admin() or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin'));

create policy "clawbacks read scoped finance" on public.clawbacks
  for select to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or rep_id = public.my_rep_id_in_agency(agency_id)
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and rep_id in (
        select d.rep_id from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
      )
    )
  );

create policy "clawbacks write owner finance" on public.clawbacks
  for all to authenticated
  using      (public.is_super_admin() or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin'))
  with check (public.is_super_admin() or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin'));

-- SECURITY DEFINER RPC used by P&L. Force managers to downline scope even if
-- the browser passes p_scope='agency', and expose own vs override commission
-- columns the current UI already expects.
drop function if exists public.manager_pnl_snapshot(uuid, date, date, text);
create function public.manager_pnl_snapshot(
  p_agency_id  uuid,
  p_from       date,
  p_to         date,
  p_scope      text default 'agency'
)
returns table (
  rep_id              text,
  rep_name            text,
  rep_handle          text,
  deals               bigint,
  submitted_ap_cents  bigint,
  earned_comm_cents   bigint,
  own_comm_cents      bigint,
  override_comm_cents bigint,
  expenses_cents      bigint,
  clawback_cents      bigint,
  net_cents           bigint
)
language plpgsql stable security definer set search_path = public, pg_catalog
as $$
declare
  v_role    text;
  v_rep_id  text;
  v_scope   text;
begin
  select m.role, m.rep_id
    into v_role, v_rep_id
    from public.agency_members m
   where m.agency_id = p_agency_id
     and m.user_id   = auth.uid()
     and m.active    = true
   limit 1;

  if public.is_super_admin() and v_role is null then
    v_role := 'super_admin';
  end if;

  if v_role is null or v_role not in ('manager','owner','admin','super_admin','imo_owner') then
    return;
  end if;

  v_scope := case when v_role = 'manager' then 'downline' else coalesce(p_scope, 'agency') end;

  return query
  with rep_scope as (
    select r.id as rep_id, r.name as rep_name, r.handle as rep_handle
      from public.reps r
     where r.agency_id = p_agency_id
       and (
         v_scope = 'agency'
         or (
           v_scope = 'downline'
           and r.id in (select d.rep_id from public.downline_of(v_rep_id) d)
         )
       )
  ),
  pol as (
    select p.owner_rep_id as rep_id,
           count(*)::bigint as deals,
           coalesce(sum(p.ap_cents), 0)::bigint as ap_cents
      from public.policies p
     where p.agency_id = p_agency_id
       and p.submission_date >= p_from
       and p.submission_date <= p_to
       and p.owner_rep_id is not null
     group by p.owner_rep_id
  ),
  comm as (
    select c.rep_id,
           coalesce(sum(c.amount_cents), 0)::bigint as earned_cents,
           coalesce(sum(c.amount_cents) filter (where c.kind = 'override'), 0)::bigint as override_cents,
           coalesce(sum(c.amount_cents) filter (where c.kind is distinct from 'override'), 0)::bigint as own_cents
      from public.commissions c
      join public.policies p on p.id = c.policy_id
     where p.agency_id = p_agency_id
       and c.earned_at >= p_from::timestamptz
       and c.earned_at <  (p_to + 1)::timestamptz
     group by c.rep_id
  ),
  exp as (
    select e.paid_by_rep_id as rep_id,
           coalesce(sum(e.amount_cents), 0)::bigint as expense_cents
      from public.agency_expenses e
     where e.agency_id = p_agency_id
       and e.paid_at >= p_from
       and e.paid_at <= p_to
       and e.paid_by_rep_id is not null
     group by e.paid_by_rep_id
  ),
  debt as (
    select cb.rep_id,
           coalesce(sum(cb.amount_cents), 0)::bigint as clawback_cents
      from public.clawbacks cb
      left join public.policies p on p.id = cb.policy_id
     where coalesce(cb.agency_id, p.agency_id) = p_agency_id
       and cb.recorded_at >= p_from::timestamptz
       and cb.recorded_at <  (p_to + 1)::timestamptz
       and cb.status in ('recorded','disputing')
     group by cb.rep_id
  )
  select
    rs.rep_id,
    rs.rep_name,
    rs.rep_handle,
    coalesce(pol.deals, 0) as deals,
    coalesce(pol.ap_cents, 0) as submitted_ap_cents,
    coalesce(comm.earned_cents, 0) as earned_comm_cents,
    coalesce(comm.own_cents, 0) as own_comm_cents,
    coalesce(comm.override_cents, 0) as override_comm_cents,
    coalesce(exp.expense_cents, 0) as expenses_cents,
    coalesce(debt.clawback_cents, 0) as clawback_cents,
    coalesce(comm.earned_cents, 0) - coalesce(exp.expense_cents, 0) - coalesce(debt.clawback_cents, 0) as net_cents
  from rep_scope rs
  left join pol  on pol.rep_id  = rs.rep_id
  left join comm on comm.rep_id = rs.rep_id
  left join exp  on exp.rep_id  = rs.rep_id
  left join debt on debt.rep_id = rs.rep_id
  where coalesce(pol.deals, 0) > 0
     or coalesce(comm.earned_cents, 0) > 0
     or coalesce(exp.expense_cents, 0) > 0
     or coalesce(debt.clawback_cents, 0) > 0
  order by (coalesce(comm.earned_cents, 0) - coalesce(exp.expense_cents, 0) - coalesce(debt.clawback_cents, 0)) desc nulls last;
end;
$$;

revoke all on function public.manager_pnl_snapshot(uuid, date, date, text) from public, anon;
grant execute on function public.manager_pnl_snapshot(uuid, date, date, text) to authenticated;

-- Manager cancellation path. This lets a manager mark a downline policy
-- cancelled/lapsed/rescinded from a carrier notification and records the
-- associated rep debt immediately, without granting blanket clawback writes.
drop function if exists public.policy_mark_persistency_event(uuid, text, text, bigint);
create function public.policy_mark_persistency_event(
  p_policy_id       uuid,
  p_status          text,
  p_reason          text default null,
  p_clawback_cents  bigint default null
)
returns table (
  policy_id          uuid,
  status             text,
  persistency_status text,
  clawback_id        uuid,
  clawback_cents     bigint
)
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
declare
  v_policy       public.policies%rowtype;
  v_role         text;
  v_rep_id       text;
  v_status       text;
  v_persistency  text;
  v_amount       bigint;
  v_existing_id  uuid;
  v_clawback_id  uuid;
begin
  v_status := lower(coalesce(p_status, ''));
  if v_status = 'submitted' then
    v_status := 'pending';
  end if;
  if v_status = 'canceled' then
    v_status := 'cancelled';
  end if;

  if v_status not in ('pending','app_in','issued','active','lapsed','cancelled','rescinded') then
    raise exception 'unsupported policy status: %', p_status using errcode = '22023';
  end if;

  select *
    into v_policy
    from public.policies
   where id = p_policy_id
   for update;

  if not found then
    raise exception 'policy not found' using errcode = 'P0002';
  end if;

  select m.role, m.rep_id
    into v_role, v_rep_id
    from public.agency_members m
   where m.agency_id = v_policy.agency_id
     and m.user_id = auth.uid()
     and m.active = true
   limit 1;

  if public.is_super_admin() and v_role is null then
    v_role := 'super_admin';
  end if;

  if v_role in ('owner','admin','imo_owner','super_admin') then
    null;
  elsif v_role = 'manager'
    and v_policy.owner_rep_id in (select d.rep_id from public.downline_of(v_rep_id) d) then
    null;
  else
    raise exception 'not allowed to update this policy' using errcode = '42501';
  end if;

  v_persistency := case
    when v_status in ('lapsed','cancelled','rescinded') then 'lapsed'
    else 'on_book'
  end;

  update public.policies p
     set status = v_status,
         persistency_status = v_persistency,
         updated_at = now(),
         metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
           'last_persistency_event',
           jsonb_build_object(
             'status', v_status,
             'reason', nullif(trim(coalesce(p_reason, '')), ''),
             'changed_by', auth.uid(),
             'changed_at', now()
           )
         )
   where p.id = p_policy_id;

  if v_status in ('lapsed','cancelled','rescinded') and v_policy.owner_rep_id is not null then
    if p_clawback_cents is not null then
      v_amount := greatest(p_clawback_cents, 0);
    else
      select coalesce(sum(c.amount_cents), 0)::bigint
        into v_amount
        from public.commissions c
       where c.policy_id = p_policy_id
         and c.rep_id = v_policy.owner_rep_id
         and c.amount_cents > 0;

      if coalesce(v_amount, 0) = 0 then
        v_amount := greatest(coalesce(v_policy.expected_commission_cents, 0), 0);
      end if;
    end if;

    if coalesce(v_amount, 0) > 0 then
      select cb.id
        into v_existing_id
        from public.clawbacks cb
       where cb.policy_id = p_policy_id
         and cb.rep_id = v_policy.owner_rep_id
         and cb.status in ('recorded','disputing')
       order by cb.recorded_at desc
       limit 1;

      if v_existing_id is null then
        insert into public.clawbacks (agency_id, policy_id, rep_id, amount_cents, reason, status)
        values (
          v_policy.agency_id,
          p_policy_id,
          v_policy.owner_rep_id,
          v_amount,
          coalesce(nullif(trim(p_reason), ''), 'Policy ' || v_status || ' before chargeback window cleared'),
          'recorded'
        )
        returning id into v_clawback_id;
      else
        update public.clawbacks cb
           set amount_cents = v_amount,
               reason = coalesce(nullif(trim(p_reason), ''), cb.reason),
               recorded_at = now()
         where cb.id = v_existing_id
        returning cb.id into v_clawback_id;
      end if;
    end if;
  end if;

  return query
  select p_policy_id, v_status, v_persistency, v_clawback_id, coalesce(v_amount, 0);
end;
$$;

revoke all on function public.policy_mark_persistency_event(uuid, text, text, bigint) from public, anon;
grant execute on function public.policy_mark_persistency_event(uuid, text, text, bigint) to authenticated;

alter table public.agency_expenses
  alter column created_by set default auth.uid();

-- Remove every historical broad policy name. RLS policies are OR-combined, so
-- leaving any one of these in place would reopen the ledger.
drop policy if exists "tenant read expenses"                 on public.agency_expenses;
drop policy if exists "owner manage expenses"                on public.agency_expenses;
drop policy if exists "manager insert downline-tied spend"   on public.agency_expenses;
drop policy if exists "auth read agency_expenses"            on public.agency_expenses;
drop policy if exists "auth write agency_expenses"           on public.agency_expenses;

create policy "expenses read role-aware" on public.agency_expenses
  for select to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      public.viewer_role_in(agency_id) = 'manager'
      and (
        created_by = auth.uid()
        or paid_by_rep_id = public.my_rep_id_in_agency(agency_id)
        or paid_by_rep_id in (
          select d.rep_id
            from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
        )
      )
    )
    or (
      public.viewer_role_in(agency_id) = 'rep'
      and (
        created_by = auth.uid()
        or paid_by_rep_id = public.my_rep_id_in_agency(agency_id)
      )
    )
  );

create policy "expenses insert role-aware" on public.agency_expenses
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      agency_id in (select public.viewer_agency_ids())
      and public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    )
    or (
      agency_id in (select public.viewer_agency_ids())
      and public.viewer_role_in(agency_id) = 'manager'
      and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
      and (
        paid_by_rep_id is null
        or paid_by_rep_id = public.my_rep_id_in_agency(agency_id)
        or paid_by_rep_id in (
          select d.rep_id
            from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
        )
      )
    )
    or (
      agency_id in (select public.viewer_agency_ids())
      and public.viewer_role_in(agency_id) = 'rep'
      and paid_by = 'rep_oop'
      and paid_by_rep_id = public.my_rep_id_in_agency(agency_id)
    )
  );

create policy "expenses update role-aware" on public.agency_expenses
  for update to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      created_by = auth.uid()
      and public.viewer_role_in(agency_id) in ('manager','rep')
    )
  )
  with check (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      created_by = auth.uid()
      and public.viewer_role_in(agency_id) = 'manager'
      and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
      and (
        paid_by_rep_id is null
        or paid_by_rep_id = public.my_rep_id_in_agency(agency_id)
        or paid_by_rep_id in (
          select d.rep_id
            from public.downline_of(public.my_rep_id_in_agency(agency_id)) d
        )
      )
    )
    or (
      created_by = auth.uid()
      and public.viewer_role_in(agency_id) = 'rep'
      and paid_by = 'rep_oop'
      and paid_by_rep_id = public.my_rep_id_in_agency(agency_id)
    )
  );

create policy "expenses delete role-aware" on public.agency_expenses
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.viewer_role_in(agency_id) in ('owner','admin','imo_owner','super_admin')
    or (
      created_by = auth.uid()
      and public.viewer_role_in(agency_id) in ('manager','rep')
    )
  );

drop policy if exists "tenant read alloc" on public.expense_allocations;
drop policy if exists "owner manage alloc" on public.expense_allocations;

create policy "alloc read role-aware" on public.expense_allocations
  for select to authenticated
  using (
    exists (
      select 1
        from public.agency_expenses e
       where e.id = expense_id
         and (
           public.is_super_admin()
           or public.viewer_role_in(e.agency_id) in ('owner','admin','imo_owner','super_admin')
           or (
             public.viewer_role_in(e.agency_id) = 'manager'
             and (
               expense_allocations.rep_id = public.my_rep_id_in_agency(e.agency_id)
               or expense_allocations.rep_id in (
                 select d.rep_id
                   from public.downline_of(public.my_rep_id_in_agency(e.agency_id)) d
               )
             )
           )
           or (
             public.viewer_role_in(e.agency_id) = 'rep'
             and expense_allocations.rep_id = public.my_rep_id_in_agency(e.agency_id)
           )
         )
    )
  );

create policy "alloc manage role-aware" on public.expense_allocations
  for all to authenticated
  using (
    exists (
      select 1
        from public.agency_expenses e
       where e.id = expense_id
         and (
           public.is_super_admin()
           or public.viewer_role_in(e.agency_id) in ('owner','admin','imo_owner','super_admin')
           or (
             e.created_by = auth.uid()
             and public.viewer_role_in(e.agency_id) = 'manager'
             and (
               expense_allocations.rep_id = public.my_rep_id_in_agency(e.agency_id)
               or expense_allocations.rep_id in (
                 select d.rep_id
                   from public.downline_of(public.my_rep_id_in_agency(e.agency_id)) d
               )
             )
           )
         )
    )
  )
  with check (
    exists (
      select 1
        from public.agency_expenses e
       where e.id = expense_id
         and (
           public.is_super_admin()
           or public.viewer_role_in(e.agency_id) in ('owner','admin','imo_owner','super_admin')
           or (
             e.created_by = auth.uid()
             and public.viewer_role_in(e.agency_id) = 'manager'
             and (
               expense_allocations.rep_id = public.my_rep_id_in_agency(e.agency_id)
               or expense_allocations.rep_id in (
                 select d.rep_id
                   from public.downline_of(public.my_rep_id_in_agency(e.agency_id)) d
               )
             )
           )
         )
    )
  );

alter view if exists public.v_rep_spend set (security_invoker = true);
alter view if exists public.v_lead_source_spend set (security_invoker = true);

revoke all on public.v_rep_spend from anon;
revoke all on public.v_lead_source_spend from anon;
grant select on public.v_rep_spend to authenticated, service_role;
grant select on public.v_lead_source_spend to authenticated, service_role;
