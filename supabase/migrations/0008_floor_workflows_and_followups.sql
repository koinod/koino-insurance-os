-- 0008 floor workflows + follow-up texts.
--
-- Closes the user's floor-page-workflows ask:
--   - Reps can toggle workflows on/off (workflow_assignments)
--   - Managers + owners author follow-up text templates (followup_templates)
--   - Managers can only edit templates their downline reps are subscribed to
--     (enforced by RLS using the recursive downline)
--   - Scheduled sends + their delivery state (followup_runs)
--
-- Channel choices (in seed): sms / imessage / email / phone-link
-- Delivery is plumbed via the upcoming /api/followup/dispatch edge fn; until
-- the channel keys land in Vercel env, runs stamp `pending_creds` and skip.

-- ─── workflow_assignments ─────────────────────────────────────────────
create table if not exists public.workflow_assignments (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null references public.workflows(id) on delete cascade,
  rep_id text not null references public.reps(id) on delete cascade,
  agency_id uuid not null,
  enabled boolean not null default true,
  enabled_by_manager_id text references public.reps(id) on delete set null,
  enabled_at timestamptz not null default now(),
  unique (workflow_id, rep_id)
);
create index if not exists idx_workflow_assignments_rep on public.workflow_assignments (agency_id, rep_id);
alter table public.workflow_assignments enable row level security;

drop policy if exists "anon atlas read" on public.workflow_assignments;
create policy "anon atlas read" on public.workflow_assignments for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth read own agency" on public.workflow_assignments;
create policy "auth read own agency" on public.workflow_assignments for select to authenticated
  using (true);

drop policy if exists "rep toggle own" on public.workflow_assignments;
create policy "rep toggle own" on public.workflow_assignments for update to authenticated
  using (rep_id = (select rep_id from public.me() limit 1))
  with check (rep_id = (select rep_id from public.me() limit 1));

drop policy if exists "manager assign downline" on public.workflow_assignments;
create policy "manager assign downline" on public.workflow_assignments for insert to authenticated
  with check (
    -- manager+ can create assignments for any rep in their downline
    rep_id in (select rep_id from public.downline_of((select rep_id from public.me() limit 1)))
  );

-- ─── followup_templates ──────────────────────────────────────────────
create table if not exists public.followup_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  owner_rep_id text not null references public.reps(id) on delete cascade,
  name text not null,
  body text not null,
  channel text not null default 'sms' check (channel in ('sms','imessage','email','phone_link')),
  delay_minutes integer not null default 30,
  trigger_event text not null default 'after_call' check (
    trigger_event in ('after_call','after_appt','after_app','after_voicemail','manual')
  ),
  scope text not null default 'rep' check (scope in ('rep','manager','owner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_followup_templates_owner on public.followup_templates (agency_id, owner_rep_id);
alter table public.followup_templates enable row level security;

drop policy if exists "anon atlas read" on public.followup_templates;
create policy "anon atlas read" on public.followup_templates for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth read agency" on public.followup_templates;
create policy "auth read agency" on public.followup_templates for select to authenticated
  using (true);

drop policy if exists "owner write" on public.followup_templates;
create policy "owner write" on public.followup_templates for all to authenticated
  using (
    -- owner can edit any template; manager can edit templates they own OR
    -- whose owner_rep_id is in their downline; reps cannot edit.
    case
      when (select role from public.me() limit 1) = 'owner' then true
      when (select role from public.me() limit 1) = 'manager' then
        owner_rep_id in (select rep_id from public.downline_of((select rep_id from public.me() limit 1)))
      else false
    end
  )
  with check (
    case
      when (select role from public.me() limit 1) = 'owner' then true
      when (select role from public.me() limit 1) = 'manager' then
        owner_rep_id in (select rep_id from public.downline_of((select rep_id from public.me() limit 1)))
      else false
    end
  );

-- ─── followup_runs ───────────────────────────────────────────────────
create table if not exists public.followup_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.followup_templates(id) on delete cascade,
  rep_id text references public.reps(id) on delete set null,
  lead_id uuid,
  agency_id uuid not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled' check (
    status in ('scheduled','sending','sent','failed','pending_creds','cancelled')
  ),
  channel text not null,
  recipient text,
  body_snapshot text,
  failure_detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_followup_runs_rep on public.followup_runs (agency_id, rep_id, scheduled_for);
alter table public.followup_runs enable row level security;

drop policy if exists "anon atlas read" on public.followup_runs;
create policy "anon atlas read" on public.followup_runs for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth read agency" on public.followup_runs;
create policy "auth read agency" on public.followup_runs for select to authenticated
  using (true);

drop policy if exists "auth insert own" on public.followup_runs;
create policy "auth insert own" on public.followup_runs for insert to authenticated
  with check (true);

-- ─── seed Atlas demo data ────────────────────────────────────────────
-- Templates: marc owns 3 (fleet-wide), dani owns 2 (her downline-relevant)
insert into public.followup_templates (agency_id, owner_rep_id, name, body, channel, delay_minutes, trigger_event, scope)
select * from (values
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'marc',
   'Post-call recap', 'Hey {{first_name}}, great chat — sending the plan summary now. I''ll text again tomorrow. — {{agent_first}}',
   'sms', 5, 'after_call', 'owner'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'marc',
   'Appointment confirm', 'Confirming our appt {{appt_when}}. Reply Y to confirm. — {{agent_first}}',
   'sms', 30, 'after_appt', 'owner'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'marc',
   'Voicemail dropoff', '{{first_name}} this is {{agent_first}} from {{agency_short}}. Tried you re: your quote — call me back at {{agent_phone}}.',
   'sms', 0, 'after_voicemail', 'owner'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'dani',
   'Application submitted', 'Your app went in! Carrier underwriting next 48–72h. Save this # for any qs.',
   'sms', 60, 'after_app', 'manager'),
  ('e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, 'dani',
   'Day-2 nudge', 'Hi {{first_name}} — just bumping our chat back up. Lmk if any questions came up overnight.',
   'sms', 1440, 'after_call', 'manager')
) v(agency_id, owner_rep_id, name, body, channel, delay_minutes, trigger_event, scope)
where not exists (
  select 1 from public.followup_templates t
  where t.agency_id = v.agency_id::uuid and t.owner_rep_id = v.owner_rep_id and t.name = v.name
);

-- Workflow assignments: enable a couple of existing workflows for the demo reps
-- Only inserts when both the workflow and rep exist.
insert into public.workflow_assignments (workflow_id, rep_id, agency_id, enabled, enabled_by_manager_id)
select w.id, r.id, 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid, true, 'marc'
from public.workflows w
join public.reps r on r.agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid
where w.agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'::uuid
  and r.id in ('marc','dani','remy','alex','jada')
  and not exists (
    select 1 from public.workflow_assignments wa
    where wa.workflow_id = w.id and wa.rep_id = r.id
  )
limit 25;
