-- 0099 — Hosted sites: ownership + downline-aware write RLS.
--
-- Today (post-0096) any owner / manager / imo_owner / admin in the agency can
-- edit any agency_sites row. The desired hierarchy:
--   • owner / imo_owner / admin:  read + write every site in the agency
--   • manager:  read every site in the agency; write only sites whose
--               owner_rep_id is them OR a rep in their downline subtree
--   • rep:      read every site in the agency; write only their own
--   • super_admin: read + write everything
--   • legacy null-owner rows (seeded out-of-band before this migration):
--     treated as agency-level — only owner-tier members and super_admin can
--     edit them, until someone reassigns ownership.
--
-- Mirrored for agency_site_forms so a rep can't delete a form on someone
-- else's site.
--
-- Mirrors prod (applied via MCP 2026-06-17).

alter table public.agency_sites
  add column if not exists owner_rep_id  text,
  add column if not exists creator_role  text;

alter table public.agency_site_forms
  add column if not exists owner_rep_id  text,
  add column if not exists creator_role  text;

create index if not exists agency_sites_owner_idx
  on public.agency_sites (agency_id, owner_rep_id) where owner_rep_id is not null;

create index if not exists agency_site_forms_owner_idx
  on public.agency_site_forms (agency_id, owner_rep_id) where owner_rep_id is not null;

create or replace function public._stamp_agency_sites_owner()
returns trigger language plpgsql security invoker as $$
declare
  m_rep_id text;
  m_role   text;
begin
  select rep_id, role into m_rep_id, m_role from public.me() limit 1;
  if new.owner_rep_id is null then new.owner_rep_id := m_rep_id; end if;
  if new.creator_role is null then new.creator_role := m_role;   end if;
  return new;
end $$;

drop trigger if exists agency_sites_stamp_owner on public.agency_sites;
create trigger agency_sites_stamp_owner
  before insert on public.agency_sites
  for each row execute function public._stamp_agency_sites_owner();

create or replace function public._stamp_agency_site_forms_owner()
returns trigger language plpgsql security invoker as $$
declare
  m_rep_id text;
  m_role   text;
begin
  select rep_id, role into m_rep_id, m_role from public.me() limit 1;
  if new.owner_rep_id is null then new.owner_rep_id := m_rep_id; end if;
  if new.creator_role is null then new.creator_role := m_role;   end if;
  return new;
end $$;

drop trigger if exists agency_site_forms_stamp_owner on public.agency_site_forms;
create trigger agency_site_forms_stamp_owner
  before insert on public.agency_site_forms
  for each row execute function public._stamp_agency_site_forms_owner();

drop policy if exists "auth write agency_sites"      on public.agency_sites;
drop policy if exists "auth write agency_site_forms" on public.agency_site_forms;

create policy "auth insert agency_sites" on public.agency_sites
  for insert to authenticated with check (
    public.is_super_admin()
    or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_sites.agency_id and am.user_id = auth.uid()
         and am.active is not false
         and am.role in ('owner','manager','imo_owner','admin','rep')
    )
  );

create policy "auth update agency_sites" on public.agency_sites
  for update to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_sites.agency_id and am.user_id = auth.uid() and am.active is not false
         and (
           am.role in ('owner','imo_owner','admin')
           or (am.role = 'manager' and agency_sites.owner_rep_id is not null
               and agency_sites.owner_rep_id in (select rep_id from public.downline_of(am.rep_id)))
           or (am.role = 'rep' and agency_sites.owner_rep_id = am.rep_id)
         )
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_sites.agency_id and am.user_id = auth.uid() and am.active is not false
         and (
           am.role in ('owner','imo_owner','admin')
           or (am.role = 'manager' and agency_sites.owner_rep_id is not null
               and agency_sites.owner_rep_id in (select rep_id from public.downline_of(am.rep_id)))
           or (am.role = 'rep' and agency_sites.owner_rep_id = am.rep_id)
         )
    )
  );

create policy "auth delete agency_sites" on public.agency_sites
  for delete to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_sites.agency_id and am.user_id = auth.uid() and am.active is not false
         and (
           am.role in ('owner','imo_owner','admin')
           or (am.role = 'manager' and agency_sites.owner_rep_id is not null
               and agency_sites.owner_rep_id in (select rep_id from public.downline_of(am.rep_id)))
           or (am.role = 'rep' and agency_sites.owner_rep_id = am.rep_id)
         )
    )
  );

create policy "auth insert agency_site_forms" on public.agency_site_forms
  for insert to authenticated with check (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_site_forms.agency_id and am.user_id = auth.uid()
         and am.active is not false
         and am.role in ('owner','manager','imo_owner','admin','rep')
    )
  );

create policy "auth update agency_site_forms" on public.agency_site_forms
  for update to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_site_forms.agency_id and am.user_id = auth.uid() and am.active is not false
         and (
           am.role in ('owner','imo_owner','admin')
           or (am.role = 'manager' and agency_site_forms.owner_rep_id is not null
               and agency_site_forms.owner_rep_id in (select rep_id from public.downline_of(am.rep_id)))
           or (am.role = 'rep' and agency_site_forms.owner_rep_id = am.rep_id)
         )
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_site_forms.agency_id and am.user_id = auth.uid() and am.active is not false
         and (
           am.role in ('owner','imo_owner','admin')
           or (am.role = 'manager' and agency_site_forms.owner_rep_id is not null
               and agency_site_forms.owner_rep_id in (select rep_id from public.downline_of(am.rep_id)))
           or (am.role = 'rep' and agency_site_forms.owner_rep_id = am.rep_id)
         )
    )
  );

create policy "auth delete agency_site_forms" on public.agency_site_forms
  for delete to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.agency_members am
       where am.agency_id = agency_site_forms.agency_id and am.user_id = auth.uid() and am.active is not false
         and (
           am.role in ('owner','imo_owner','admin')
           or (am.role = 'manager' and agency_site_forms.owner_rep_id is not null
               and agency_site_forms.owner_rep_id in (select rep_id from public.downline_of(am.rep_id)))
           or (am.role = 'rep' and agency_site_forms.owner_rep_id = am.rep_id)
         )
    )
  );

DO $$
DECLARE n_cols int; n_pols int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema='public'
     AND table_name in ('agency_sites','agency_site_forms')
     AND column_name in ('owner_rep_id','creator_role');
  IF n_cols <> 4 THEN RAISE EXCEPTION 'expected 4 new columns, found %', n_cols; END IF;
  SELECT count(*) INTO n_pols FROM pg_policies
   WHERE schemaname='public'
     AND tablename in ('agency_sites','agency_site_forms')
     AND policyname in (
       'auth insert agency_sites','auth update agency_sites','auth delete agency_sites',
       'auth insert agency_site_forms','auth update agency_site_forms','auth delete agency_site_forms'
     );
  IF n_pols <> 6 THEN RAISE EXCEPTION 'expected 6 new policies, found %', n_pols; END IF;
END $$;
