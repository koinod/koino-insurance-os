-- ─────────────────────────────────────────────────────────────────────────
-- 0031 Meeting notes ingest + post-call automation rules
-- ─────────────────────────────────────────────────────────────────────────
--
-- meeting_notes — universal external-meeting log. Fathom webhook is the
--   first writer; future Otter/Granola/Krisp adapters slot in by writing
--   their own (provider, event_id) rows.
--
-- automation_rules — per-agency-or-rep "when X happens, post Y command".
--   Currently triggered manually by webhook handlers (Twilio status,
--   Fathom webhook, Stripe payment_intent.succeeded). RPC fans out to
--   matching devices' command queues.
--
-- agent_settings — per-rep agent prefs surfaced in Settings → Agents.
--   Holds e.g. always_record_calls (default true), bluetooth_phone_id,
--   confirm_channel_overrides.

set local search_path = public;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ meeting_notes                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create table if not exists public.meeting_notes (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('fathom','otter','granola','krisp','manual','other')),
  event_id        text not null,
  lead_id         uuid references public.pipeline(id) on delete set null,
  agency_id       uuid references public.agencies(id) on delete cascade,
  owner_rep_id    text,
  title           text,
  summary         text,
  notes_md        text,
  recording_url   text,
  started_at      timestamptz,
  payload         jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (provider, event_id)
);
create index if not exists meeting_notes_lead_idx   on public.meeting_notes (lead_id, created_at desc);
create index if not exists meeting_notes_agency_idx on public.meeting_notes (agency_id, created_at desc);

alter table public.meeting_notes enable row level security;
drop policy if exists "meeting_notes_visible" on public.meeting_notes;
create policy "meeting_notes_visible" on public.meeting_notes for select to authenticated using (
  public.is_super_admin()
  OR agency_id = ANY (public.viewer_agency_ids())
);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ automation_rules — when [trigger] happens, post [command] to agent   ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create table if not exists public.automation_rules (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  scope         text not null check (scope in ('agency','rep')),
  rep_id        text,                                       -- when scope='rep'
  enabled       boolean not null default true,
  trigger       text not null check (trigger in (
    'call_completed','call_missed','meeting_completed',
    'lead_created','lead_stage_changed','appointment_booked',
    'appointment_reminder_24h','appointment_reminder_1h',
    'payment_succeeded','payment_failed','policy_issued','nigo_received'
  )),
  filter        jsonb default '{}'::jsonb,                  -- e.g. {min_duration_sec: 60}
  command_kind  text not null,                              -- e.g. 'post_call_followup', 'draft_sms'
  command_payload jsonb default '{}'::jsonb,                -- merged with trigger context
  delay_seconds int default 0,                              -- queue with future expires_at
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists automation_rules_lookup_idx
  on public.automation_rules (agency_id, trigger, enabled);

alter table public.automation_rules enable row level security;
drop policy if exists "automation_rules_visible" on public.automation_rules;
create policy "automation_rules_visible" on public.automation_rules for select to authenticated using (
  public.is_super_admin() OR agency_id = ANY (public.viewer_agency_ids())
);
drop policy if exists "automation_rules_owner_write" on public.automation_rules;
create policy "automation_rules_owner_write" on public.automation_rules for all to authenticated
  using (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = automation_rules.agency_id
         and role in ('owner','admin') and active = true
    )
  )
  with check (
    public.is_super_admin()
    OR exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = automation_rules.agency_id
         and role in ('owner','admin') and active = true
    )
  );

-- Fan-out helper: for an (agency, trigger) and trigger-context jsonb, find
-- matching enabled rules and post one rba_command per active device of the
-- target rep. Service role only.
create or replace function public.automation_fire(
  p_agency_id uuid,
  p_trigger   text,
  p_rep_id    text,
  p_context   jsonb default '{}'::jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  d record;
  posted int := 0;
  tgt_user uuid;
begin
  for r in
    select * from public.automation_rules
     where agency_id = p_agency_id
       and trigger = p_trigger
       and enabled
       and (scope = 'agency' or rep_id = p_rep_id)
  loop
    -- Resolve rep_id → user_id via agency_members.rep_id (the join). If the
    -- rep doesn't have a linked user, skip.
    select user_id into tgt_user from public.agency_members
     where agency_id = p_agency_id and rep_id = coalesce(r.rep_id, p_rep_id) and active = true
     limit 1;
    if tgt_user is null then continue; end if;

    for d in
      select device_id from public.rba_installs
       where user_id = tgt_user and status = 'active'
    loop
      insert into public.rba_commands (device_id, agency_id, kind, payload, expires_at)
      values (
        d.device_id, p_agency_id, r.command_kind,
        coalesce(r.command_payload, '{}'::jsonb) || coalesce(p_context, '{}'::jsonb),
        now() + interval '15 minutes' + (coalesce(r.delay_seconds, 0) || ' seconds')::interval
      );
      posted := posted + 1;
    end loop;
  end loop;
  return posted;
end;
$$;
grant execute on function public.automation_fire(uuid, text, text, jsonb) to service_role;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ agent_settings — per-rep agent preferences                           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

create table if not exists public.agent_settings (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  agency_id                uuid not null references public.agencies(id) on delete cascade,
  always_record_on_pickup  boolean not null default true,
  bluetooth_phone_id       text,
  state_match_outbound     boolean not null default true,
  default_dial_provider    text default 'twilio'
                           check (default_dial_provider in ('twilio','sendblue','bluetooth_phone')),
  preferred_model          text,                                  -- 'fast' | 'smart'
  confirm_channel_default  text default 'any'
                           check (confirm_channel_default in ('web_modal','os_push','sms','any')),
  high_risk_channel        text default 'sms'
                           check (high_risk_channel in ('web_modal','os_push','sms','any')),
  config                   jsonb default '{}'::jsonb,
  updated_at               timestamptz not null default now()
);
alter table public.agent_settings enable row level security;
drop policy if exists "agent_settings_self" on public.agent_settings;
create policy "agent_settings_self" on public.agent_settings for all to authenticated
  using (user_id = auth.uid() OR public.is_super_admin())
  with check (user_id = auth.uid() OR public.is_super_admin());

-- Realtime publication.
do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin alter publication supabase_realtime add table public.meeting_notes;     exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.automation_rules;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.agent_settings;    exception when duplicate_object then null; end;
  end if;
end $$;
