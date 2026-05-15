-- ─────────────────────────────────────────────────────────────────────────
-- 0028 Life + Annuity carrier underwriting database
-- ─────────────────────────────────────────────────────────────────────────
--
-- Purpose: one source of truth for every life + annuity carrier and product
-- we could write, including the underwriting rules that decide eligibility.
--
-- Two consumers:
--   1. /api/carrier-recommend — ranks carriers per case, drives autoquoter
--      login order AND surfaces a manual shortlist for reps without the
--      autoquoter.
--   2. agent/quote_agent.py — calls the recommend endpoint before opening
--      Playwright sessions so it skips dead-end carriers and tries the
--      best-fit ones first.
--
-- Edge cases are first-class: id_type (SSN / EIN-only / ITIN), citizenship
-- (US / green card / visa class / foreign national), funding_source for
-- annuities (qualified vs non-qualified), aviation, avocation, dui_lookback,
-- bankruptcy_lookback. Few cases trip these — but reps get stuck on them
-- today.
--
-- SHAPE NOT DATA: this migration is CREATE-only. Carrier rows arrive at
-- runtime via the scraper → review → approve flow (carrier_scrape_findings
-- → admin approves → live tables).
--
-- Read access: any authenticated rep (catalog data).
-- Write access: super_admin only (per CLAUDE.md governance).

set local search_path = public;

-- ── carrier_profiles ─────────────────────────────────────────────────────
-- Life/annuity-specific metadata layered on top of public.carriers.
-- One row per carrier_id that we actively quote against.

create table if not exists public.carrier_profiles (
  carrier_id            text primary key references public.carriers(id) on delete cascade,
  quote_priority        integer not null default 100,           -- lower = try first
  bind_speed_hours      integer,                                -- typical issue→bind in hours
  commission_tier       text check (commission_tier in ('a','b','c')),
  e_app_url             text,
  quoter_url            text,
  producer_portal_url   text,
  appointment_required  boolean not null default true,
  jit_appointment       boolean not null default false,         -- just-in-time appointment supported
  autoquoter_supported  boolean not null default false,         -- has scraper module in agent/scrapers/
  scraper_slug          text,                                   -- matches agent/scrapers/<slug>.py
  notes                 text,
  updated_at            timestamptz not null default now()
);
create index if not exists carrier_profiles_priority_idx
  on public.carrier_profiles (quote_priority);

-- ── product_features_life ───────────────────────────────────────────────
-- Denormalised columns extracted from products.features for fast filtering.
-- Only populated when products.category = 'life'.

create table if not exists public.product_features_life (
  product_id                       uuid primary key references public.products(id) on delete cascade,
  product_subtype                  text not null check (product_subtype in ('term','whole','iul','gul','vul','final_expense')),
  term_lengths                     integer[],                   -- [10,15,20,25,30] for term
  convertible                      boolean,
  conversion_window_years          integer,
  min_face_cents                   bigint,
  max_face_cents                   bigint,
  accelerated_uw_max_face_cents    bigint,                      -- drop-ticket / instant decision ceiling
  exam_required_above_cents        bigint,                      -- paramed exam threshold
  living_benefits                  text[],                      -- ['chronic','critical','terminal','ltc']
  return_of_premium                boolean,
  updated_at                       timestamptz not null default now()
);

-- ── product_features_annuity ────────────────────────────────────────────
-- Annuity-specific extracted features. Only populated when
-- products.category = 'annuity'.

create table if not exists public.product_features_annuity (
  product_id                       uuid primary key references public.products(id) on delete cascade,
  product_subtype                  text not null check (product_subtype in ('fia','myga','mygabuf','spia','dia','vat','registered_index_linked')),
  min_premium_cents                bigint,
  max_premium_cents                bigint,
  max_issue_age                    integer,
  surrender_schedule_years         integer,
  mva                              boolean,                     -- market value adjustment
  free_withdrawal_pct              numeric(5,2),
  income_rider_available           boolean,
  income_rider_fee_bps             integer,
  cap_rate_bps                     integer,
  participation_rate_bps           integer,
  spread_bps                       integer,
  bonus_pct                        numeric(5,2),
  qualified_funds_ok               boolean default true,
  nonqualified_funds_ok            boolean default true,
  updated_at                       timestamptz not null default now()
);

