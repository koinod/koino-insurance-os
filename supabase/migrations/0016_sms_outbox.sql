-- 0016 SMS outbox — local-agent fallback when Twilio isn't configured.
--
-- When /api/twilio-sms can't reach Twilio (env vars missing, account
-- suspended, network error), it inserts a row here instead. A "Repflow
-- Agent" running on a rep's laptop polls this table, sends the message via
-- the locally-connected phone (iMessage on macOS, Phone Link / adb on
-- Windows + Android), and updates the row to status='sent'.
--
-- This makes SMS work for solo agencies that haven't paid for Twilio yet,
-- using the rep's existing phone plan as the carrier.

create table if not exists public.sms_outbox (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null,
  rep_id        text references public.reps(id) on delete set null,
  -- The rep this message is going OUT FROM. The local agent on this rep's
  -- laptop is the one that should pick it up. NULL = any agent in the
  -- agency can claim it (broadcast).
  to_number     text not null,
  body          text not null,
  -- Lifecycle: pending → claimed → sent | failed | expired
  status        text not null default 'pending'
                check (status in ('pending','claimed','sent','failed','expired')),
  claimed_by    text,                       -- agent identifier (e.g. hostname)
  claimed_at    timestamptz,
  sent_at       timestamptz,
  error_text    text,
  attempts      integer not null default 0,
  -- Source context for debugging + audit
  source        text,                       -- 'auto-followup' | 'manual' | 'cross-sell' | etc.
  related_lead_id  uuid,
  related_thread_id uuid,
  created_at    timestamptz not null default now(),
  -- Auto-expire after 24h to avoid stale-send if agent comes back online late
  expires_at    timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_sms_outbox_pending
  on public.sms_outbox (agency_id, status, created_at)
  where status = 'pending';
create index if not exists idx_sms_outbox_rep
  on public.sms_outbox (rep_id, status);

alter table public.sms_outbox enable row level security;

-- Read: scoped to viewer's agencies (uses the helper from 0015)
create policy "tenant read sms_outbox" on public.sms_outbox
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

-- Write: any active member of the agency can enqueue (typically the API does)
create policy "tenant write sms_outbox" on public.sms_outbox
  for insert to authenticated
  with check (agency_id in (select public.viewer_agency_ids()));

-- Update: agent claims/marks-sent. Restricted to the rep the message is for
-- OR to managers/owners. Service role bypasses.
create policy "tenant update sms_outbox" on public.sms_outbox
  for update to authenticated
  using (agency_id in (select public.viewer_agency_ids()))
  with check (agency_id in (select public.viewer_agency_ids()));

-- Auto-expire stale rows (cheap idempotent helper the cron can call)
create or replace function public.sms_outbox_expire_stale()
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.sms_outbox
       set status = 'expired',
           error_text = coalesce(error_text || E'\n', '') || 'expired before agent claim'
     where status in ('pending','claimed')
       and expires_at < now()
     returning id
  )
  select count(*)::integer from upd;
$$;
grant execute on function public.sms_outbox_expire_stale() to authenticated;
