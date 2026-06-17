-- 0097 — Fix "Get live carrier rates" insert failing for authenticated users.
--
-- The legacy policies on auto_quote_requests read jwt.rep_id / jwt.role from
-- the JWT, but this project never wired a custom access-token hook to stamp
-- those claims (Supabase auth puts only sub / email / aud / role='authenticated'
-- into the JWT by default). The "rep sees own" ALL policy therefore always
-- evaluates to null OR false → no INSERT path exists for authenticated users,
-- so the Quote tool's "Get live carrier rates" button errored with
--   new row violates row-level security policy for table "auto_quote_requests"
--
-- Fix:
--   1) BEFORE INSERT trigger fills agency_id + rep_id from public.me() when
--      the client didn't (the Quote tool only sends rep_id, never agency_id).
--   2) Explicit INSERT policy for `authenticated` based on agency_members —
--      the same pattern that works in migration 0095 (vault scripts hierarchy).

create or replace function public._stamp_auto_quote_requests()
returns trigger
language plpgsql
security invoker
as $$
declare
  m_rep_id text;
  m_agency uuid;
begin
  select rep_id, agency_id
    into m_rep_id, m_agency
    from public.me()
   limit 1;
  if new.agency_id is null then new.agency_id := m_agency; end if;
  if new.rep_id    is null then new.rep_id    := m_rep_id; end if;
  return new;
end
$$;

drop trigger if exists auto_quote_requests_stamp on public.auto_quote_requests;
create trigger auto_quote_requests_stamp
  before insert on public.auto_quote_requests
  for each row execute function public._stamp_auto_quote_requests();

drop policy if exists "auth insert auto_quote_requests" on public.auto_quote_requests;
create policy "auth insert auto_quote_requests" on public.auto_quote_requests
  for insert to authenticated
  with check (
    public.is_super_admin()
    or exists (
      select 1
        from public.agency_members am
       where am.agency_id = auto_quote_requests.agency_id
         and am.user_id   = auth.uid()
         and am.active is not false
    )
  );

DO $$
DECLARE n int;
BEGIN
  select count(*) into n from pg_policies
   where schemaname='public' and tablename='auto_quote_requests'
     and policyname = 'auth insert auto_quote_requests';
  if n <> 1 then raise exception 'INSERT policy missing'; end if;
END $$;
