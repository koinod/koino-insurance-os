-- Tighten the anon cross-agency READ on auto_quote_requests. The local quote
-- agent authenticates with the public anon key and only ever polls QUEUED
-- jobs (then flips them running→complete; it never re-reads history). The old
-- policy was `using (true)`, which let anyone holding the public anon key read
-- EVERY agency's quote requests — including lead PII (age/state/profile).
--
-- Scope it to in-flight jobs only. This does not break the daemon:
--   • poll filters status=eq.queued — still matches.
--   • status updates use the separate "agent writes" (UPDATE) policy.
--   • the daemon ignores the PATCH return body, so a completed row dropping
--     out of the SELECT scope is harmless.
-- Authenticated tenant reads (the web UI) go through the separate
-- "tenant read auto_quote_requests" policy and are unaffected.

drop policy if exists "agent reads own auto_quote_requests" on public.auto_quote_requests;
create policy "agent reads inflight auto_quote_requests"
  on public.auto_quote_requests
  for select to anon
  using (status in ('queued', 'running'));

-- Verify: exactly one anon SELECT policy on the table, and it is scoped
-- (not the old `true`).
do $$
declare expr text;
begin
  select pg_get_expr(p.polqual, p.polrelid) into expr
  from pg_policy p
  where p.polrelid = 'public.auto_quote_requests'::regclass
    and p.polcmd = 'r'
    and 'anon' = any (select rolname from pg_roles where oid = any(p.polroles));
  if expr is null then raise exception 'anon SELECT policy missing after migration'; end if;
  if expr = 'true' then raise exception 'anon SELECT still unscoped (true)'; end if;
end $$;
