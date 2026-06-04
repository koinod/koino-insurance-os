-- 0087_carrier_deposits.sql
-- Carrier deposit ledger: actual money received from each carrier, allocated
-- to specific policies and commission kinds (advance / as_earned / trail /
-- override / renewal / chargeback_recoup / bonus / other). Lives ALONGSIDE
-- the projected `commissions` table — does not mutate it. Powers the
-- Deposits tab inside Book and per-carrier "contact carrier" nudges in PNL.
--
-- New tables:    public.carrier_deposits, public.deposit_allocations
-- New column:    public.carriers.payment_cycle_days  (int, default 14)
-- New view:      public.v_carrier_balance           (per agency+carrier)
-- New trigger:   tg_deposit_allocations_guard (mirrors agency_id, enforces
--                  Σ allocations <= deposit.gross_cents)
-- RLS mirrors:   public.commissions / public.clawbacks / public.payouts
--                  (read role-aware: manager+ or rep_id=me; write manager+)
--
-- Verify block at bottom: fails if any of the 2 tables / 1 column / 1 view
-- / 4 RLS policies / 2 triggers / 1 guard function are missing.

-- =================================================================== A.
-- payment_cycle_days on carriers (per-carrier expected days between deposits)
alter table public.carriers
  add column if not exists payment_cycle_days int not null default 14
  check (payment_cycle_days between 1 and 365);

comment on column public.carriers.payment_cycle_days is
  'Expected days between commission deposits. Drives "contact carrier" '
  'overdue flag in v_carrier_balance (overdue = days_since > cycle + 5).';