-- ── product_underwriting_rules ──────────────────────────────────────────
-- The rules engine. One row per rule. payload jsonb shape varies by
-- rule_type; the recommend API validates per-type via zod schemas.
--
-- Severity is the action the rule fires when it MATCHES the case:
--   decline   — carrier will not write this risk; remove from shortlist
--   postpone  — carrier requires waiting period; show with delay note
--   refer_uw  — needs informal inquiry; surface but don't auto-quote
--   rate_up   — eligible but rate-class downgrade; show with caveat
--   info      — non-blocking note (e.g. "requires APS over age 70")
--
-- The recommend API treats the ABSENCE of a rule as 'refer_uw' rather
-- than silently passing — better to flag than send a rep into a dead-end app.

create table if not exists public.product_underwriting_rules (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  rule_type           text not null check (rule_type in (
    -- identity / eligibility
    'id_type', 'citizenship', 'residency_months', 'state_avail',
    'age_band', 'gender_rules',
    -- medical
    'build_chart', 'tobacco', 'condition_decline', 'condition_rate_class',
    'rx_lookback', 'mib_rules', 'exam_required',
    -- financial
    'face_amount', 'income_multiple', 'net_worth_min', 'financial_just',
    'replacement', '1035_exchange', 'business_purpose', 'trust_owned',
    'premium_finance',
    -- lifestyle
    'foreign_travel', 'aviation', 'avocation',
    'criminal_history', 'dui_lookback', 'bankruptcy_lookback',
    -- product mechanics
    'funding_source', 'rider_eligibility', 'conversion_window',
    'accelerated_uw_path'
  )),
  payload             jsonb not null default '{}'::jsonb,
  severity            text not null check (severity in ('decline','postpone','refer_uw','rate_up','info')),
  source_url          text,
  source_quote        text,                                       -- verbatim guideline excerpt for audit
  source_captured_at  timestamptz,
  review_status       text not null default 'pending'
                      check (review_status in ('pending','approved','rejected')),
  reviewed_by         text,                                       -- email of approver
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists pur_product_idx on public.product_underwriting_rules (product_id);
create index if not exists pur_review_idx  on public.product_underwriting_rules (review_status, created_at desc);
create index if not exists pur_type_idx    on public.product_underwriting_rules (product_id, rule_type);

-- ── carrier_scrape_jobs / carrier_scrape_findings ───────────────────────
-- Mirror of the auto_quote_requests/results pattern. A KOINO-side agent
-- scrapes IMO underwriting guides + carrier producer portals and posts
-- findings here for human review. Approving a finding writes through to
-- carriers / products / product_underwriting_rules / carrier_profiles.

create table if not exists public.carrier_scrape_jobs (
  id            uuid primary key default gen_random_uuid(),
  carrier_id    text references public.carriers(id) on delete cascade,
  source_kind   text not null check (source_kind in ('imo_guide','carrier_portal','rate_sheet','rider_doc','other')),
  source_url    text,
  status        text not null default 'queued'
                check (status in ('queued','running','succeeded','failed')),
  started_at    timestamptz,
  completed_at  timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists csj_status_idx on public.carrier_scrape_jobs (status, created_at desc);

create table if not exists public.carrier_scrape_findings (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references public.carrier_scrape_jobs(id) on delete set null,
  carrier_id      text references public.carriers(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  finding_kind    text not null check (finding_kind in (
    'new_carrier', 'new_product', 'new_rule', 'update_rule',
    'update_features_life', 'update_features_annuity', 'update_profile'
  )),
  proposed        jsonb not null,                                 -- shape mirrors target table row
  current_value   jsonb,                                          -- snapshot of current row (for diff)
  source_url      text,
  source_quote    text,                                           -- verbatim excerpt
  confidence      numeric(3,2),                                   -- 0.00–1.00
  review_status   text not null default 'pending'
                  check (review_status in ('pending','approved','rejected','superseded')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  applied_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists csf_review_idx  on public.carrier_scrape_findings (review_status, created_at desc);
create index if not exists csf_carrier_idx on public.carrier_scrape_findings (carrier_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Read = any authenticated rep (catalog reference). Write = super_admin only.

alter table public.carrier_profiles            enable row level security;
alter table public.product_features_life       enable row level security;
alter table public.product_features_annuity    enable row level security;
alter table public.product_underwriting_rules  enable row level security;
alter table public.carrier_scrape_jobs         enable row level security;
alter table public.carrier_scrape_findings     enable row level security;

-- carrier_profiles
drop policy if exists "auth read carrier_profiles"  on public.carrier_profiles;
drop policy if exists "super_admin write carrier_profiles" on public.carrier_profiles;
create policy "auth read carrier_profiles"
  on public.carrier_profiles for select to authenticated using (true);
create policy "super_admin write carrier_profiles"
  on public.carrier_profiles for all to authenticated
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );

-- product_features_life
drop policy if exists "auth read product_features_life"  on public.product_features_life;
drop policy if exists "super_admin write product_features_life" on public.product_features_life;
create policy "auth read product_features_life"
  on public.product_features_life for select to authenticated using (true);
create policy "super_admin write product_features_life"
  on public.product_features_life for all to authenticated
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );

-- product_features_annuity
drop policy if exists "auth read product_features_annuity"  on public.product_features_annuity;
drop policy if exists "super_admin write product_features_annuity" on public.product_features_annuity;
create policy "auth read product_features_annuity"
  on public.product_features_annuity for select to authenticated using (true);
create policy "super_admin write product_features_annuity"
  on public.product_features_annuity for all to authenticated
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );

-- product_underwriting_rules — reps read APPROVED rules only;
-- super_admin sees all (incl. pending) for review.
drop policy if exists "auth read approved underwriting rules" on public.product_underwriting_rules;
drop policy if exists "super_admin all underwriting rules"    on public.product_underwriting_rules;
create policy "auth read approved underwriting rules"
  on public.product_underwriting_rules for select to authenticated
  using ( review_status = 'approved' OR public.is_super_admin() );
create policy "super_admin all underwriting rules"
  on public.product_underwriting_rules for all to authenticated
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );

-- carrier_scrape_jobs / findings — super_admin only (operational queue).
drop policy if exists "super_admin all scrape jobs"      on public.carrier_scrape_jobs;
drop policy if exists "super_admin all scrape findings"  on public.carrier_scrape_findings;
create policy "super_admin all scrape jobs"
  on public.carrier_scrape_jobs for all to authenticated
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );
create policy "super_admin all scrape findings"
  on public.carrier_scrape_findings for all to authenticated
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );

