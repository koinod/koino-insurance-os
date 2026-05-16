-- 0032 — Lead Drip Phase 2: STOP-list table + sms_outbox status widening.
--
-- Adds the suppression list that the new /api/cron/sms-flush gate consults
-- before every outbound SMS. Twilio's inbound-SMS webhook writes here when
-- it sees a "STOP" / "UNSUBSCRIBE" / "QUIT" reply.
--
-- Why anon CAN insert: the Twilio inbound webhook runs without a Supabase
-- session (it's an unauthenticated POST originating from Twilio's edge).
-- It still has to be able to record opt-outs. Read access stays scoped to
-- authenticated agency members.
--
-- Also widens sms_outbox.status to accept the new gate / lifecycle values:
--   'dry_run'              (Phase 1, queued while send_enabled=false)
--   'skipped_no_consent'   (no pipeline.consent on the related lead)
--   'skipped_opted_out'    (recipient on sms_optouts)
--   'skipped_quiet_hours'  (outside 9am–8pm local; retries next run)
-- The original constraint only accepted pending/claimed/sent/failed/expired.

set local search_path = public;

-- ── 1. sms_optouts ──────────────────────────────────────────────────────
create table if not exists public.sms_optouts (
  phone         text primary key,
  agency_id     uuid,
  reason        text,
  opted_out_at  timestamptz not null default now()
);

create index if not exists sms_optouts_agency_phone_idx
  on public.sms_optouts (agency_id, phone);

alter table public.sms_optouts enable row level security;

-- Anon insert: Twilio inbound webhook posts here with no auth context.
-- We accept any insert; a legitimate opt-out is just a phone string.
-- The webhook itself authenticates Twilio's signature upstream; this
-- table is intentionally permissive on writes (worst case: spurious row,
-- never a missed STOP).
drop policy if exists "sms_optouts_anon_insert" on public.sms_optouts;
create policy "sms_optouts_anon_insert" on public.sms_optouts
  for insert to anon
  with check (true);

-- Authenticated insert: agency members can manually add (UI button).
drop policy if exists "sms_optouts_auth_insert" on public.sms_optouts;
create policy "sms_optouts_auth_insert" on public.sms_optouts
  for insert to authenticated
  with check (true);

-- Read: authenticated members can see their own agency's opt-outs
-- (and rows with agency_id IS NULL — those are global opt-outs from inbound
-- replies where we couldn't yet attribute the agency).
drop policy if exists "sms_optouts_read_member" on public.sms_optouts;
create policy "sms_optouts_read_member" on public.sms_optouts
  for select to authenticated
  using (
    agency_id is null
    or exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and (am.role = 'super_admin' or am.agency_id = sms_optouts.agency_id)
    )
  );

comment on table public.sms_optouts is
  'TCPA STOP-list. Populated by Twilio inbound webhook on STOP/UNSUBSCRIBE/QUIT keywords; consulted by /api/cron/sms-flush before every send.';

-- ── 2. Widen sms_outbox.status ──────────────────────────────────────────
-- Drop the original CHECK and replace with the Phase 2 set.
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'sms_outbox_status_check'
  ) then
    alter table public.sms_outbox drop constraint sms_outbox_status_check;
  end if;
end $$;

-- Re-add as a permissive check. Anything not in this list is a bug.
alter table public.sms_outbox
  add constraint sms_outbox_status_check
  check (status in (
    'pending',
    'claimed',
    'sent',
    'failed',
    'expired',
    'dry_run',
    'skipped_no_consent',
    'skipped_opted_out',
    'skipped_quiet_hours'
  ));

-- ── 3. sms_outbox.twilio_sid ────────────────────────────────────────────
-- Twilio Message SID (MS… or SM…). Stored so we can correlate with delivery
-- status callbacks and Twilio's own dashboards.
alter table public.sms_outbox
  add column if not exists twilio_sid text;

create index if not exists sms_outbox_twilio_sid_idx
  on public.sms_outbox (twilio_sid)
  where twilio_sid is not null;

comment on column public.sms_outbox.twilio_sid is
  'Twilio Message SID returned by POST /Messages.json. Set by /api/cron/sms-flush on successful send.';
