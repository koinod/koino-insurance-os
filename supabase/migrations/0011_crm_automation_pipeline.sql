-- 0011 CRM lead automation pipeline.
--
-- Connects the CRM (leads in pipeline) to multi-channel sends. The dispatcher
-- (api/automation/dispatch) walks active rules, matches the lead context,
-- picks the highest-preferred channel with creds available, and stamps a
-- run row. Channels: sms (Twilio), imessage (SendBlue), email (Mailgun),
-- phone_link (local macOS handoff).

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  owner_rep_id text references public.reps(id) on delete set null,
  name text not null,
  trigger_event text not null check (
    trigger_event in ('lead_created','lead_status_change','no_contact_24h','no_contact_72h',
                      'after_call_no_answer','after_appt_no_show','tag_added','manual')
  ),
  trigger_filter jsonb,
  channels text[] not null default '{}',
  template_id uuid references public.followup_templates(id) on delete set null,
  active boolean not null default true,
  scope text not null default 'rep' check (scope in ('rep','manager','owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.automation_rules enable row level security;
create policy "anon atlas read" on public.automation_rules for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');
create policy "auth read agency" on public.automation_rules for select to authenticated using (true);
create policy "owner manager write" on public.automation_rules for all to authenticated
  using (
    case
      when (select role from public.me() limit 1) = 'owner' then true
      when (select role from public.me() limit 1) = 'manager' then
        owner_rep_id in (select rep_id from public.downline_of((select rep_id from public.me() limit 1)))
      else false
    end
  ) with check (true);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.automation_rules(id) on delete cascade,
  agency_id uuid not null,
  rep_id text references public.reps(id) on delete set null,
  lead_id uuid,
  channel text not null,
  recipient text,
  body_snapshot text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'scheduled' check (
    status in ('scheduled','sending','sent','failed','pending_creds','cancelled')
  ),
  failure_detail text,
  created_at timestamptz not null default now()
);
alter table public.automation_runs enable row level security;
create policy "anon atlas read" on public.automation_runs for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');
create policy "auth read agency" on public.automation_runs for select to authenticated using (true);
create policy "auth insert" on public.automation_runs for insert to authenticated with check (true);

-- Atlas demo seeds: 3 rules across owner + manager scope so the page renders
-- something on first load. (See migration history for the exact seed body.)
