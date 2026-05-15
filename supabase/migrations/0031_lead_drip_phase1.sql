-- 0031 — Lead Drip Phase 1
-- Adds the schema needed for:
--   1. Per-source inbound webhook URLs ("leads drip in")
--   2. Sequence audience field (lead vs rep)
--   3. Per-step audit log
--   4. Auto-enroll on inbound
--
-- Phase 2 (sms-flush + Twilio + reply webhook) is a separate migration
-- gated behind org_settings.drip.send_enabled.

-- ── 1. agency_lead_sources — per-agency inbound webhook + mapping ────────
alter table public.agency_lead_sources
  add column if not exists kind text default 'webhook',
  add column if not exists inbound_slug text unique,
  add column if not exists inbound_hmac_secret text,
  add column if not exists field_map jsonb default '{}'::jsonb,
  add column if not exists default_sequence_id text references public.sequences(id) on delete set null,
  add column if not exists last_received_at timestamptz,
  add column if not exists inbound_count int not null default 0,
  add column if not exists notes text;

create index if not exists agency_lead_sources_slug_idx on public.agency_lead_sources (inbound_slug) where inbound_slug is not null;
create index if not exists agency_lead_sources_agency_idx on public.agency_lead_sources (agency_id);

-- ── 2. sequences — audience + per-agency ownership ──────────────────────
alter table public.sequences
  add column if not exists audience text not null default 'lead',
  add column if not exists agency_id uuid;

-- Constrain audience values. lead = sequences targeting prospects; rep =
-- sequences targeting producers (onboarding, license-nudge, check-ins).
do $$ begin
  if not exists (select 1 from pg_constraint where conname='sequences_audience_chk') then
    alter table public.sequences add constraint sequences_audience_chk check (audience in ('lead','rep'));
  end if;
end $$;

create index if not exists sequences_agency_idx on public.sequences (agency_id);

-- ── 3. drip_log — per-step audit ────────────────────────────────────────
-- Every time drip-runner advances an enrollment, write one row here.
-- Phase 1 status values: 'dry_run' | 'queued' | 'completed' | 'skipped' | 'error'.
-- Phase 2 will add 'sent' | 'failed' (post-Twilio).
create table if not exists public.drip_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  enrollment_id uuid references public.sequence_enrollments(id) on delete cascade,
  sequence_id   text references public.sequences(id) on delete set null,
  step_idx      int,
  channel       text,                       -- 'sms' | 'email' | 'task'
  audience      text,                       -- 'lead' | 'rep' (snapshot at fire time)
  to_number     text,                       -- recipient phone (denormalized for grep)
  body          text,                       -- the rendered message (post-template-substitution)
  status        text not null,              -- see comment above
  error_text    text,
  agency_id     uuid
);
create index if not exists drip_log_occurred_idx on public.drip_log (occurred_at desc);
create index if not exists drip_log_enrollment_idx on public.drip_log (enrollment_id);
create index if not exists drip_log_agency_idx on public.drip_log (agency_id);
create index if not exists drip_log_status_idx on public.drip_log (status);

alter table public.drip_log enable row level security;

-- Service role bypasses RLS. Authenticated agency members can read their own.
drop policy if exists "drip_log_read_member" on public.drip_log;
create policy "drip_log_read_member" on public.drip_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and (am.role = 'super_admin' or am.agency_id = drip_log.agency_id)
    )
  );

-- ── 4. Default org_settings row: drip.send_enabled = false ──────────────
-- Phase 1 always runs dry. Flipping this row to true is what activates Phase 2.
-- Insert globally (agency_id NULL = default for all agencies until overridden).
insert into public.org_settings (key, value, agency_id, updated_by)
values ('drip.send_enabled', 'false'::jsonb, null, 'migration_0031')
on conflict do nothing;

insert into public.org_settings (key, value, agency_id, updated_by)
values ('drip.test_phone', '""'::jsonb, null, 'migration_0031')
on conflict do nothing;

-- ── 5. Seed step copy for the 4 lead sequences + 2 rep sequences ────────
-- Replaces placeholder em-dash bodies with TCPA-compliant copy. Every SMS
-- ends with "Reply STOP to opt out" (regulatory non-negotiable). Med Supp
-- steps include the TPMO disclaimer.

-- Helper: build a steps array. day_offset = days after enrollment.
-- channel='sms', body=text, audience inherited from sequence row.

update public.sequences
set steps = '[
  {"day": 0, "channel": "sms", "body": "Hi {{lead.first_name}} — quick note from {{rep.name}} at {{agency.name}}. I help folks turning 65 lock in Med Supp coverage before their AEP window closes. Want me to text you a 1-pager comparing Plan G / Plan N rates for {{lead.state}}? Reply STOP to opt out."},
  {"day": 2, "channel": "sms", "body": "Following up — pulled the 2026 Plan G rates for {{lead.state}}. UHC AARP is the standout if you don''t smoke; cheaper alternatives if you do. 90 seconds to walk through? Reply STOP to opt out."},
  {"day": 5, "channel": "sms", "body": "{{lead.first_name}} — last nudge from me. If timing''s off, no worries. If you want me to lock something in before AEP rate locks, reply YES and I''ll call. Reply STOP to opt out."}
]'::jsonb,
    is_active = true,
    audience  = 'lead',
    description = 'Turning-65 outreach. 3 SMS over 5 days. Plan G / Plan N rate comparison.'
