-- 0068_power_dialer.sql
--
-- Foundation for the parallel/power dialer (up to 10 simultaneous outbound
-- legs, AI handler on losing legs, AI voicemail drop, recording, SMS+email
-- touchpoints, number pool with spam rotation, FTC abandonment compliance).
--
-- Tables added:
--   1. dial_sessions       — one row per rep's active power-dialer session.
--                            Holds the toggles, lead queue, live counters,
--                            and the LiveKit room the rep is joined to.
--   2. call_attempts       — one row per outbound leg fired (winner + losers).
--                            FK'd to a session. Carries AMD + disposition +
--                            transfer + AI-handler outcome.
--   3. phone_numbers       — number pool with health/spam tracking. Cron will
--                            mark `flagged` and auto-purchase replacements.
--   4. compliance_events   — append-only log for FTC 3% abandonment audit,
--                            DNC blocks, window-of-day blocks, recording-
--                            disclosure played.
--   5. claim_session_winner(session_id, attempt_id) RPC — atomic
--      first-human-wins lock; returns true if caller claimed, false if a
--      sibling attempt already claimed it.
--   6. dialer_abandonment_30d VIEW — rolling FTC compliance signal; sessions
--      hard-stop when their agency exceeds 2.5%.
--
-- RLS: rep sees own; manager/owner see agency; service role writes.
--
-- The session worker (agent/runtime/services/power-dialer-worker/) reads +
-- writes via service role. The browser UI reads via RLS.

set local search_path = public;

-- ---------------------------------------------------------------------------
-- 1) dial_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.dial_sessions (
  id                          uuid primary key default gen_random_uuid(),
  agency_id                   uuid not null references public.agencies(id) on delete cascade,
  rep_id                      text not null references public.reps(id) on delete cascade,
  livekit_room                text not null,                 -- rep's audio room
  worker_url                  text,                          -- which worker host owns this session
  started_at                  timestamptz not null default now(),
  ended_at                    timestamptz,
  max_lines                   int  not null default 3 check (max_lines between 1 and 10),
  lines_active                int  not null default 0,
  toggles                     jsonb not null default jsonb_build_object(
                                'record',       true,
                                'sms_pre',      false,
                                'sms_post',     true,
                                'email',        false,
                                'ai_voicemail', true,
                                'ai_assistant', true,
                                'whisper',      true,
                                'sms_lane',     'sendblue_then_twilio' -- or 'twilio_only'
                              ),
  lead_queue                  jsonb not null default '[]'::jsonb,  -- [{lead_id, phone, state}]
  queue_position              int  not null default 0,
  stats                       jsonb not null default jsonb_build_object(
                                'dials',           0,
                                'connects',        0,
                                'voicemails',      0,
                                'abandons_to_ai',  0,
                                'no_answer',       0,
                                'busy',            0,
                                'failed',          0
                              ),
  status                      text not null default 'active'
                                check (status in ('active','paused','ended','aborted_compliance')),
  current_bridged_attempt_id  uuid,                          -- set when a leg wins the race
  current_bridged_set_at      timestamptz
);

create index if not exists dial_sessions_agency_started_idx
  on public.dial_sessions (agency_id, started_at desc);
create index if not exists dial_sessions_rep_active_idx
  on public.dial_sessions (rep_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- 2) call_attempts
-- ---------------------------------------------------------------------------
create table if not exists public.call_attempts (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.dial_sessions(id) on delete cascade,
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  rep_id              text not null references public.reps(id) on delete cascade,
  lead_id             uuid references public.pipeline(id) on delete set null,
  batch_seq           int  not null default 0,               -- which fan-out batch within the session
  from_number         text not null,                          -- pool number used
  to_number           text not null,
  twilio_call_sid     text unique,
  livekit_room        text,                                   -- per-leg room (may differ from session room)
  fired_at            timestamptz not null default now(),
  answered_at         timestamptz,
  amd_result          text check (amd_result in ('human','machine_start','machine_end_beep','fax','unknown')),
  amd_detected_at     timestamptz,
  disposition         text check (disposition in (
                          'connected',          -- bridged to rep, human conversation
                          'voicemail_dropped',  -- AI voicemail played after beep
                          'abandoned_to_ai',    -- human answered, lost race, AI took over
                          'no_answer',
                          'busy',
                          'dnc_blocked',        -- pre-flight rejected (would not have dialed)
                          'window_blocked',     -- outside calling hours for lead state
                          'spam_blocked',       -- our own number was flagged
                          'failed',
                          'cancelled'           -- session paused / ended mid-dial
                        )),
  ended_at            timestamptz,
  duration_sec        int,
  bridged_to_rep_at   timestamptz,
  ai_summary          text,
  ai_outcome          text check (ai_outcome in (
                          'scheduled','callback_requested','not_interested',
                          'wrong_number','dnc_request','left_message','hangup'
                        )),
  recording_url       text,
  transcript_url      text,
  created_at          timestamptz not null default now()
);

