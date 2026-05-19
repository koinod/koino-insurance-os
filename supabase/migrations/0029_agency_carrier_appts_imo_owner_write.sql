-- 0029 broaden write policy on agency_carrier_appointments to cover the full
-- live role enum (owner, imo_owner, manager, admin) plus super_admin via the
-- is_super_admin() helper. The original policy in 0027 only allowed
-- ('owner','manager'), which silently blocked the IMO owners (the dominant
-- account shape in the live DB) from saving carrier rows.

drop policy if exists "auth write agency_carrier_appts" on public.agency_carrier_appointments;
create policy "auth write agency_carrier_appts" on public.agency_carrier_appointments
  for all to authenticated
  using (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_carrier_appointments.agency_id
         and m.user_id = auth.uid()
         and m.active = true
         and m.role in ('owner','imo_owner','manager','admin')
    )
  )
  with check (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_carrier_appointments.agency_id
         and m.user_id = auth.uid()
         and m.active = true
         and m.role in ('owner','imo_owner','manager','admin')
    )
  );
