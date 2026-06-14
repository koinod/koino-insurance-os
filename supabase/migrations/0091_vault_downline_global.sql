-- 0091_vault_downline_global.sql   ⚠️ DRAFT — NOT YET APPLIED
-- (renumbered from 0076 → 0091: origin/main already has migrations through 0090)
--
-- Adds downline-scoped "global to my downline" publishing to every Vault content
-- type, and closes the reps-aren't-read-only gap on the legacy agency_* tables.
--
-- Status: drafted 2026-06-12 by the Vault role audit. NOT applied — apply_migration
-- requires the Supabase MCP (not connected at draft time) AND an operator decision
-- between the ADDITIVE (non-breaking) and SCOPED (breaking) read model — see
-- audits/VAULT_ROLE_AUDIT_2026-06-12.md §4. This file implements the ADDITIVE model.
--
-- Recalibration vs the task spec:
--   * rep ids are TEXT (reps.id / reps.upline_id), NOT uuid. owner_rep_id is text.
--   * The hierarchy table is `reps` (not `agents`); the chain is reps.upline_id.
--   * downline_of(text) + is_manager_of(text,text) already walk that chain, so
--     is_upline_ancestor is a thin wrapper, not new traversal logic.
--
-- Idempotent. Every block re-runnable. Ends with a verify block that RAISEs loudly.

begin;

------------------------------------------------------------------------------
-- 0. is_upline_ancestor(ancestor, descendant)  — SECURITY DEFINER wrapper
--    true iff `descendant` is strictly below `ancestor` in the reps.upline_id tree.
------------------------------------------------------------------------------
create or replace function public.is_upline_ancestor(p_ancestor text, p_descendant text)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_ancestor is not null
     and p_descendant is not null
     and p_ancestor <> p_descendant
     and exists (
       select 1 from public.downline_of(p_ancestor) d
        where d.rep_id = p_descendant
     );
$$;
grant execute on function public.is_upline_ancestor(text, text) to authenticated;

------------------------------------------------------------------------------
-- 1. Columns: is_global + owner_rep_id on every Vault content table.
--    owner_rep_id identifies the creator for downline propagation. Backfilled
--    best-effort from created_by where it already holds a valid reps.id.
------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agency_scripts','agency_docs','agency_videos','agency_quick_links',
    'training_courses','vault_segments'
  ] loop
    execute format('alter table public.%I add column if not exists is_global boolean not null default false', t);
    execute format('alter table public.%I add column if not exists owner_rep_id text references public.reps(id) on delete set null', t);
    execute format('create index if not exists %I on public.%I (owner_rep_id) where owner_rep_id is not null',
                   t||'_owner_rep_idx', t);
    execute format('create index if not exists %I on public.%I (agency_id) where is_global = true',
                   t||'_global_idx', t);
  end loop;
end $$;

-- Best-effort backfill: created_by on agency_* tables is text; adopt it as
-- owner_rep_id only where it matches a real reps.id (else leave null).
update public.agency_scripts s set owner_rep_id = s.created_by
  where s.owner_rep_id is null and s.created_by is not null
    and exists (select 1 from public.reps r where r.id = s.created_by);
update public.agency_docs d set owner_rep_id = d.created_by
  where d.owner_rep_id is null and d.created_by is not null
    and exists (select 1 from public.reps r where r.id = d.created_by);
update public.agency_videos v set owner_rep_id = v.created_by
  where v.owner_rep_id is null and v.created_by is not null
    and exists (select 1 from public.reps r where r.id = v.created_by);
update public.agency_quick_links q set owner_rep_id = q.created_by
  where q.owner_rep_id is null and q.created_by is not null
    and exists (select 1 from public.reps r where r.id = q.created_by);