create index if not exists call_attempts_session_idx
  on public.call_attempts (session_id, fired_at desc);
create index if not exists call_attempts_agency_disposition_idx
  on public.call_attempts (agency_id, disposition, fired_at desc);
create index if not exists call_attempts_lead_idx
  on public.call_attempts (lead_id, fired_at desc) where lead_id is not null;
create index if not exists call_attempts_sid_idx
  on public.call_attempts (twilio_call_sid) where twilio_call_sid is not null;

-- ---------------------------------------------------------------------------
-- 3) phone_numbers (pool with health tracking)
-- ---------------------------------------------------------------------------
create table if not exists public.phone_numbers (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  twilio_sid          text unique,                            -- PN-prefixed Twilio SID
  e164                text not null unique,
  area_code           text,                                    -- denormalized for local-match selection
  type                text not null default 'local' check (type in ('local','toll_free')),
  status              text not null default 'warming'
                        check (status in ('warming','active','flagged','retired')),
  acquired_at         timestamptz not null default now(),
  released_at         timestamptz,
  flagged_at          timestamptz,
  flagged_reason      text,
  attempts_24h        int not null default 0,
  connects_24h        int not null default 0,
  abandons_24h        int not null default 0,
  last_health_check   timestamptz,
  assigned_rep_id     text references public.reps(id) on delete set null
);

create index if not exists phone_numbers_agency_status_idx
  on public.phone_numbers (agency_id, status, area_code);
create index if not exists phone_numbers_rep_idx
  on public.phone_numbers (assigned_rep_id) where assigned_rep_id is not null;

