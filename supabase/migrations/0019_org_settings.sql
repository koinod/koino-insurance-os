-- 0019 Org settings & multi-tenancy.
--
-- Replaces the conceptual/missing org_settings table with a real multi-tenant
-- key/value store scoped by agency_id.
--
-- Drives Settings -> Organization tab (name, legal, domain, NPN, Stripe URL).

create table if not exists public.org_settings (
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  key         text not null,
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (agency_id, key)
);

create index if not exists idx_org_settings_agency on public.org_settings (agency_id);

alter table public.org_settings enable row level security;

-- Read: any member of the agency can read settings.
drop policy if exists "tenant read org_settings" on public.org_settings;
create policy "tenant read org_settings" on public.org_settings
  for select to authenticated using (agency_id in (select public.viewer_agency_ids()));

-- Write: owner/admin only.
drop policy if exists "owner manage org_settings" on public.org_settings;
create policy "owner manage org_settings" on public.org_settings
  for all to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = org_settings.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('owner','admin')
    )
  )
  with check (
    agency_id in (select public.viewer_agency_ids())
    and exists (
      select 1 from public.agency_members m
       where m.agency_id = org_settings.agency_id
         and m.user_id   = auth.uid()
         and m.active    = true
         and m.role      in ('owner','admin')
    )
  );

-- Demo carve-out
drop policy if exists "anon atlas read settings" on public.org_settings;
create policy "anon atlas read settings" on public.org_settings
  for select to anon using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

-- Seed the demo agency
insert into public.org_settings (agency_id, key, value) values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'name', '"Atlas Insurance Group"'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'legal', '"Atlas IMO LLC"'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'domain', '"atlasimo.com"'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'npn', '"19384726"'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9', 'operating_states', '["TX","FL","CA","NY","GA","NV","AZ","OH","PA","MI","NC","WI","WA"]')
on conflict (agency_id, key) do nothing;
