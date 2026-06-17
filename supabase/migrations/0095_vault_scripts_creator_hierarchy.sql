-- 0095 — Vault Scripts hierarchy
--
-- Until now agency_scripts had one combined RLS policy ("auth agency write")
-- that let any authenticated agency member create, update, or delete every
-- script in the agency. That blocks the desired hierarchy: reps must be able
-- to create their own scripts but never modify or delete a script a manager
-- (or owner / super_admin) created.
--
-- This migration:
--   1) Adds creator_role text to agency_scripts.
--   2) Adds a BEFORE INSERT trigger that stamps created_by + creator_role
--      from public.me() if the client did not provide them. The client can
--      stay schema-unaware; the trigger is source of truth.
--   3) Replaces the single write policy with separate insert / update /
--      delete policies. Reps can only update/delete rows where
--      creator_role = 'rep' AND created_by = their own rep_id. Manager,
--      owner, imo_owner, admin, and super_admin can modify anything in the
--      agency (the hierarchy).

alter table public.agency_scripts
  add column if not exists creator_role text;

create index if not exists agency_scripts_creator_role_idx
  on public.agency_scripts (agency_id, creator_role);

create or replace function public._stamp_agency_scripts_creator()
returns trigger
language plpgsql
security invoker
as $$
declare
  m_rep_id text;
  m_role   text;
begin
  select rep_id, role
    into m_rep_id, m_role
    from public.me()
   limit 1;

  if new.created_by   is null then new.created_by   := m_rep_id; end if;
  if new.creator_role is null then new.creator_role := m_role;   end if;
  return new;
end
$$;

drop trigger if exists agency_scripts_stamp_creator on public.agency_scripts;
create trigger agency_scripts_stamp_creator
  before insert on public.agency_scripts
  for each row execute function public._stamp_agency_scripts_creator();

drop policy if exists "auth agency write"  on public.agency_scripts;
drop policy if exists "auth agency insert" on public.agency_scripts;
drop policy if exists "auth agency update" on public.agency_scripts;
drop policy if exists "auth agency delete" on public.agency_scripts;

-- INSERT: any active agency member can create a script for their agency.
-- viewer_agency_ids() is a set-returning function — Postgres rejects it inside
-- ANY(...) in a policy expression, so use IN(subquery) instead.
create policy "auth agency insert" on public.agency_scripts
  for insert to authenticated
  with check (
    agency_id in (select v from public.viewer_agency_ids() v)
    and exists (
      select 1
        from public.agency_members am
       where am.agency_id = agency_scripts.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
    )
  );

-- UPDATE / DELETE: super_admin, OR a manager-tier member, OR a rep on their
-- own row. Both policies share the predicate.
create policy "auth agency update" on public.agency_scripts
  for update to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
        from public.agency_members am
       where am.agency_id = agency_scripts.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and (
           am.role in ('owner','manager','imo_owner','admin')
           or (
             am.role = 'rep'
             and agency_scripts.creator_role = 'rep'
             and agency_scripts.created_by   = am.rep_id
           )
         )
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
        from public.agency_members am
       where am.agency_id = agency_scripts.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and (
           am.role in ('owner','manager','imo_owner','admin')
           or (
             am.role = 'rep'
             and agency_scripts.creator_role = 'rep'
             and agency_scripts.created_by   = am.rep_id
           )
         )
    )
  );

create policy "auth agency delete" on public.agency_scripts
  for delete to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
        from public.agency_members am
       where am.agency_id = agency_scripts.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
         and (
           am.role in ('owner','manager','imo_owner','admin')
           or (
             am.role = 'rep'
             and agency_scripts.creator_role = 'rep'
             and agency_scripts.created_by   = am.rep_id
           )
         )
    )
  );

DO $$
DECLARE
  col_ok     boolean;
  trg_ok     boolean;
  n_policies int;
BEGIN
  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='agency_scripts'
       and column_name='creator_role'
  ) into col_ok;

  select exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname='agency_scripts'
       and t.tgname='agency_scripts_stamp_creator'
       and not t.tgisinternal
  ) into trg_ok;

  select count(*) into n_policies
    from pg_policies
   where schemaname='public'
     and tablename='agency_scripts'
     and policyname in (
       'auth agency insert', 'auth agency update', 'auth agency delete'
     );

  if not col_ok    then raise exception 'agency_scripts.creator_role column missing'; end if;
  if not trg_ok    then raise exception 'agency_scripts_stamp_creator trigger missing'; end if;
  if n_policies <> 3 then raise exception 'expected 3 new RLS policies, got %', n_policies; end if;
END $$;