-- ---------------------------------------------------------------------------
-- 4) compliance_events (FTC abandonment + DNC + window audit log)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_events (
  id              bigserial primary key,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  session_id      uuid references public.dial_sessions(id) on delete set null,
  call_attempt_id uuid references public.call_attempts(id) on delete set null,
  event_type      text not null check (event_type in (
                      'abandoned',                  -- human answered, no rep, no AI either
                      'ai_handled_diversion',       -- loser leg routed to AI (NOT an abandonment under FTC)
                      'dnc_block',
                      'window_block',
                      'spam_block',
                      'consent_required',
                      'recording_disclosure_played'
                    )),
  to_number       text,
  state           text,                              -- US state code, for state-DNC analysis
  occurred_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists compliance_events_agency_recent_idx
  on public.compliance_events (agency_id, occurred_at desc);
create index if not exists compliance_events_type_idx
  on public.compliance_events (event_type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 5) Atomic race-lock RPC for first-human-wins
-- ---------------------------------------------------------------------------
create or replace function public.claim_session_winner(
  p_session_id uuid,
  p_attempt_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  -- Atomic: only the first caller succeeds; subsequent callers get false.
  update public.dial_sessions
     set current_bridged_attempt_id = p_attempt_id,
         current_bridged_set_at     = now(),
         stats = jsonb_set(stats, '{connects}', to_jsonb(coalesce((stats->>'connects')::int,0) + 1))
   where id = p_session_id
     and current_bridged_attempt_id is null
     and status = 'active';

  if found then
    update public.call_attempts
       set bridged_to_rep_at = now(),
           disposition       = 'connected'
     where id = p_attempt_id
       and disposition is null;
    v_claimed := true;
  end if;

  return v_claimed;
end;
$$;

revoke all on function public.claim_session_winner(uuid,uuid) from public, anon;
grant execute on function public.claim_session_winner(uuid,uuid) to service_role;

-- Release the bridge (rep ends call; session can dial next batch).
create or replace function public.release_session_winner(
  p_session_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dial_sessions
     set current_bridged_attempt_id = null,
         current_bridged_set_at     = null
   where id = p_session_id;
end;
$$;

revoke all on function public.release_session_winner(uuid) from public, anon;
grant execute on function public.release_session_winner(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6) FTC abandonment rolling-30d view
--    abandonment_rate = abandons / (abandons + human_connects).
--    AI-handled diversions are NOT counted as abandonments per our model
--    (the human got a live response, just from an AI agent identified as such).
--    Worker reads this; hard-stops session.status='aborted_compliance' at 2.5%.
-- ---------------------------------------------------------------------------
create or replace view public.dialer_abandonment_30d
with (security_invoker = true)
as
select
  ca.agency_id,
  count(*) filter (where ca.disposition = 'connected')                                   as human_connects,
  count(*) filter (where ca.disposition = 'abandoned_to_ai')                             as ai_diversions,
  count(*) filter (where ca.disposition = 'voicemail_dropped')                           as voicemails,
  count(ce.id) filter (where ce.event_type = 'abandoned')                                as abandons,
  case
    when count(*) filter (where ca.disposition = 'connected') +
         count(ce.id) filter (where ce.event_type = 'abandoned') > 0
    then count(ce.id) filter (where ce.event_type = 'abandoned')::numeric
       / (count(*) filter (where ca.disposition = 'connected') +
          count(ce.id) filter (where ce.event_type = 'abandoned'))
    else 0
  end as abandonment_rate
from public.call_attempts ca
left join public.compliance_events ce
  on ce.agency_id = ca.agency_id
 and ce.occurred_at >= now() - interval '30 days'
where ca.fired_at >= now() - interval '30 days'
group by ca.agency_id;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.dial_sessions     enable row level security;
alter table public.call_attempts     enable row level security;
alter table public.phone_numbers     enable row level security;
alter table public.compliance_events enable row level security;

-- dial_sessions: agency members read; service writes
drop policy if exists "dial_sessions_select" on public.dial_sessions;
create policy "dial_sessions_select" on public.dial_sessions
  for select to authenticated
  using (public.is_super_admin() or agency_id in (select public.viewer_agency_ids()));

drop policy if exists "dial_sessions_service_write" on public.dial_sessions;
create policy "dial_sessions_service_write" on public.dial_sessions
  for all to service_role using (true) with check (true);

-- call_attempts: same
drop policy if exists "call_attempts_select" on public.call_attempts;
create policy "call_attempts_select" on public.call_attempts
  for select to authenticated
  using (public.is_super_admin() or agency_id in (select public.viewer_agency_ids()));

drop policy if exists "call_attempts_service_write" on public.call_attempts;
create policy "call_attempts_service_write" on public.call_attempts
  for all to service_role using (true) with check (true);

-- phone_numbers: agency reads; service writes
drop policy if exists "phone_numbers_select" on public.phone_numbers;
create policy "phone_numbers_select" on public.phone_numbers
  for select to authenticated
  using (public.is_super_admin() or agency_id in (select public.viewer_agency_ids()));

drop policy if exists "phone_numbers_service_write" on public.phone_numbers;
create policy "phone_numbers_service_write" on public.phone_numbers
  for all to service_role using (true) with check (true);

-- compliance_events: agency reads (managers will need this for audit); service writes
drop policy if exists "compliance_events_select" on public.compliance_events;
create policy "compliance_events_select" on public.compliance_events
  for select to authenticated
  using (public.is_super_admin() or agency_id in (select public.viewer_agency_ids()));

drop policy if exists "compliance_events_service_write" on public.compliance_events;
create policy "compliance_events_service_write" on public.compliance_events
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime publication — UI subscribes to live session/attempt updates
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dial_sessions;
    alter publication supabase_realtime add table public.call_attempts;
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Verify block — fail loudly if any object didn't land.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text := '';
begin
  if to_regclass('public.dial_sessions')     is null then v_missing := v_missing || 'dial_sessions '; end if;
  if to_regclass('public.call_attempts')     is null then v_missing := v_missing || 'call_attempts '; end if;
  if to_regclass('public.phone_numbers')     is null then v_missing := v_missing || 'phone_numbers '; end if;
  if to_regclass('public.compliance_events') is null then v_missing := v_missing || 'compliance_events '; end if;
  if to_regclass('public.dialer_abandonment_30d') is null then v_missing := v_missing || 'dialer_abandonment_30d '; end if;
  if to_regprocedure('public.claim_session_winner(uuid,uuid)')   is null then v_missing := v_missing || 'claim_session_winner '; end if;
  if to_regprocedure('public.release_session_winner(uuid)')      is null then v_missing := v_missing || 'release_session_winner '; end if;
  if v_missing <> '' then
    raise exception 'migration 0068 incomplete; missing: %', v_missing;
  end if;
end $$;
