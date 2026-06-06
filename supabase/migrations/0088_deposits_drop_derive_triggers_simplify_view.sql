-- 0088_deposits_drop_derive_triggers_simplify_view.sql
-- 2026-06-05 — Ian: comp-rate math is unreliable (rates vary per rep / per
-- product / per state and we don't have all the info). Strip every
-- auto-derivation from policies and let managers log money manually.
--
-- Drops three triggers on public.policies:
--   - policies_expected_commission_trg  (filled expected_commission_cents
--     from ap × comp_rate_pct)
--   - policies_owner_commission_trg     (auto-created commissions rows
--     for the rep's own production)
--   - policies_override_commissions_trg (auto-created override commissions
--     rows up the upline chain)
--
-- The trigger FUNCTIONS are left intact (unused, kept for archaeology in
-- case Ian ever wants to revive an opt-in projection mode). All the policy
-- columns stay (expected_commission_cents writable; comp_rate_pct writable).
-- Existing commissions rows preserved as historical record. No new
-- commissions rows are auto-generated going forward.
--
-- Also simplifies public.v_carrier_balance to drop the expected_/owed_
-- columns that depended on the now-frozen `commissions` projections.
-- Postgres can't drop columns from a view via CREATE OR REPLACE, so the
-- view is DROP'd then CREATE'd.

drop trigger if exists policies_expected_commission_trg on public.policies;
drop trigger if exists policies_owner_commission_trg   on public.policies;
drop trigger if exists policies_override_commissions_trg on public.policies;

drop view if exists public.v_carrier_balance;

create view public.v_carrier_balance
with (security_invoker = on) as
with pairs as (
  select distinct agency_id, carrier_id from public.policies where carrier_id is not null
  union
  select distinct agency_id, carrier_id from public.carrier_deposits
  union
  select distinct agency_id, carrier_id from public.agency_carrier_appointments where agency_id is not null and carrier_id is not null
),
received as (
  select agency_id, carrier_id,
         sum(gross_cents) filter (where deposit_date >= date_trunc('year', now())::date) as received_ytd_cents,
         sum(gross_cents) as received_lifetime_cents,
         max(deposit_date) as last_deposit_date,
         count(*) as deposit_count
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
  pp.agency_id, pp.carrier_id,
  car.name                                                            as carrier_name,
  car.payment_cycle_days,
  car.contact_name                                                    as carrier_contact_name,
  car.contact_phone                                                   as carrier_contact_phone,
  car.contact_email                                                   as carrier_contact_email,
  coalesce(r.received_ytd_cents,      0)                              as received_ytd_cents,
  coalesce(r.received_lifetime_cents, 0)                              as received_lifetime_cents,
  coalesce(k.received_own_cents,      0)                              as received_own_cents,
  coalesce(k.received_override_cents, 0)                              as received_override_cents,
  coalesce(k.received_recoup_cents,   0)                              as received_recoup_cents,
  coalesce(k.received_advance_cents,  0)                              as received_advance_cents,
  coalesce(db.open_chargeback_cents,  0)                              as open_chargeback_cents,
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
left join received r            on r.agency_id  = pp.agency_id and r.carrier_id  = pp.carrier_id
left join received_by_kind k    on k.agency_id  = pp.agency_id and k.carrier_id  = pp.carrier_id
left join debt db               on db.agency_id = pp.agency_id and db.carrier_id = pp.carrier_id;

comment on view public.v_carrier_balance is
  '2026-06-05 simplified: pure received-side ledger. No expected/owed math '
  '— comp rates are too variable to project reliably. Surfaces received_*, '
  'last_deposit_date, days_since, overdue (cycle+5), and per-kind breakdowns '
  '(override / own / recoup / advance) for the Deposits tab.';

do $verify$
declare n_trig int; n_bad_cols int; n_view_cols int;
begin
  select count(*) into n_trig
    from pg_trigger t
    join pg_class   c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public'
     and t.tgname in ('policies_expected_commission_trg','policies_owner_commission_trg','policies_override_commissions_trg');
  if n_trig <> 0 then raise exception 'expected 0 derive triggers remaining, got %', n_trig; end if;

  select count(*) into n_bad_cols
    from information_schema.columns
   where table_schema='public' and table_name='v_carrier_balance'
     and column_name in ('expected_ytd_cents','expected_lifetime_cents','owed_lifetime_cents');
  if n_bad_cols <> 0 then raise exception 'v_carrier_balance still exposes expected/owed columns: %', n_bad_cols; end if;

  select count(*) into n_view_cols
    from information_schema.columns
   where table_schema='public' and table_name='v_carrier_balance';
  if n_view_cols < 14 then raise exception 'v_carrier_balance has only % columns, view shape suspect', n_view_cols; end if;
end
$verify$;
