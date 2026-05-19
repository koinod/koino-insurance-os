-- 0027 agency_carrier_appointments — tenant-scoped per-agency carrier roster.
--
-- The platform-admin agency drill-in (page-platform-admin.jsx → TabCarriers)
-- and the Settings → Carriers tab (page-tenant.jsx → SettingsCarriers) both
-- target `public.agency_carrier_appointments`, but no prior migration created
-- it. The Settings tab also previously tried to filter the global
-- `public.carriers` reference catalog by `agency_id`, which 400s because that
-- column does not exist on the catalog. End result: blank Settings → Carriers
-- tab for every role.
--
-- This migration:
--   1) creates the per-agency table with the union of columns both UIs need;
--   2) RLS-scopes it via the existing viewer_agency_ids() / is_super_admin()
--      helpers from 0015_tenant_isolation + 0022_super_admin_ian;
--   3) restricts writes to owner / manager members (rep is read-only);
--   4) adds it to the realtime publication so the UIs refresh across tabs.

create table if not exists public.agency_carrier_appointments (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null,
  carrier_id         text references public.carriers(id) on delete set null,
  carrier_name       text not null,
  category           text,
  status             text not null default 'active' check (status in ('active','paused','terminated')),
  contact_name       text,
  contact_phone      text,
  contact_email      text,
  product_lines      text[]  not null default '{}',
  appointed_states   text[]  not null default '{}',
  npn                text,
  comp_rate_pct      numeric,
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create unique index if not exists agency_carrier_appts_agency_carrier_uq
  on public.agency_carrier_appointments (agency_id, carrier_id)
  where carrier_id is not null;

create unique index if not exists agency_carrier_appts_agency_name_uq
  on public.agency_carrier_appointments (agency_id, lower(carrier_name));

create index if not exists agency_carrier_appts_agency_idx
  on public.agency_carrier_appointments (agency_id);

alter table public.agency_carrier_appointments enable row level security;

-- Read: super_admin OR member of the agency.
drop policy if exists "auth read agency_carrier_appts" on public.agency_carrier_appointments;
create policy "auth read agency_carrier_appts" on public.agency_carrier_appointments
  for select to authenticated
  using ( public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids()) );

-- Write: super_admin OR owner/manager of the agency.
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
         and m.role in ('owner','manager')
    )
  )
  with check (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members m
       where m.agency_id = agency_carrier_appointments.agency_id
         and m.user_id = auth.uid()
         and m.active = true
         and m.role in ('owner','manager')
    )
  );

-- Realtime fan-out (matches 0018_realtime_publication.sql idiom).
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'agency_carrier_appointments'
  ) then
    execute 'alter publication supabase_realtime add table public.agency_carrier_appointments';
  end if;
end $$;
