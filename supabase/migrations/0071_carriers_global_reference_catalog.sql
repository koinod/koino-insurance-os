-- 0071_carriers_global_reference_catalog
-- Applied to prod via apply_migration (Supabase version 2026-05-26+) — this file
-- mirrors it for repo parity. apply_migration is the source of truth.
--
-- Bug: the 16 appointed carriers (filled 2026-05-26) were inserted with
-- agency_id = a073f1cc (KOINO IMO / Ian's agency). RLS "tenant read carriers"
-- only exposes a carrier when (agency_id IS NULL) OR it belongs to the viewer's
-- agency, so every OTHER agency (e.g. Isaiah's d548e8ea) saw ZERO carriers ->
-- empty Carrier dropdown in the Write-Deal UI -> reps outside KOINO IMO could
-- not log a deal.
--
-- carriers is meant to be a GLOBAL reference catalog (data.jsx loads it
-- un-scoped; the read policy already carries an `agency_id IS NULL` branch for
-- exactly this). Products (87 rows) were already global; only carriers had been
-- stamped with an agency_id. Fix = null out agency_id on carriers, and widen the
-- write policy so super_admins can still manage the shared catalog (mirrors the
-- existing `tenant rw sequences` is_super_admin() pattern).

-- 1) Make all existing carriers global reference data, visible to every agency.
update public.carriers set agency_id = null where agency_id is not null;

-- 2) Allow super_admins to manage the global (agency_id IS NULL) catalog while
--    preserving each agency's ability to write its own (non-null) carrier rows.
drop policy if exists "tenant write carriers" on public.carriers;
create policy "tenant write carriers" on public.carriers
  as permissive for all to authenticated
  using (
    is_super_admin()
    or (
      agency_id is not null
      and agency_id in (
        select agency_members.agency_id from public.agency_members
         where agency_members.user_id = auth.uid() and agency_members.active
      )
    )
  )
  with check (
    is_super_admin()
    or (
      agency_id is not null
      and agency_id in (
        select agency_members.agency_id from public.agency_members
         where agency_members.user_id = auth.uid() and agency_members.active
      )
    )
  );

-- 3) Verify: every carrier is now global, none left scoped to an agency.
do $$
declare scoped int; total int;
begin
  select count(*) into scoped from public.carriers where agency_id is not null;
  select count(*) into total  from public.carriers;
  if scoped <> 0 then
    raise exception 'expected 0 agency-scoped carriers, found %', scoped;
  end if;
  if total < 16 then
    raise exception 'expected >=16 global carriers, found %', total;
  end if;
end $$;
