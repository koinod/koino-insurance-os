-- 0004 auth identity link.
--
-- Closes the foundation that GAP-X4 promised but never landed in the DB:
--   * reps.user_id  uuid → auth.users(id)
--   * reps.upline_id text → reps(id)
--   * public.me()             returns the viewer row (rep + agency_name + role)
--   * public.downline_of(text) recursive subtree
--
-- Without this, /api/me 404s on rpc/me, every me()-dependent page silently
-- renders the unauth fallback, and the just-merged GAP-X4/D1/OD1/X1 fixes
-- are dead code.

-- ────────────────────────────────────────────────────────────────────────────
-- columns
-- ────────────────────────────────────────────────────────────────────────────
alter table public.reps
  add column if not exists user_id   uuid references auth.users(id) on delete set null,
  add column if not exists upline_id text;

-- backfill a flat upline tree on the demo agency so downline_of('marc')
-- returns every rep. Real tenants will set this up via onboarding.
update public.reps
   set upline_id = 'marc'
 where agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
   and id != 'marc'
   and upline_id is null;

-- ────────────────────────────────────────────────────────────────────────────
-- me() — returns the current viewer's identity. Joins agencies for the
-- display name and agency_members for the role (owner / manager / rep).
-- Returns 0 rows if auth.uid() is null OR no reps row maps to that uid;
-- /api/me handles the fallback shape for that case.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.me()
returns table (
  rep_id      text,
  user_id     uuid,
  full_name   text,
  handle      text,
  role        text,
  tier        text,
  agency_id   uuid,
  agency_name text,
  upline_id   text
)
language sql
security invoker
stable
as $$
  select
    r.id                              as rep_id,
    r.user_id                         as user_id,
    r.name                            as full_name,
    r.handle                          as handle,
    coalesce(am.role, 'rep')          as role,
    r.tier                            as tier,
    r.agency_id                       as agency_id,
    a.name                            as agency_name,
    r.upline_id                       as upline_id
  from public.reps r
  left join public.agencies       a  on a.id = r.agency_id
  left join public.agency_members am on am.user_id  = r.user_id
                                    and am.agency_id = r.agency_id
                                    and am.active is not false
  where r.user_id = auth.uid()
  limit 1;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- downline_of(root_rep_id) — recursive subtree of rep_ids.
-- Used by lib/me.js → window.scopeRepIds() so manager UIs filter to their team.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.downline_of(root_rep_id text)
returns table (rep_id text)
language sql
security invoker
stable
as $$
  with recursive tree(id) as (
    select id from public.reps where id = root_rep_id
    union
    select r.id
      from public.reps r
      join tree t on r.upline_id = t.id
  )
  select id as rep_id from tree;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- grants
-- ────────────────────────────────────────────────────────────────────────────
grant execute on function public.me()                  to anon, authenticated;
grant execute on function public.downline_of(text)     to anon, authenticated;
