-- 0027_manager_set_rates_and_overrides.sql
--
-- 1. Persist the Owner's override slice so it's not just a UI slider.
-- 2. Allow managers to set a "base_comp_pct" for their directs.
-- 3. Track recursive debt (clawbacks) in rollups.

-- Add default override to agency settings
alter table public.agencies
  add column if not exists default_override_pct numeric(6,2) default 20.0;

-- Add manager-set base comp to reps
alter table public.reps
  add column if not exists base_comp_pct numeric(6,2) default 50.0;

-- Add commission_kind to commissions to distinguish between 'advance', 'as_earned', and 'override'
do $$
begin
  if not exists (select 1 from pg_type where typname = 'commission_kind') then
    create type commission_kind as enum ('advance', 'as_earned', 'override', 'trail');
  end if;
end$$;

alter table public.commissions
  add column if not exists kind commission_kind default 'advance';

-- Helper to get total debt for a recursive downline
create or replace function public.downline_debt_cents(root_rep_id text)
returns bigint
language sql
stable
security definer
as $$
  select coalesce(sum(amount_cents), 0)::bigint
    from public.clawbacks
   where rep_id in (select rep_id from public.downline_of(root_rep_id));
$$;

grant execute on function public.downline_debt_cents(text) to authenticated;
