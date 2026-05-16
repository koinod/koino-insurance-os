-- 0033 Inbound SMS — extend sms_outbox so it can carry both directions.
--
-- Until now sms_outbox was outbound-only. The Twilio inbound webhook
-- (/api/twilio-sms-inbound) needs a single table to thread agency<->lead
-- conversations from, so we widen sms_outbox rather than building a
-- parallel inbound_messages table. (There is a separate inbound_messages
-- table used by the older RBA confirmation path in /api/twilio-inbound-sms;
-- that one stays as-is, scoped to RBA Y/N replies.)
--
-- Companion table public.sms_optouts is created in 0032_sms_optouts.sql
-- (parallel sprint). This migration assumes that table exists at apply time
-- and does NOT redefine it.

-- ── direction ────────────────────────────────────────────────────────────
-- 'outbound' = agency → lead (what /api/twilio-sms produces)
-- 'inbound'  = lead   → agency (what /api/twilio-sms-inbound produces)
alter table public.sms_outbox
  add column if not exists direction text not null default 'outbound';

-- Constrain to known values. Drop+recreate so re-run is idempotent.
alter table public.sms_outbox
  drop constraint if exists sms_outbox_direction_check;
alter table public.sms_outbox
  add constraint sms_outbox_direction_check
  check (direction in ('outbound','inbound'));

-- ── from_number ──────────────────────────────────────────────────────────
-- On outbound rows this is implicit (agency's Twilio number, derived from
-- env at send-time). On inbound rows it's the lead's number that Twilio
-- delivered. Nullable for backward compatibility with existing rows.
alter table public.sms_outbox
  add column if not exists from_number text;

-- ── twilio_sid ───────────────────────────────────────────────────────────
-- Twilio's MessageSid for inbound rows (so we can dedupe on Twilio retries)
-- and the outbound SID for sent rows (set by /api/twilio-sms post-send when
-- that worker grows the capability). Nullable.
alter table public.sms_outbox
  add column if not exists twilio_sid text;

-- ── Allow 'received' status ──────────────────────────────────────────────
-- Existing CHECK only permits pending|claimed|sent|failed|expired.
-- Add 'received' for inbound rows that never need to leave the system.
alter table public.sms_outbox
  drop constraint if exists sms_outbox_status_check;
alter table public.sms_outbox
  add constraint sms_outbox_status_check
  check (status in ('pending','claimed','sent','failed','expired','received'));

-- ── Indexes ──────────────────────────────────────────────────────────────
-- The rep's Messages page lists inbox-style: recent inbound rows by agency,
-- newest first. Index on (direction, status) tightens that scan.
create index if not exists idx_sms_outbox_inbox
  on public.sms_outbox (direction, status, created_at desc)
  where direction = 'inbound';

-- Thread-by-phone lookup: when a rep opens a conversation for a lead, the
-- UI pulls every row where from_number OR to_number matches the lead's
-- phone. The from_number index covers the inbound half.
create index if not exists idx_sms_outbox_from_number
  on public.sms_outbox (from_number)
  where from_number is not null;

-- Dedupe key — if Twilio retries the same MessageSid we shouldn't double-write.
-- Soft unique (allows NULL for legacy outbound rows that never had a SID).
create unique index if not exists uq_sms_outbox_twilio_sid
  on public.sms_outbox (twilio_sid)
  where twilio_sid is not null;
