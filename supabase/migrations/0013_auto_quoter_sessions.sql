-- ─────────────────────────────────────────────────────────────────────────
-- Auto Quoter — session capture + multi-purpose request types
-- ─────────────────────────────────────────────────────────────────────────
--
-- Adds two capabilities on top of 0012:
--
--   1. request_type column on auto_quote_requests so the local agent can
--      dispatch on `quote` (default), `capture_session` (open headed
--      browser, wait for human to log in, persist storage_state to disk),
--      and `inspect_form` (debug helper that dumps the carrier quote-form
--      DOM so we can update selectors when carriers change layouts).
--
--   2. carrier_sessions — one row per (rep_id, carrier_id) tracking when a
--      producer-portal session was last captured + when it's expected to
--      expire. The agent updates this; the UI reads it to show "captured 2h
--      ago" / "expired — re-capture" chips.
--
-- Idempotent — safe to re-run.

alter table if exists auto_quote_requests
  add column if not exists request_type text not null default 'quote',
  add column if not exists carrier_id   text,                          -- for capture_session / inspect_form
  add column if not exists payload      jsonb;                         -- arbitrary args for the agent (e.g. captured selectors)

create index if not exists idx_aqr_rep_type_status
  on auto_quote_requests(rep_id, request_type, status, created_at desc);

create table if not exists carrier_sessions (
  rep_id      text not null,
  carrier_id  text not null,
  agency_id   uuid references agencies(id) on delete cascade,
  captured_at timestamptz,                  -- when the rep last logged in via headed capture
  expires_at  timestamptz,                  -- estimated session expiry (carrier-dependent default 30d)
  storage_path text,                        -- ~/.koino/auto-quoter/browser-state/<carrier>/storage.json (informational)
  last_quote_at timestamptz,                -- last time the session was successfully reused for a quote
  last_failure text,                        -- last error if a quote attempt failed mid-session
  primary key (rep_id, carrier_id)
);

create index if not exists idx_carrier_sessions_agency
  on carrier_sessions(agency_id);

alter table carrier_sessions enable row level security;

create policy "rep manages own carrier_sessions"
  on carrier_sessions for all
  using (
    rep_id = current_setting('request.jwt.claims', true)::jsonb ->> 'rep_id'
    or current_setting('request.jwt.claims', true)::jsonb ->> 'role' in ('owner','admin','manager')
  );

-- Helper view for the UI: per-carrier session age + freshness flag.
create or replace view carrier_session_status as
select
  rep_id,
  carrier_id,
  captured_at,
  expires_at,
  case
    when captured_at is null                       then 'none'
    when expires_at  is not null and now() > expires_at then 'expired'
    when now() - captured_at > interval '14 days'  then 'stale'
    else 'fresh'
  end as freshness,
  last_quote_at,
  last_failure
from carrier_sessions;
