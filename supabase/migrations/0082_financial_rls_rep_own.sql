-- 0082_financial_rls_rep_own.sql
-- The real GAP-P2 close: tighten RLS on the four financial tables so a plain
-- rep can no longer hit /rest/v1/{commissions,policies,payouts,clawbacks}
-- and read peers' rows. UI masking was never enforcement.
--
-- New shape per table:
--   SELECT — super_admin OR owner/admin/manager/imo_owner in row's agency
--            OR rep_id matches caller's rep_id in that agency.
--   policies INSERT — agency members can insert, but WITH CHECK enforces
--            owner_rep_id is theirs (so reps can keep writing their own deals
--            via page-deal-write, and managers can write for the team).
--   commissions/payouts/clawbacks WRITE — manager+ only. Trigger functions
--            (SECURITY DEFINER) bypass RLS, so trigger-driven commission
--            creation on policy insert still works.
--
-- "anon atlas read X" demo-sandbox policies are untouched.
-- Helpers used: is_super_admin(), is_agency_manager_or_above(uuid),
--               my_rep_id_in_agency(uuid)  (all from 0081).

-- ===== policies =====
drop policy if exists "tenant read policies"  on public.policies;
drop policy if exists "tenant write policies" on public.policies;

create policy "policies read role-aware" on public.policies
  for select using (
    public.is_super_admin()
    or public.is_agency_manager_or_above(agency_id)
    or owner_rep_id = public.my_rep_id_in_agency(agency_id)
  );

create policy "policies insert agency member" on public.policies
  for insert with check (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.is_super_admin()
      or public.is_agency_manager_or_above(agency_id)
      or owner_rep_id = public.my_rep_id_in_agency(agency_id)
    )
  );

create policy "policies update manager+" on public.policies
  for update
  using       (public.is_super_admin() or public.is_agency_manager_or_above(agency_id))
  with check  (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));

create policy "policies delete manager+" on public.policies
  for delete using (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));

-- ===== commissions =====
drop policy if exists "tenant read commissions"  on public.commissions;
drop policy if exists "tenant write commissions" on public.commissions;

create policy "commissions read role-aware" on public.commissions
  for select using (
    public.is_super_admin()
    or public.is_agency_manager_or_above(agency_id)
    or rep_id = public.my_rep_id_in_agency(agency_id)
  );

create policy "commissions write manager+" on public.commissions
  for all
  using       (public.is_super_admin() or public.is_agency_manager_or_above(agency_id))
  with check  (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));

-- ===== payouts =====
drop policy if exists "auth read payouts"  on public.payouts;
drop policy if exists "auth write payouts" on public.payouts;

create policy "payouts read role-aware" on public.payouts
  for select using (
    public.is_super_admin()
    or public.is_agency_manager_or_above(agency_id)
    or rep_id = public.my_rep_id_in_agency(agency_id)
  );

create policy "payouts write manager+" on public.payouts
  for all
  using       (public.is_super_admin() or public.is_agency_manager_or_above(agency_id))
  with check  (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));

-- ===== clawbacks =====
drop policy if exists "auth read clawbacks"  on public.clawbacks;
drop policy if exists "auth write clawbacks" on public.clawbacks;

create policy "clawbacks read role-aware" on public.clawbacks
  for select using (
    public.is_super_admin()
    or public.is_agency_manager_or_above(agency_id)
    or rep_id = public.my_rep_id_in_agency(agency_id)
  );

create policy "clawbacks write manager+" on public.clawbacks
  for all
  using       (public.is_super_admin() or public.is_agency_manager_or_above(agency_id))
  with check  (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));