------------------------------------------------------------------------------
-- 2. WRITE policies — manager-or-higher only (closes the 0010 reps-read-only gap).
--    Drops the legacy broad "auth agency write" (FOR ALL to any member) and the
--    already-correct manager policies, then recreates manager-only writes.
--    Reps become read-only at the DB layer, matching the UI gate.
------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agency_scripts','agency_docs','agency_videos','agency_quick_links'
  ] loop
    execute format('drop policy if exists "auth agency write" on public.%I', t);
    execute format('drop policy if exists "manager write %s" on public.%I', t, t);
    execute format($p$
      create policy "manager write %s" on public.%I
        for all to authenticated
        using (public.viewer_is_manager_in(agency_id))
        with check (public.viewer_is_manager_in(agency_id))
    $p$, t, t);
  end loop;
end $$;
-- training_courses (0019) and vault_segments (0026) already have manager-only
-- write policies — left intact.

------------------------------------------------------------------------------
-- 3. READ policies — ADDITIVE downline-global branch.
--    Keeps existing agency-wide + target_roles visibility (managers/owners audit
--    everything; nothing currently visible disappears) and ADDS:
--      * owner sees their own rows, and
--      * any rep sees a row marked is_global whose owner is their upline ancestor.
--
--    NOTE (scoped/breaking variant B): to enforce sibling isolation, replace the
--    agency-wide branch below with ONLY the owner-self + global-ancestor branches.
--    That hides legacy rows lacking owner_rep_id until backfilled — do NOT ship
--    without an is_global backfill of agency-wide content. See audit §4.
------------------------------------------------------------------------------

-- agency_scripts
drop policy if exists "tenant read scripts" on public.agency_scripts;
create policy "tenant read scripts" on public.agency_scripts
  for select to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_is_manager_in(agency_id)
      or target_roles is null or target_roles = '{}'::text[]
      or coalesce(public.viewer_role_in(agency_id), 'rep') = any (target_roles)
      or owner_rep_id = public.viewer_rep_id()
      or (is_global and public.is_upline_ancestor(owner_rep_id, public.viewer_rep_id()))
    )
  );

-- agency_docs
drop policy if exists "tenant read docs" on public.agency_docs;
create policy "tenant read docs" on public.agency_docs
  for select to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_is_manager_in(agency_id)
      or target_roles is null or target_roles = '{}'::text[]
      or coalesce(public.viewer_role_in(agency_id), 'rep') = any (target_roles)
      or owner_rep_id = public.viewer_rep_id()
      or (is_global and public.is_upline_ancestor(owner_rep_id, public.viewer_rep_id()))
    )
  );

-- training_courses
drop policy if exists "tenant read courses" on public.training_courses;
create policy "tenant read courses" on public.training_courses
  for select to authenticated
  using (
    agency_id in (select public.viewer_agency_ids())
    and (
      public.viewer_is_manager_in(agency_id)
      or target_roles is null or target_roles = '{}'::text[]
      or coalesce(public.viewer_role_in(agency_id), 'rep') = any (target_roles)
      or owner_rep_id = public.viewer_rep_id()
      or (is_global and public.is_upline_ancestor(owner_rep_id, public.viewer_rep_id()))
    )
  );

-- agency_videos / agency_quick_links / vault_segments have no target_roles today;
-- they are agency-wide reads. Additive model leaves agency-wide read intact and
-- relies on the manager-write gate above. (Add downline-global branches here too
-- if/when these gain target_roles.)

------------------------------------------------------------------------------
-- 4. Verify block — fails loudly on partial application.
------------------------------------------------------------------------------
do $$
declare missing int;
begin
  select count(*) into missing
    from (values
      ('agency_scripts'),('agency_docs'),('agency_videos'),
      ('agency_quick_links'),('training_courses'),('vault_segments')
    ) as v(t)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=v.t and c.column_name='is_global')
      or not exists (
     select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=v.t and c.column_name='owner_rep_id');
  if missing <> 0 then
    raise exception 'expected is_global+owner_rep_id on all 6 vault tables, % missing', missing;
  end if;

  if not exists (select 1 from pg_proc where proname='is_upline_ancestor') then
    raise exception 'is_upline_ancestor() was not created';
  end if;
end $$;

commit;
