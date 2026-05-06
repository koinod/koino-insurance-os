-- 0015 Tenant isolation hardening.
--
-- Before: commissions/policies had `using (true)` blanket policies meaning any
-- authenticated user could read every agency's commission ledger and policy
-- book. pipeline/queue/reps had unscoped `auth read` policies that defeated
-- the per-agency carve-out.
--
-- After: every authenticated read on a tenant-data table is scoped via the
-- agency_members table — i.e., a user only sees rows in agencies they're an
-- active member of. The anon "atlas demo" carve-outs are preserved so the
-- public demo page still works for unauthenticated visitors.
--
-- Pattern: helper function public.viewer_agency_ids() returns the set of
-- agency_ids the current auth.uid() can see. We use it in every policy
-- predicate so adding new tables is one line of policy SQL.
--
-- Schema fix: policies + commissions did not previously carry agency_id; we
-- denormalize agency_id onto policies (backfilled from pipeline.agency_id)
-- to make the policies scope predicate trivial and fast.

------------------------------------------------------------------------------
-- 1. Helper: agency_ids the current viewer can see
------------------------------------------------------------------------------
create or replace function public.viewer_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
$$;

grant execute on function public.viewer_agency_ids() to authenticated, anon;

------------------------------------------------------------------------------
-- 2. policies — add agency_id, backfill, then scope
------------------------------------------------------------------------------
alter table public.policies
  add column if not exists agency_id uuid;

-- Backfill from pipeline (the kanban deal that produced the policy).
update public.policies p
   set agency_id = pl.agency_id
  from public.pipeline pl
 where p.lead_pipeline_id = pl.id
   and p.agency_id is null;

-- Backfill from rep's home agency for any orphan rows.
update public.policies p
   set agency_id = r.agency_id
  from public.reps r
 where p.owner_rep_id = r.id
   and p.agency_id is null;

-- Last resort: assign demo agency for any still-null rows.
update public.policies
   set agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid
 where agency_id is null;

create index if not exists idx_policies_agency on public.policies (agency_id);

drop policy if exists "anon read policies"  on public.policies;
drop policy if exists "auth read policies"  on public.policies;
drop policy if exists "auth write policies" on public.policies;

create policy "anon atlas read policies" on public.policies
  for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

create policy "tenant read policies" on public.policies
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

create policy "tenant write policies" on public.policies
  for all to authenticated
  using (agency_id in (select public.viewer_agency_ids()))
  with check (agency_id in (select public.viewer_agency_ids()));

------------------------------------------------------------------------------
-- 3. commissions — scope through policies
------------------------------------------------------------------------------
drop policy if exists "anon read commissions"  on public.commissions;
drop policy if exists "auth read commissions"  on public.commissions;
drop policy if exists "auth write commissions" on public.commissions;

create policy "anon atlas read commissions" on public.commissions
  for select to anon
  using (
    policy_id in (
      select id from public.policies
       where agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
    )
  );

create policy "tenant read commissions" on public.commissions
  for select to authenticated
  using (
    policy_id in (
      select id from public.policies
       where agency_id in (select public.viewer_agency_ids())
    )
  );

create policy "tenant write commissions" on public.commissions
  for all to authenticated
  using (
    policy_id in (
      select id from public.policies
       where agency_id in (select public.viewer_agency_ids())
    )
  )
  with check (
    policy_id in (
      select id from public.policies
       where agency_id in (select public.viewer_agency_ids())
    )
  );

------------------------------------------------------------------------------
-- 4. pipeline / queue / reps — drop the blanket auth-read leak
------------------------------------------------------------------------------
drop policy if exists "auth read pipeline" on public.pipeline;
drop policy if exists "auth read queue"    on public.queue;
drop policy if exists "auth read reps"     on public.reps;

create policy "tenant read pipeline" on public.pipeline
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

create policy "tenant read queue" on public.queue
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

create policy "tenant read reps" on public.reps
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

------------------------------------------------------------------------------
-- 5. Sweep additional tenant tables that were left wide open
------------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  for tbl in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and exists (
         select 1 from pg_attribute a
          where a.attrelid = c.oid
            and a.attname = 'agency_id'
            and a.atttypid = 'uuid'::regtype
            and not a.attisdropped
       )
       and c.relname not in (
         'commissions','policies','pipeline','queue','reps',
         'agencies','agency_members','agency_invites'
       )
  loop
    execute format(
      'drop policy if exists "auth read %s" on public.%I', tbl, tbl
    );
    execute format(
      'drop policy if exists "authenticated read" on public.%I', tbl
    );

    if not exists (
      select 1 from pg_policies
       where schemaname='public' and tablename=tbl
         and cmd='SELECT' and 'authenticated' = any(roles)
    ) then
      execute format(
        'create policy "tenant read %s" on public.%I for select to authenticated using (agency_id in (select public.viewer_agency_ids()))',
        tbl, tbl
      );
    end if;
  end loop;
end$$;
