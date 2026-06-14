-- 0072 Manager-managed expenses.
--
-- Managers can now edit/delete the expense rows they created themselves.
-- Owner/admin retain full control through the existing manage-everything policy.

set local search_path = public;

drop policy if exists "manager insert downline-tied spend" on public.agency_expenses;
create policy "manager insert downline-tied spend" on public.agency_expenses
  for insert to authenticated
  with check (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('manager')
    )
    and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
    and created_by = auth.uid()
  );

create policy "manager update own expenses" on public.agency_expenses
  for update to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('manager')
    )
    and created_by = auth.uid()
    and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
  )
  with check (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('manager')
    )
    and created_by = auth.uid()
    and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
  );

create policy "manager delete own expenses" on public.agency_expenses
  for delete to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_expenses.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('manager')
    )
    and created_by = auth.uid()
    and kind in ('lead_spend','recruiting_ad','marketing','training','meals','travel')
  );
