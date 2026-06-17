-- 0096 — Agency-hosted sites + their form schemas.
--
-- An agency can have one or more public-facing micro-sites deployed on
-- Vercel that share THIS Supabase: careers landing pages, applicant /
-- consumer quiz funnels, anything we want a custom URL for that still
-- writes back into the agency's tenant-scoped data.
--
--   agency_sites             — one row per Vercel deployment for an agency
--   agency_site_forms        — JSON-schema forms hosted on those sites;
--                              each maps to a target_table (e.g.
--                              recruiting_applicants, pipeline, leads).
--   agency_site_submissions  — raw audit of every form submit, whether or
--                              not it successfully wrote into the target.
--
-- Auth model: read = any agency member (so the Recruiting Settings UI shows
-- them); write = super_admin or owner / manager / imo_owner / admin. The
-- form-submit edge function uses the service-role key, not RLS, because
-- submissions arrive from anon visitors on a public site.

create table if not exists public.agency_sites (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null,
  slug                text not null,
  kind                text not null default 'careers'
    check (kind in ('careers','quiz','landing','other')),
  display_name        text,
  vercel_project_id   text,
  vercel_team_id      text,
  primary_domain      text,
  deployment_url      text,
  status              text not null default 'draft'
    check (status in ('draft','live','paused','archived')),
  theme               jsonb not null default '{}'::jsonb,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists agency_sites_agency_slug_uq
  on public.agency_sites (agency_id, lower(slug));

create unique index if not exists agency_sites_domain_uq
  on public.agency_sites (lower(primary_domain))
  where primary_domain is not null;

create index if not exists agency_sites_agency_idx on public.agency_sites (agency_id);

alter table public.agency_sites enable row level security;

drop policy if exists "auth read agency_sites"  on public.agency_sites;
create policy "auth read agency_sites" on public.agency_sites
  for select to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select v from public.viewer_agency_ids() v)
  );

drop policy if exists "auth write agency_sites" on public.agency_sites;
create policy "auth write agency_sites" on public.agency_sites
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_sites.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and am.role in ('owner','manager','imo_owner','admin')
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_sites.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and am.role in ('owner','manager','imo_owner','admin')
    )
  );

create or replace function public._set_agency_sites_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists agency_sites_set_updated_at on public.agency_sites;
create trigger agency_sites_set_updated_at
  before update on public.agency_sites
  for each row execute function public._set_agency_sites_updated_at();

------------------------------------------------------------------------------
-- agency_site_forms
------------------------------------------------------------------------------
create table if not exists public.agency_site_forms (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null,
  site_id             uuid not null references public.agency_sites(id) on delete cascade,
  slug                text not null,
  name                text not null,
  fields              jsonb not null default '[]'::jsonb,
  target_table        text not null default 'recruiting_applicants',
  routing             jsonb not null default '{}'::jsonb,
  webhook_token       text not null default encode(gen_random_bytes(24), 'hex'),
  status              text not null default 'active'
    check (status in ('draft','active','paused','archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists agency_site_forms_site_slug_uq
  on public.agency_site_forms (site_id, lower(slug));

create index if not exists agency_site_forms_agency_idx
  on public.agency_site_forms (agency_id);

alter table public.agency_site_forms enable row level security;

drop policy if exists "auth read agency_site_forms"  on public.agency_site_forms;
create policy "auth read agency_site_forms" on public.agency_site_forms
  for select to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select v from public.viewer_agency_ids() v)
  );

drop policy if exists "auth write agency_site_forms" on public.agency_site_forms;
create policy "auth write agency_site_forms" on public.agency_site_forms
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_site_forms.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and am.role in ('owner','manager','imo_owner','admin')
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_site_forms.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and am.role in ('owner','manager','imo_owner','admin')
    )
  );

drop trigger if exists agency_site_forms_set_updated_at on public.agency_site_forms;
create or replace function public._set_agency_site_forms_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger agency_site_forms_set_updated_at
  before update on public.agency_site_forms
  for each row execute function public._set_agency_site_forms_updated_at();

------------------------------------------------------------------------------
-- agency_site_submissions — raw audit, server-written, append-only.
------------------------------------------------------------------------------
create table if not exists public.agency_site_submissions (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null,
  site_id             uuid not null references public.agency_sites(id) on delete cascade,
  form_id             uuid references public.agency_site_forms(id) on delete set null,
  raw_payload         jsonb not null,
  resolved_row_id     text,
  resolved_table      text,
  source_ip           inet,
  user_agent          text,
  utm                 jsonb not null default '{}'::jsonb,
  status              text not null default 'received'
    check (status in ('received','routed','rejected','duplicate')),
  routing_notes       text,
  received_at         timestamptz not null default now()
);

create index if not exists agency_site_submissions_agency_idx
  on public.agency_site_submissions (agency_id, received_at desc);
create index if not exists agency_site_submissions_site_idx
  on public.agency_site_submissions (site_id, received_at desc);

alter table public.agency_site_submissions enable row level security;

drop policy if exists "auth read agency_site_submissions" on public.agency_site_submissions;
create policy "auth read agency_site_submissions" on public.agency_site_submissions
  for select to authenticated
  using (
    public.is_super_admin()
    or agency_id in (select v from public.viewer_agency_ids() v)
  );

-- No client-side write policy. Inserts come from the public form-submit edge
-- function using the service-role key.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'agency_sites'
  ) then
    alter publication supabase_realtime add table public.agency_sites;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'agency_site_forms'
  ) then
    alter publication supabase_realtime add table public.agency_site_forms;
  end if;
end $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name in ('agency_sites','agency_site_forms','agency_site_submissions');
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 new tables, found %', n; END IF;
END $$;
