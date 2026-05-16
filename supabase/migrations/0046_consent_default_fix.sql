-- 0041_consent_default_fix.sql
-- TCPA pre-flight blocker #1: pipeline.consent default must NOT be 'verified'.
--
-- Per 0001_repflow_v2_init.sql line 78, public.pipeline declares:
--   consent text not null default 'verified' check (consent in ('verified','pending','none'))
--
-- That default makes every code path that omits consent (and there are many
-- — agent-create, vendor-webhook, inbound.js, cross-sell-sweep) silently
-- mint a row with TCPA-quality consent. The downstream consent gate in
-- api/cron/sms-flush.js (sprint/leaddrip-phase2-sender) becomes theater.
--
-- This migration:
--   1. Loosens the CHECK constraint to recognise the four real states.
--   2. Flips the default to 'pending'.
--   3. Backfills existing rows: legacy 'verified' that lacks a proving
--      touchpoint is demoted to 'pending'; rows with an explicit consent
--      touchpoint stay 'verified'; rows that came in via a paying-vendor
--      inbound webhook keep contractual consent as 'express'.
--   4. Comments the column so callers know the vocabulary.
--
-- NOTE: 0001's CHECK constraint did NOT permit 'express', yet
-- api/leads/inbound-source.js:173 has been inserting 'express' since
-- 0031 shipped — meaning either the constraint was being violated in
-- production (and the inserts were silently failing) or the CHECK was
-- already dropped out-of-band. Either way, this migration is the
-- canonical fix.
--
-- TCPA vocabulary:
--   'pending'  → no proof of consent yet; sender MUST block SMS.
--   'implied'  → existing-business-relationship territory; sender MAY
--                allow informational SMS only (no marketing).
--   'express'  → written/contractual consent (vendor leads, web form
--                with TCPA checkbox, etc); sender allows marketing.
--   'verified' → legacy value from pre-Phase-2 schema; treat as 'express'
--                in the consent gate so existing data isn't stranded.

-- 1. Drop the old CHECK and install one that knows about the full vocabulary.
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'pipeline_consent_check'
      and conrelid = 'public.pipeline'::regclass
  ) then
    alter table public.pipeline drop constraint pipeline_consent_check;
  end if;
end $$;

-- The original CHECK was inlined on the column (no explicit name); Postgres
-- auto-names it `pipeline_consent_check`. The block above handles that.
-- Drop any other variant names defensively.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pipeline'::regclass
      and pg_get_constraintdef(oid) ilike '%consent%'
      and contype = 'c'
  loop
    execute format('alter table public.pipeline drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.pipeline
  add constraint pipeline_consent_check
  check (consent in ('pending','implied','express','verified','none'));

-- 2. Flip the default. New rows that omit consent will be 'pending'.
alter table public.pipeline
  alter column consent set default 'pending';

-- 3. Backfill. Order matters — handle the explicit-consent touchpoint
--    case before the inbound-webhook case so a row that has both wins
--    'verified' (proven) over 'express' (assumed).
--
--    Note: public.touchpoints.kind in 0002_fill_missing_domains.sql is
--    constrained to {impression, click, call, sms, email, visit,
--    form_submit, referral, other}. The values 'consent', 'tcpa', and
--    'opt_in' are NOT in the current CHECK — they are forward-looking
--    so the explicit-consent JOIN below currently matches 0 rows.
--    We leave the query intact so the moment a follow-up migration
--    widens the CHECK and the consent-capture code starts writing
--    these touchpoints, the backfill semantics are already correct.

-- 3a. Demote legacy 'verified' rows that have no proving touchpoint AND
--     did not arrive through a paying inbound webhook → 'pending'.
update public.pipeline p
   set consent = 'pending'
 where p.consent = 'verified'
   and not exists (
     select 1 from public.touchpoints t
      where t.lead_pipeline_id = p.id
        and t.kind in ('consent','tcpa','opt_in')
   )
   and not exists (
     select 1 from public.agency_lead_sources s
      where s.agency_id = p.agency_id
        and s.name = p.source
        and coalesce(s.inbound_count, 0) > 0
   );

-- 3b. Promote inbound-vendor rows that still read 'verified' to 'express'.
--     (Vendor agreements carry the written consent; we want the new gate
--     to recognise that without forcing a re-import.)
update public.pipeline p
   set consent = 'express'
 where p.consent = 'verified'
   and exists (
     select 1 from public.agency_lead_sources s
      where s.agency_id = p.agency_id
        and s.name = p.source
        and coalesce(s.inbound_count, 0) > 0
   )
   and not exists (
     select 1 from public.touchpoints t
      where t.lead_pipeline_id = p.id
        and t.kind in ('consent','tcpa','opt_in')
   );

-- 3c. (Rows with an explicit consent touchpoint stay 'verified' — no
--     update needed.)

-- 4. Comment so future maintainers know what each value means.
comment on column public.pipeline.consent is
$$Consent ladder used by the SMS/email gate in api/cron/sms-flush.js.

  pending  — no proof of consent; gate BLOCKS all outbound messaging.
  implied  — existing business relationship; gate ALLOWS informational
             only (e.g. transactional, service notices). No marketing.
  express  — written/contractual consent (vendor leads, TCPA-checked
             web forms, signed e-app). Gate ALLOWS marketing.
  verified — legacy pre-Phase-2 value. Treat as equivalent to 'express'
             for gate-pass purposes. New code should write 'express'.
  none     — explicitly refused / opted out. Gate BLOCKS.

  Default flipped from 'verified' to 'pending' in 0041 so that any code
  path that omits consent fails CLOSED (TCPA-safe) instead of OPEN
  (consent theatre).$$;
