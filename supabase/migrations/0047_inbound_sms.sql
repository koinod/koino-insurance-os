-- 0047_inbound_sms.sql
--
-- ⚠️  Applied in production as a CONSOLIDATED migration that merged this
--     file's content with 0048_sms_optouts.sql. The two source files had
--     conflicting `sms_outbox_status_check` definitions; the applied version
--     takes the UNION (see migration tracker entry `0047_sms_outbox_phase2_unified`).
--
-- This file is the canonical record of what was applied. 0048_sms_optouts.sql
-- has been removed from the tree — its content lives here.

set local search_path = public;

-- ── sms_optouts (was 0048) ──────────────────────────────────────────────
create table if not exists public.sms_optouts (
  phone         text primary key,
  agency_id     uuid,
  reason        text,
  opted_out_at  timestamptz not null default now()
);
create index if not exists sms_optouts_agency_phone_idx
  on public.sms_optouts (agency_id, phone);
alter table public.sms_optouts enable row level security;

drop policy if exists "sms_optouts_anon_insert" on public.sms_optouts;
create policy "sms_optouts_anon_insert" on public.sms_optouts
  for insert to anon with check (true);

drop policy if exists "sms_optouts_auth_insert" on public.sms_optouts;
create policy "sms_optouts_auth_insert" on public.sms_optouts
  for insert to authenticated with check (true);

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
  'TCPA STOP-list. Populated by Twilio inbound webhook on STOP/UNSUBSCRIBE/QUIT; consulted by /api/cron/sms-flush before every send.';

-- ── sms_outbox widening (this file's original payload) ─────────────────
alter table public.sms_outbox add column if not exists direction text not null default 'outbound';
alter table public.sms_outbox drop constraint if exists sms_outbox_direction_check;
alter table public.sms_outbox add constraint sms_outbox_direction_check
  check (direction in ('outbound','inbound'));

alter table public.sms_outbox add column if not exists from_number text;
alter table public.sms_outbox add column if not exists twilio_sid text;

-- UNION of 0047's 'received' and 0048's lifecycle states.
alter table public.sms_outbox drop constraint if exists sms_outbox_status_check;
alter table public.sms_outbox add constraint sms_outbox_status_check
  check (status in (
    'pending','claimed','sent','failed','expired','received',
    'dry_run','skipped_no_consent','skipped_opted_out','skipped_quiet_hours'
  ));

create index if not exists idx_sms_outbox_inbox
  on public.sms_outbox (direction, status, created_at desc)
  where direction = 'inbound';

create index if not exists idx_sms_outbox_from_number
  on public.sms_outbox (from_number)
  where from_number is not null;

create unique index if not exists uq_sms_outbox_twilio_sid
  on public.sms_outbox (twilio_sid)
  where twilio_sid is not null;

comment on column public.sms_outbox.twilio_sid is
  'Twilio Message SID returned by POST /Messages.json (outbound) or received via inbound webhook.';
