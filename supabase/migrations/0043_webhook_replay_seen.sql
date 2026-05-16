-- 0037_webhook_replay_seen.sql
--
-- Replay protection for /api/leads/vendor-webhook (Task 12). Each row records
-- a (slug, request_id) pair that we've already accepted. The endpoint inserts
-- on every request that carries x-webhook-id (or x-request-id); a unique
-- constraint makes the second insert a no-op, signalling "duplicate retry".
--
-- The endpoint also enforces a 5-minute timestamp window via x-webhook-timestamp
-- (in code, no DB needed). This table only handles the request-id dimension.
--
-- Retention: not journal-of-record, so a future cleanup job can drop rows older
-- than ~7 days. Leaving that to a follow-on migration to avoid pg_cron coupling.

set local search_path = public;

create table if not exists public.webhook_replay_seen (
  slug        text        not null,
  request_id  text        not null,
  seen_at     timestamptz not null default now(),
  primary key (slug, request_id)
);

create index if not exists idx_webhook_replay_seen_at on public.webhook_replay_seen (seen_at);

alter table public.webhook_replay_seen enable row level security;

-- Service role bypasses RLS — only the vendor-webhook endpoint writes here, and
-- it uses the service-role key. Authenticated users have no business reading
-- this audit log directly.
revoke all on public.webhook_replay_seen from anon, authenticated;
