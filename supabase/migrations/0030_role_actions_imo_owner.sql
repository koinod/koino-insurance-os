-- 0030 add imo_owner allowances to role_actions.
--
-- 0026 seeded role_actions with rep/manager/owner/admin allowances, but the
-- live agency_members.role enum also has 'imo_owner' (which is the dominant
-- account shape in the wild — see Auman / Zay / KOINO IMO rows). Without
-- catalog entries for imo_owner, every Ring-2 check in
-- api/agent/jobs/enqueue.js denies the call.
--
-- An imo_owner has at least the same dispatch surface as an owner — they own
-- the agency outright at the IMO tier. Mirror every owner allowance.

insert into public.role_actions (role, kind, allow)
select 'imo_owner', kind, allow
  from public.role_actions
 where role = 'owner'
on conflict (role, kind) do nothing;
