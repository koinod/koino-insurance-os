-- 0028 add 'solo' to agencies.plan allowed values.
--
-- The live `agencies_plan_check` constraint currently allows
-- ('trial','starter','growth','enterprise'). The first-run SoloFlow inserts
-- plan='solo' (single-producer agencies, billed differently from team plans),
-- which 23514s the constraint and aborts agency creation.
--
-- Solo is a real tier: a single licensed producer with no downline. They can
-- upgrade later (solo → starter) to add reps under them.

alter table public.agencies drop constraint if exists agencies_plan_check;
alter table public.agencies
  add constraint agencies_plan_check
  check (plan in ('trial','solo','starter','growth','enterprise'));
