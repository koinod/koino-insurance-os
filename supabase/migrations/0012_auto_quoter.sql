-- ─────────────────────────────────────────────────────────────────────────
-- Auto Quoter — local-agent-driven cross-carrier quote runs
-- ─────────────────────────────────────────────────────────────────────────
--
-- Architecture:
--   • The Vercel-hosted Auto Quoter page inserts a row into
--     auto_quote_requests with the lead profile + which carriers to query.
--   • A local agent process running on the rep's machine
--     (see /agent/quote_agent.py + /agent/install.sh) polls this table for
--     status='queued' rows belonging to that rep, runs Playwright per
--     carrier (using the rep's locally-stored producer credentials), and
--     writes one row per carrier into auto_quote_results.
--   • The Auto Quoter page subscribes to auto_quote_results to render
--     premiums as they come back.
--
-- Critical: producer credentials are NEVER stored in this DB. They live in
-- ~/.koino/auto-quoter/credentials.json on the rep's machine.

create table if not exists auto_quote_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade,
  rep_id    text not null,                  -- rep_id from REPS (text not uuid for legacy compat)
  lead_id   uuid references pipeline(id) on delete set null,
  profile   jsonb not null,                 -- full lead profile (age, state, health, etc.)
  carriers  text[] not null default '{}',   -- carrier_ids to query; [] = all enabled
  status    text not null default 'queued', -- queued | running | complete | failed
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  notes text
);

create index if not exists idx_aqr_rep_status on auto_quote_requests(rep_id, status, created_at desc);
create index if not exists idx_aqr_agency on auto_quote_requests(agency_id, created_at desc);

create table if not exists auto_quote_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references auto_quote_requests(id) on delete cascade,
  carrier_id text not null,                 -- matches scrapers/<carrier>.py filename + CARRIER_NICHES.id
  status text not null,                     -- ok | decline | error | no_creds | no_scraper
  premium_cents integer,                    -- monthly premium in cents (null if decline/error)
  uw_class text,                            -- carrier UW class lead fell into
  raw_excerpt text,                         -- last few KB of source page for audit
  error text,                               -- error or decline reason
  created_at timestamptz default now()
);

create index if not exists idx_aqres_request on auto_quote_results(request_id, created_at);

-- Per-rep agent settings (browser headless toggle, agent online status, etc.)
create table if not exists auto_quoter_settings (
  rep_id text primary key,
  agency_id uuid references agencies(id) on delete cascade,
  headless boolean default true,            -- agent runs Chromium hidden vs visible
  enabled_carriers text[] default '{}',     -- carrier_ids the rep wants to quote against
  agent_last_seen timestamptz,              -- updated by agent on each poll
  agent_version text,
  updated_at timestamptz default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table auto_quote_requests enable row level security;
alter table auto_quote_results  enable row level security;
alter table auto_quoter_settings enable row level security;

-- Reps see/manage their own quote requests; managers see their downline;
-- owners see the whole agency.
create policy "rep sees own auto_quote_requests"
  on auto_quote_requests for all
  using (
    rep_id = current_setting('request.jwt.claims', true)::jsonb ->> 'rep_id'
    or exists (
      select 1 from rep_managers rm
      where rm.manager_rep_id = current_setting('request.jwt.claims', true)::jsonb ->> 'rep_id'
        and rm.rep_id = auto_quote_requests.rep_id
    )
    or current_setting('request.jwt.claims', true)::jsonb ->> 'role' in ('owner','admin')
  );

create policy "results follow request access"
  on auto_quote_results for all
  using (
    exists (
      select 1 from auto_quote_requests r
      where r.id = auto_quote_results.request_id
    )
  );

create policy "rep manages own auto_quoter_settings"
  on auto_quoter_settings for all
  using (
    rep_id = current_setting('request.jwt.claims', true)::jsonb ->> 'rep_id'
    or current_setting('request.jwt.claims', true)::jsonb ->> 'role' in ('owner','admin')
  );