-- =================================================================== B.
-- carrier_deposits — one row per actual carrier deposit event
create table if not exists public.carrier_deposits (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  carrier_id    text not null references public.carriers(id),
  rep_id        text references public.reps(id) on delete set null,
  deposit_date  date not null default (now() at time zone 'utc')::date,
  gross_cents   bigint not null check (gross_cents >= 0),
  statement_ref text,
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists carrier_deposits_agency_date_idx
  on public.carrier_deposits (agency_id, deposit_date desc);
create index if not exists carrier_deposits_carrier_idx
  on public.carrier_deposits (agency_id, carrier_id, deposit_date desc);
create index if not exists carrier_deposits_rep_idx
  on public.carrier_deposits (agency_id, rep_id, deposit_date desc);

-- =================================================================== C.
-- deposit_allocations — one row per (deposit, policy?, kind) line item
create table if not exists public.deposit_allocations (
  id           uuid primary key default gen_random_uuid(),
  deposit_id   uuid not null references public.carrier_deposits(id) on delete cascade,
  agency_id    uuid not null,            -- mirrored from parent by trigger
  policy_id    uuid references public.policies(id) on delete set null,
  rep_id       text references public.reps(id) on delete set null,
  kind         text not null check (kind in (
                 'advance','as_earned','trail','override',
                 'renewal','chargeback_recoup','bonus','other')),
  amount_cents bigint not null check (amount_cents >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists deposit_allocations_deposit_idx
  on public.deposit_allocations (deposit_id);
create index if not exists deposit_allocations_policy_idx
  on public.deposit_allocations (policy_id) where policy_id is not null;
create index if not exists deposit_allocations_agency_kind_idx
  on public.deposit_allocations (agency_id, kind);

-- =================================================================== D.
-- Trigger: mirror agency_id from parent + enforce Σallocations <= gross
-- NOTE: BEFORE DELETE skips the parent-lookup. When a parent carrier_deposit
-- is deleted, ON DELETE CASCADE fires this trigger AFTER the parent row has
-- already been removed within the same statement — so the lookup would
-- always fail. Reducing the allocation sum is always safe; mirror runs on
-- INSERT/UPDATE only.
create or replace function public.tg_deposit_allocations_guard()
returns trigger
language plpgsql
as $func$
declare
  v_parent_agency uuid;
  v_parent_gross  bigint;
  v_alloc_sum     bigint;
  v_deposit_id    uuid;
begin
  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  v_deposit_id := NEW.deposit_id;

  select agency_id, gross_cents
    into v_parent_agency, v_parent_gross
    from public.carrier_deposits
   where id = v_deposit_id;

  if v_parent_agency is null then
    raise exception 'deposit_allocations: parent deposit % not found', v_deposit_id;
  end if;

  NEW.agency_id := v_parent_agency;

  select coalesce(sum(amount_cents), 0)
    into v_alloc_sum
    from public.deposit_allocations
   where deposit_id = v_deposit_id
     and (TG_OP <> 'UPDATE' or id <> NEW.id);
  v_alloc_sum := v_alloc_sum + NEW.amount_cents;

  if v_alloc_sum > v_parent_gross then
    raise exception 'deposit_allocations sum (% cents) exceeds deposit gross (% cents) for deposit %',
      v_alloc_sum, v_parent_gross, v_deposit_id;
  end if;

  return NEW;
end
$func$;

drop trigger if exists deposit_allocations_guard on public.deposit_allocations;
create trigger deposit_allocations_guard
  before insert or update or delete on public.deposit_allocations
  for each row execute function public.tg_deposit_allocations_guard();

-- updated_at touch on carrier_deposits
create or replace function public.tg_carrier_deposits_touch()
returns trigger
language plpgsql
as $func$
begin
  NEW.updated_at := now();
  return NEW;
end
$func$;

drop trigger if exists carrier_deposits_touch on public.carrier_deposits;
create trigger carrier_deposits_touch
  before update on public.carrier_deposits
  for each row execute function public.tg_carrier_deposits_touch();

-- =================================================================== E.
-- RLS — mirrors public.commissions / public.payouts / public.clawbacks
alter table public.carrier_deposits    enable row level security;
alter table public.deposit_allocations enable row level security;

drop policy if exists "carrier_deposits read role-aware" on public.carrier_deposits;
create policy "carrier_deposits read role-aware" on public.carrier_deposits
  for select using (
    public.is_super_admin()
    or public.is_agency_manager_or_above(agency_id)
    or rep_id = public.my_rep_id_in_agency(agency_id)
  );

drop policy if exists "carrier_deposits write manager+" on public.carrier_deposits;
create policy "carrier_deposits write manager+" on public.carrier_deposits
  for all
  using       (public.is_super_admin() or public.is_agency_manager_or_above(agency_id))
  with check  (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));

drop policy if exists "deposit_allocations read role-aware" on public.deposit_allocations;
create policy "deposit_allocations read role-aware" on public.deposit_allocations
  for select using (
    public.is_super_admin()
    or public.is_agency_manager_or_above(agency_id)
    or rep_id = public.my_rep_id_in_agency(agency_id)
  );

drop policy if exists "deposit_allocations write manager+" on public.deposit_allocations;
create policy "deposit_allocations write manager+" on public.deposit_allocations
  for all
  using       (public.is_super_admin() or public.is_agency_manager_or_above(agency_id))
  with check  (public.is_super_admin() or public.is_agency_manager_or_above(agency_id));

-- =================================================================== F.
-- v_carrier_balance — per (agency_id, carrier_id) expected vs received,
-- last deposit, days since, overdue flag. security_invoker so RLS on
-- underlying tables applies to view consumers.
create or replace view public.v_carrier_balance
with (security_invoker = on)
as
with pairs as (
  select distinct agency_id, carrier_id
    from public.policies
   where carrier_id is not null
  union
  select distinct agency_id, carrier_id
    from public.carrier_deposits
  union
  select distinct agency_id, carrier_id
    from public.agency_carrier_appointments
   where agency_id is not null and carrier_id is not null
),
expected as (
  select p.agency_id, p.carrier_id,
         sum(co.amount_cents) filter (where co.earned_at >= date_trunc('year', now())::date) as expected_ytd_cents,
         sum(co.amount_cents)                                                                as expected_lifetime_cents
    from public.commissions co
    join public.policies p on p.id = co.policy_id
   where p.carrier_id is not null
   group by p.agency_id, p.carrier_id
),
received as (
  select agency_id, carrier_id,
         sum(gross_cents) filter (where deposit_date >= date_trunc('year', now())::date) as received_ytd_cents,
         sum(gross_cents)                                                                as received_lifetime_cents,
         max(deposit_date)                                                               as last_deposit_date,
         count(*)                                                                        as deposit_count
    from public.carrier_deposits
   group by agency_id, carrier_id
),
received_by_kind as (
  select d.agency_id, d.carrier_id,
         sum(a.amount_cents) filter (where a.kind = 'override')                                          as received_override_cents,
         sum(a.amount_cents) filter (where a.kind in ('as_earned','advance','trail','renewal','bonus'))  as received_own_cents,
         sum(a.amount_cents) filter (where a.kind = 'chargeback_recoup')                                 as received_recoup_cents,
         sum(a.amount_cents) filter (where a.kind = 'advance')                                           as received_advance_cents
    from public.carrier_deposits d
    join public.deposit_allocations a on a.deposit_id = d.id
   group by d.agency_id, d.carrier_id
),
debt as (
  select cb.agency_id, p.carrier_id,
         sum(cb.amount_cents) filter (where cb.status in ('recorded','disputing')) as open_chargeback_cents
    from public.clawbacks cb
    join public.policies p on p.id = cb.policy_id
   where p.carrier_id is not null
   group by cb.agency_id, p.carrier_id
)
select
  pp.agency_id,
  pp.carrier_id,
  car.name                                                            as carrier_name,
  car.payment_cycle_days,
  car.contact_name                                                    as carrier_contact_name,
  car.contact_phone                                                   as carrier_contact_phone,
  car.contact_email                                                   as carrier_contact_email,
  coalesce(e.expected_ytd_cents,         0)                           as expected_ytd_cents,
  coalesce(e.expected_lifetime_cents,    0)                           as expected_lifetime_cents,
  coalesce(r.received_ytd_cents,         0)                           as received_ytd_cents,
  coalesce(r.received_lifetime_cents,    0)                           as received_lifetime_cents,
  coalesce(k.received_own_cents,         0)                           as received_own_cents,
  coalesce(k.received_override_cents,    0)                           as received_override_cents,
  coalesce(k.received_recoup_cents,      0)                           as received_recoup_cents,
  coalesce(k.received_advance_cents,     0)                           as received_advance_cents,
  greatest(
    coalesce(e.expected_lifetime_cents, 0) - coalesce(r.received_lifetime_cents, 0),
    0
  )                                                                   as owed_lifetime_cents,
  coalesce(db.open_chargeback_cents,     0)                           as open_chargeback_cents,
  r.last_deposit_date,
  coalesce(r.deposit_count, 0)                                        as deposit_count,
  case when r.last_deposit_date is null then null
       else (current_date - r.last_deposit_date)::int end             as days_since_last_deposit,
  case when r.last_deposit_date is null then false
       when (current_date - r.last_deposit_date) >
            (coalesce(car.payment_cycle_days, 14) + 5) then true
       else false end                                                 as overdue
from pairs pp
join public.carriers car        on car.id = pp.carrier_id
left join expected e            on e.agency_id  = pp.agency_id and e.carrier_id  = pp.carrier_id
left join received r            on r.agency_id  = pp.agency_id and r.carrier_id  = pp.carrier_id
left join received_by_kind k    on k.agency_id  = pp.agency_id and k.carrier_id  = pp.carrier_id
left join debt db               on db.agency_id = pp.agency_id and db.carrier_id = pp.carrier_id;

comment on view public.v_carrier_balance is
  'Per (agency_id, carrier_id) ledger: expected commissions (from projected '
  '`commissions`) vs received (from `carrier_deposits` + `deposit_allocations`), '
  'plus last_deposit_date, days_since, and overdue flag (days_since > cycle + 5).';

-- =================================================================== G.
-- Verify block — fails loudly if anything is missing.
do $verify$
declare
  n_tables  int;
  n_columns int;
  n_view    int;
  n_policy  int;
  n_trigger int;
  n_func    int;
begin
  select count(*) into n_tables
    from information_schema.tables
   where table_schema='public'
     and table_name in ('carrier_deposits','deposit_allocations');
  if n_tables <> 2 then
    raise exception 'expected 2 new tables, got %', n_tables;
  end if;

  select count(*) into n_columns
    from information_schema.columns
   where table_schema='public' and table_name='carriers'
     and column_name='payment_cycle_days';
  if n_columns <> 1 then
    raise exception 'expected carriers.payment_cycle_days column, got %', n_columns;
  end if;

  select count(*) into n_view
    from information_schema.views
   where table_schema='public' and table_name='v_carrier_balance';
  if n_view <> 1 then
    raise exception 'expected v_carrier_balance view, got %', n_view;
  end if;

  select count(*) into n_policy
    from pg_policies
   where schemaname='public'
     and tablename in ('carrier_deposits','deposit_allocations');
  if n_policy <> 4 then
    raise exception 'expected 4 RLS policies on deposit tables, got %', n_policy;
  end if;

  select count(*) into n_trigger
    from pg_trigger t
    join pg_class   c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public'
     and t.tgname in ('deposit_allocations_guard','carrier_deposits_touch')
     and not t.tgisinternal;
  if n_trigger <> 2 then
    raise exception 'expected 2 deposit triggers, got %', n_trigger;
  end if;

  select count(*) into n_func
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public'
     and p.proname in ('tg_deposit_allocations_guard','tg_carrier_deposits_touch');
  if n_func <> 2 then
    raise exception 'expected 2 deposit trigger funcs, got %', n_func;
  end if;
end
$verify$;