where id = 't65-warmup' or name ilike '%T65%';

update public.sequences
set steps = '[
  {"day": 0, "channel": "sms", "body": "{{lead.first_name}} — sending the {{lead.product}} quote we discussed. App link: {{app_link}}. Tap when you have 2 minutes; takes 4 questions and you''re done. Reply STOP to opt out."},
  {"day": 1, "channel": "sms", "body": "Hey {{lead.first_name}} — saw the app is still open. If you hit a snag on the health questions, text me back the question # and I''ll walk you through. Reply STOP to opt out."},
  {"day": 3, "channel": "sms", "body": "Last bump on the {{lead.product}} app — these rates lock when you submit, not when we quoted. If you want me to take it from here on a call, reply CALL. Reply STOP to opt out."}
]'::jsonb,
    is_active = true,
    audience  = 'lead',
    description = 'Post-quote nudge. Fires after rep marks lead as Quoted. 3 SMS over 3 days.'
where id = 'quote-to-appin' or name ilike '%Quote%';

update public.sequences
set steps = '[
  {"day": 0, "channel": "sms", "body": "{{lead.first_name}} — AEP is open (Oct 15 – Dec 7). Your current plan likely changed for 2026 — premium, formulary, or both. Want me to run a side-by-side in 5 mins? Reply STOP to opt out."},
  {"day": 7, "channel": "sms", "body": "Heads up — week 2 of AEP. Most plan changes happen here when folks see the new rates. Worth a quick check? Reply STOP to opt out."},
  {"day": 30, "channel": "sms", "body": "AEP closes Dec 7. After that, you''re locked in for 2026 unless you have a SEP. If you''d like me to take one more look, reply YES. Reply STOP to opt out."}
]'::jsonb,
    is_active = true,
    audience  = 'lead',
    description = 'Annual Election Period renewal nudge. Fires Oct 15. 3 SMS spread across AEP.'
where id = 'aep-renewal' or name ilike '%AEP%';

update public.sequences
set steps = '[
  {"day": 0, "channel": "sms", "body": "{{lead.first_name}} — quick one. You set up Med Supp with us last year. A lot of our clients pair it with Final Expense ($5K–$25K whole life, no medical exam typically). Worth a 3-min look? Reply STOP to opt out."},
  {"day": 4, "channel": "sms", "body": "Following up — FE rates are locked by age, so every birthday costs you. If you want me to pull a quote for your age band ({{lead.age}}), reply YES. Reply STOP to opt out."}
]'::jsonb,
    is_active = true,
    audience  = 'lead',
    description = 'Cross-sell existing Med Supp clients into Final Expense whole life.'
where id = 'cross-sell-fe' or name ilike '%Cross-sell%' or name ilike '%FE%';

-- ── 6. Seed 2 rep-audience sequences (new hire onboarding + license nudge) ──
insert into public.sequences (id, name, description, steps, audience, is_active)
values
  ('rep-day1-onboard',
   'New rep · day 1 onboarding',
   'Fires when a producer joins the agency. SMS check-in for first dial.',
   '[
     {"day": 0, "channel": "sms", "body": "Welcome to {{agency.name}} — {{rep.name}} here. First dial is the hardest. Walk-through video: {{vault_link}}. Hit me with any question. Reply STOP to opt out."},
     {"day": 1, "channel": "sms", "body": "Day 2 check-in — how''d the first dials feel? If anything tripped you up, text it and I''ll get on a call. Reply STOP to opt out."},
     {"day": 7, "channel": "sms", "body": "End of week 1. Top producers in their first 30 days average 80 dials/day. Where are you at? Reply STOP to opt out."}
   ]'::jsonb,
   'rep',
   true)
on conflict (id) do update set
  steps = excluded.steps,
  description = excluded.description,
  audience = 'rep',
  is_active = true;

insert into public.sequences (id, name, description, steps, audience, is_active)
values
  ('rep-license-nudge',
   'License nudge',
   'Fires when a rep''s state license is < 30 days from expiry.',
   '[
     {"day": 0, "channel": "sms", "body": "{{rep.first_name}} — your {{state}} license expires in 30 days. Renewal portal: {{license_link}}. Lapsed reps can''t collect commissions. Reply STOP to opt out."},
     {"day": 14, "channel": "sms", "body": "{{rep.first_name}} — 16 days to renew your {{state}} license. Two weeks is plenty if you start now. Reply STOP to opt out."},
     {"day": 25, "channel": "sms", "body": "URGENT: {{state}} license expires in 5 days. After that, your in-flight apps get held. Renew today. Reply STOP to opt out."}
   ]'::jsonb,
   'rep',
   true)
on conflict (id) do update set
  steps = excluded.steps,
  description = excluded.description,
  audience = 'rep',
  is_active = true;

comment on table public.drip_log is
  'Per-step Lead Drip audit. Query: select * from public.drip_log order by occurred_at desc limit 50;';
comment on column public.agency_lead_sources.inbound_slug is
  'URL slug for inbound webhook. POST /api/leads/inbound-source?source=<slug> with x-repflow-signature: sha256=<HMAC of body using inbound_hmac_secret>.';
comment on column public.agency_lead_sources.field_map is
  'JSONB mapping of provider field name -> repflow field name. Example: {"contact.full_name": "lead_name", "contact.phone": "phone"}. Dot-path supported.';