-- ── Approve helper ──────────────────────────────────────────────────────
-- SECURITY DEFINER fn so the admin UI can approve a finding in one call,
-- writing through to the live target table atomically.

create or replace function public.approve_carrier_scrape_finding(
  p_finding_id uuid,
  p_reviewer   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.carrier_scrape_findings%rowtype;
  pid uuid;
begin
  if not public.is_super_admin() then
    raise exception 'super_admin required';
  end if;

  select * into f from public.carrier_scrape_findings where id = p_finding_id;
  if not found then
    raise exception 'finding not found';
  end if;
  if f.review_status <> 'pending' then
    raise exception 'finding already %', f.review_status;
  end if;

  if f.finding_kind = 'new_carrier' then
    insert into public.carriers (id, name, category, product_lines, notes)
    select
      (f.proposed->>'id'),
      (f.proposed->>'name'),
      coalesce(f.proposed->>'category','life'),
      coalesce(array(select jsonb_array_elements_text(f.proposed->'product_lines')), '{}'::text[]),
      f.proposed->>'notes'
    on conflict (id) do nothing;

  elsif f.finding_kind = 'new_product' then
    insert into public.products (carrier_id, name, category, comp_pct, features)
    values (
      f.carrier_id,
      f.proposed->>'name',
      f.proposed->>'category',
      nullif(f.proposed->>'comp_pct','')::numeric,
      coalesce(f.proposed->'features','{}'::jsonb)
    ) returning id into pid;

  elsif f.finding_kind = 'new_rule' then
    insert into public.product_underwriting_rules
      (product_id, rule_type, payload, severity, source_url, source_quote,
       source_captured_at, review_status, reviewed_by, reviewed_at)
    values (
      f.product_id,
      f.proposed->>'rule_type',
      coalesce(f.proposed->'payload','{}'::jsonb),
      f.proposed->>'severity',
      f.source_url,
      f.source_quote,
      now(),
      'approved',
      p_reviewer,
      now()
    );

  elsif f.finding_kind = 'update_rule' then
    update public.product_underwriting_rules
      set payload = coalesce(f.proposed->'payload', payload),
          severity = coalesce(f.proposed->>'severity', severity),
          source_url = coalesce(f.source_url, source_url),
          source_quote = coalesce(f.source_quote, source_quote),
          review_status = 'approved',
          reviewed_by = p_reviewer,
          reviewed_at = now()
    where id = (f.proposed->>'rule_id')::uuid;

  elsif f.finding_kind = 'update_features_life' then
    insert into public.product_features_life as t (
      product_id, product_subtype, term_lengths, convertible,
      conversion_window_years, min_face_cents, max_face_cents,
      accelerated_uw_max_face_cents, exam_required_above_cents,
      living_benefits, return_of_premium
    ) values (
      f.product_id,
      f.proposed->>'product_subtype',
      coalesce(array(select (jsonb_array_elements_text(f.proposed->'term_lengths'))::int), '{}'::int[]),
      (f.proposed->>'convertible')::boolean,
      nullif(f.proposed->>'conversion_window_years','')::int,
      nullif(f.proposed->>'min_face_cents','')::bigint,
      nullif(f.proposed->>'max_face_cents','')::bigint,
      nullif(f.proposed->>'accelerated_uw_max_face_cents','')::bigint,
      nullif(f.proposed->>'exam_required_above_cents','')::bigint,
      coalesce(array(select jsonb_array_elements_text(f.proposed->'living_benefits')), '{}'::text[]),
      (f.proposed->>'return_of_premium')::boolean
    )
    on conflict (product_id) do update set
      product_subtype = excluded.product_subtype,
      term_lengths = excluded.term_lengths,
      convertible = excluded.convertible,
      conversion_window_years = excluded.conversion_window_years,
      min_face_cents = excluded.min_face_cents,
      max_face_cents = excluded.max_face_cents,
      accelerated_uw_max_face_cents = excluded.accelerated_uw_max_face_cents,
      exam_required_above_cents = excluded.exam_required_above_cents,
      living_benefits = excluded.living_benefits,
      return_of_premium = excluded.return_of_premium,
      updated_at = now();

  elsif f.finding_kind = 'update_features_annuity' then
    insert into public.product_features_annuity as t (
      product_id, product_subtype, min_premium_cents, max_premium_cents,
      max_issue_age, surrender_schedule_years, mva, free_withdrawal_pct,
      income_rider_available, income_rider_fee_bps, cap_rate_bps,
      participation_rate_bps, spread_bps, bonus_pct,
      qualified_funds_ok, nonqualified_funds_ok
    ) values (
      f.product_id,
      f.proposed->>'product_subtype',
      nullif(f.proposed->>'min_premium_cents','')::bigint,
      nullif(f.proposed->>'max_premium_cents','')::bigint,
      nullif(f.proposed->>'max_issue_age','')::int,
      nullif(f.proposed->>'surrender_schedule_years','')::int,
      (f.proposed->>'mva')::boolean,
      nullif(f.proposed->>'free_withdrawal_pct','')::numeric,
      (f.proposed->>'income_rider_available')::boolean,
      nullif(f.proposed->>'income_rider_fee_bps','')::int,
      nullif(f.proposed->>'cap_rate_bps','')::int,
      nullif(f.proposed->>'participation_rate_bps','')::int,
      nullif(f.proposed->>'spread_bps','')::int,
      nullif(f.proposed->>'bonus_pct','')::numeric,
      coalesce((f.proposed->>'qualified_funds_ok')::boolean, true),
      coalesce((f.proposed->>'nonqualified_funds_ok')::boolean, true)
    )
    on conflict (product_id) do update set
      product_subtype = excluded.product_subtype,
      min_premium_cents = excluded.min_premium_cents,
      max_premium_cents = excluded.max_premium_cents,
      max_issue_age = excluded.max_issue_age,
      surrender_schedule_years = excluded.surrender_schedule_years,
      mva = excluded.mva,
      free_withdrawal_pct = excluded.free_withdrawal_pct,
      income_rider_available = excluded.income_rider_available,
      income_rider_fee_bps = excluded.income_rider_fee_bps,
      cap_rate_bps = excluded.cap_rate_bps,
      participation_rate_bps = excluded.participation_rate_bps,
      spread_bps = excluded.spread_bps,
      bonus_pct = excluded.bonus_pct,
      qualified_funds_ok = excluded.qualified_funds_ok,
      nonqualified_funds_ok = excluded.nonqualified_funds_ok,
      updated_at = now();

  elsif f.finding_kind = 'update_profile' then
    insert into public.carrier_profiles as t (
      carrier_id, quote_priority, bind_speed_hours, commission_tier,
      e_app_url, quoter_url, producer_portal_url,
      appointment_required, jit_appointment,
      autoquoter_supported, scraper_slug, notes
    ) values (
      f.carrier_id,
      coalesce(nullif(f.proposed->>'quote_priority','')::int, 100),
      nullif(f.proposed->>'bind_speed_hours','')::int,
      f.proposed->>'commission_tier',
      f.proposed->>'e_app_url',
      f.proposed->>'quoter_url',
      f.proposed->>'producer_portal_url',
      coalesce((f.proposed->>'appointment_required')::boolean, true),
      coalesce((f.proposed->>'jit_appointment')::boolean, false),
      coalesce((f.proposed->>'autoquoter_supported')::boolean, false),
      f.proposed->>'scraper_slug',
      f.proposed->>'notes'
    )
    on conflict (carrier_id) do update set
      quote_priority = excluded.quote_priority,
      bind_speed_hours = excluded.bind_speed_hours,
      commission_tier = excluded.commission_tier,
      e_app_url = excluded.e_app_url,
      quoter_url = excluded.quoter_url,
      producer_portal_url = excluded.producer_portal_url,
      appointment_required = excluded.appointment_required,
      jit_appointment = excluded.jit_appointment,
      autoquoter_supported = excluded.autoquoter_supported,
      scraper_slug = excluded.scraper_slug,
      notes = excluded.notes,
      updated_at = now();
  end if;

  update public.carrier_scrape_findings
     set review_status = 'approved',
         reviewed_by   = p_reviewer,
         reviewed_at   = now(),
         applied_at    = now()
   where id = p_finding_id;
end;
$$;

grant execute on function public.approve_carrier_scrape_finding(uuid, text) to authenticated;

create or replace function public.reject_carrier_scrape_finding(
  p_finding_id uuid,
  p_reviewer   text,
  p_reason     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'super_admin required';
  end if;
  update public.carrier_scrape_findings
     set review_status = 'rejected',
         reviewed_by   = p_reviewer,
         reviewed_at   = now()
   where id = p_finding_id and review_status = 'pending';
end;
$$;

grant execute on function public.reject_carrier_scrape_finding(uuid, text, text) to authenticated;
