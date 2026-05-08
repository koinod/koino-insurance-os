-- 0021 Subscriptions & Onboarding robustness
--
-- Adds a dedicated subscriptions table to track agency billing status.
-- Enhances onboarding to support subscription verification.

create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  stripe_id     text unique,
  status        text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  plan_id       text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_subscriptions_agency on public.subscriptions(agency_id);

alter table public.subscriptions enable row level security;

-- Only agency owners and admins can read their subscription
create policy "tenant read subscription" on public.subscriptions
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

-- Superadmins can see everything
create policy "superadmin manage subscriptions" on public.subscriptions
  for all to authenticated
  using (exists (
    select 1 from public.agency_members m
     where m.user_id = auth.uid()
       and m.role    = 'super_admin'
       and m.active  = true
  ));

------------------------------------------------------------------------------
-- Enhance public.me() to include subscription info
------------------------------------------------------------------------------
create or replace function public.me()
returns table (
  rep_id          text,
  user_id         uuid,
  full_name       text,
  handle          text,
  role            text,
  tier            text,
  agency_id       uuid,
  agency_name     text,
  upline_id       text,
  subscription_status text
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
    r.upline_id                       as upline_id,
    s.status                          as subscription_status
  from public.reps r
  left join public.agencies       a  on a.id = r.agency_id
  left join public.agency_members am on am.user_id  = r.user_id
                                    and am.agency_id = r.agency_id
                                    and am.active is not false
  left join public.subscriptions  s  on s.agency_id = r.agency_id
  where r.user_id = auth.uid()
  limit 1;
$$;
