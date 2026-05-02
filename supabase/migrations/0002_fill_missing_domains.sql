-- Repflow V2 — fill missing domains (commissions, policies, attribution, NIGO,
-- forecast, coaching, vault, book, recruiting, messaging, notifications,
-- tasks, tier history, AEP) plus the 5 tables the frontend already calls but
-- that did not exist (agent_deployments, agent_install_tokens, agent_runs,
-- sequence_enrollments, tiering_overrides).
--
-- Schema philosophy mirrors 0001:
--   - Money in cents (bigint). Never floats.
--   - Enums as CHECK constraints, not CREATE TYPE (cheaper to evolve).
--   - Single-tenant for now. Multi-tenant fork adds org_id + RLS by membership.
--   - RLS enabled, permissive for authenticated + anon (prototype mode).
--     Tighten when login lands.
--   - Every FK uses ON DELETE SET NULL or CASCADE depending on whether the
--     parent is reference data or container data.

------------------------------------------------------------------------------
-- A. The 5 tables the frontend was already calling (currently 500ing)
------------------------------------------------------------------------------

-- A1. agent_deployments — page-platform.jsx "Deploy AI agent to host" insert
create table if not exists public.agent_deployments (
  id              uuid primary key default gen_random_uuid(),
  agent_id        text not null references public.ai_agents(id) on delete cascade,
  host_id         text not null references public.hardware(id) on delete cascade,
  status          text not null default 'live' check (status in ('live','paused','stopped','error')),
  manifest        jsonb not null default '{}'::jsonb,
  last_heartbeat  timestamptz not null default now(),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  notes           text
);
create index if not exists agent_deployments_agent_idx on public.agent_deployments (agent_id);
create index if not exists agent_deployments_host_idx  on public.agent_deployments (host_id);
create index if not exists agent_deployments_status_idx on public.agent_deployments (status) where status = 'live';

-- A2. agent_install_tokens — page-platform.jsx host enrollment polling
create table if not exists public.agent_install_tokens (
  token         text primary key,
  used_for_id   text references public.hardware(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '1 hour',
  used_at       timestamptz
);
create index if not exists agent_install_tokens_used_idx on public.agent_install_tokens (used_for_id) where used_for_id is not null;

-- A3. agent_runs — page-ops.jsx live run log
create table if not exists public.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text references public.ai_agents(id) on delete cascade,
  host_id      text references public.hardware(id) on delete set null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_ms  integer,
  status       text not null default 'running' check (status in ('running','succeeded','failed','timeout')),
  output_text  text,
  error_text   text,
  metadata     jsonb default '{}'::jsonb
);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);
create index if not exists agent_runs_status_idx on public.agent_runs (status) where status = 'running';

-- A4. sequences — needed before sequence_enrollments
create table if not exists public.sequences (
  id           text primary key,
  name         text not null,
  description  text,
  steps        jsonb not null default '[]'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- A5. sequence_enrollments — data.jsx enroll-in-nurture-sequence button
create table if not exists public.sequence_enrollments (
  id                uuid primary key default gen_random_uuid(),
  lead_pipeline_id  uuid not null references public.pipeline(id) on delete cascade,
  sequence_id       text not null references public.sequences(id) on delete restrict,
  owner_rep_id      text references public.reps(id) on delete set null,
  status            text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  current_step      integer not null default 0,
  enrolled_at       timestamptz not null default now(),
  next_step_at      timestamptz,
  completed_at      timestamptz
);
create index if not exists sequence_enrollments_lead_idx on public.sequence_enrollments (lead_pipeline_id);
create index if not exists sequence_enrollments_seq_idx  on public.sequence_enrollments (sequence_id);
create index if not exists sequence_enrollments_status_idx on public.sequence_enrollments (status) where status = 'active';

-- A6. tiering_overrides — leaderboard manual tier set (data.jsx upsert)
create table if not exists public.tiering_overrides (
  rep_id        text primary key references public.reps(id) on delete cascade,
  override_tier text not null check (override_tier in ('bronze','silver','gold','platinum','diamond')),
  set_at        timestamptz not null default now(),
  set_by        text,
  notes         text
);

------------------------------------------------------------------------------
-- B. Money — policies, commissions, payouts, clawbacks
------------------------------------------------------------------------------

-- B1. carriers — must come before policies (FK target)
create table if not exists public.carriers (
  id                  text primary key,                       -- "uhc","humana","aetna",...
  name                text not null,
  category            text not null check (category in ('med_supp','medicare_advantage','final_expense','annuity','life','aca','dental','vision','part_d','other')),
  commission_grid     jsonb default '{}'::jsonb,              -- nested by product+state+year
  status              text not null default 'active' check (status in ('active','pending','inactive')),
  contact_name        text,
  contact_phone       text,
  contact_email       text,
  product_lines       text[],
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists carriers_category_idx on public.carriers (category);

-- B2. products — per-carrier products
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  carrier_id         text not null references public.carriers(id) on delete cascade,
  name               text not null,
  category           text not null,                            -- "Med Supp Plan G", "Final Expense $25K", ...
  comp_pct           numeric(5,2),                             -- street comp %
  comp_per_app_cents bigint,                                   -- flat $/app commission (cents)
  features           jsonb default '{}'::jsonb,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists products_carrier_idx on public.products (carrier_id);

-- B3. carrier_appointments — per-rep per-state per-carrier
create table if not exists public.carrier_appointments (
  id            uuid primary key default gen_random_uuid(),
  carrier_id    text not null references public.carriers(id) on delete cascade,
  rep_id        text not null references public.reps(id) on delete cascade,
  state         text not null,                                  -- 2-letter state code
  status        text not null default 'pending' check (status in ('active','pending','expired','revoked')),
  appointed_at  date,
  expires_at    date,
  npn           text,                                            -- National Producer Number
  notes         text,
  created_at    timestamptz not null default now()
);
create unique index if not exists carrier_appts_unique on public.carrier_appointments (carrier_id, rep_id, state);
create index if not exists carrier_appts_rep_idx on public.carrier_appointments (rep_id);

-- B4. policies — issued / in-force policies (the source of truth for commissions)
create table if not exists public.policies (
  id                 uuid primary key default gen_random_uuid(),
  lead_pipeline_id   uuid references public.pipeline(id) on delete set null,
  carrier_id         text references public.carriers(id) on delete set null,
  product_id         uuid references public.products(id) on delete set null,
  policy_number      text,
  product_text       text,                                       -- "Med Supp Plan G" — denormalized
  ap_cents           bigint not null default 0,                  -- annual premium
  issued_at          date,
  effective_at       date,
  status             text not null default 'pending' check (status in ('pending','app_in','issued','active','lapsed','cancelled','rescinded')),
  persistency_status text not null default 'on_book' check (persistency_status in ('on_book','at_risk','lapsed','recovered')),
  owner_rep_id       text references public.reps(id) on delete set null,
  state              text,
  metadata           jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists policies_owner_idx on public.policies (owner_rep_id);
create index if not exists policies_status_idx on public.policies (status);
create index if not exists policies_carrier_idx on public.policies (carrier_id);

-- B5. commissions — every commission event (advance, earned, trail, override)
create table if not exists public.commissions (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid references public.policies(id) on delete cascade,
  rep_id        text not null references public.reps(id) on delete cascade,
  amount_cents  bigint not null,
  kind          text not null check (kind in ('advance','earned','trail','residual','override','bonus','adjustment')),
  period_text   text,                                            -- "2026-04", "2026-Q2"
  earned_at     date,
  paid_at       date,
  source        text,                                            -- "carrier_statement","manual","reconciliation"
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists commissions_rep_idx on public.commissions (rep_id, earned_at desc);
create index if not exists commissions_policy_idx on public.commissions (policy_id);
create index if not exists commissions_period_idx on public.commissions (period_text);

-- B6. payouts — what we actually wire to the rep (Stripe rail)
create table if not exists public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  rep_id              text not null references public.reps(id) on delete cascade,
  period_start        date not null,
  period_end          date not null,
  gross_cents         bigint not null default 0,
  deductions_cents    bigint not null default 0,
  net_cents           bigint not null default 0,
  status              text not null default 'pending' check (status in ('pending','processing','paid','failed','reversed')),
  paid_at             timestamptz,
  stripe_payout_id    text,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists payouts_rep_idx on public.payouts (rep_id, period_end desc);
create index if not exists payouts_status_idx on public.payouts (status);

-- B7. clawbacks — chargebacks on lapsed policies
create table if not exists public.clawbacks (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid references public.policies(id) on delete set null,
  rep_id        text not null references public.reps(id) on delete cascade,
  amount_cents  bigint not null,
  reason        text,
  recorded_at   timestamptz not null default now(),
  recovered_at  timestamptz,
  status        text not null default 'recorded' check (status in ('recorded','disputing','recovered','written_off'))
);
create index if not exists clawbacks_rep_idx on public.clawbacks (rep_id, recorded_at desc);

------------------------------------------------------------------------------
-- C. Attribution — lead sources, multi-touch
------------------------------------------------------------------------------

create table if not exists public.lead_sources (
  id                  text primary key,                         -- "fb_lead_form","t65_list","inbound_call",...
  name                text not null,
  kind                text not null check (kind in ('paid','organic','referral','inbound','outbound','partner')),
  vendor              text,
  cost_per_lead_cents bigint,
  notes               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table if not exists public.attributions (
  id                uuid primary key default gen_random_uuid(),
  lead_pipeline_id  uuid not null references public.pipeline(id) on delete cascade,
  source_id         text references public.lead_sources(id) on delete set null,
  first_touch_at    timestamptz,
  last_touch_at     timestamptz,
  model             text not null default 'last' check (model in ('first','last','linear','time_decay','position_based')),
  credit_pct        numeric(5,2) not null default 100.00,
  created_at        timestamptz not null default now()
);
create index if not exists attributions_lead_idx on public.attributions (lead_pipeline_id);
create index if not exists attributions_source_idx on public.attributions (source_id);

create table if not exists public.touchpoints (
  id                uuid primary key default gen_random_uuid(),
  lead_pipeline_id  uuid not null references public.pipeline(id) on delete cascade,
  source_id         text references public.lead_sources(id) on delete set null,
  kind              text not null check (kind in ('impression','click','call','sms','email','visit','form_submit','referral','other')),
  occurred_at       timestamptz not null default now(),
  metadata          jsonb default '{}'::jsonb
);
create index if not exists touchpoints_lead_idx on public.touchpoints (lead_pipeline_id, occurred_at desc);

------------------------------------------------------------------------------
-- D. NIGO (Not-In-Good-Order) queue
------------------------------------------------------------------------------

create table if not exists public.nigo_reasons (
  id          text primary key,                                  -- "missing_signature","wrong_dob","incomplete_app",...
  label       text not null,
  category    text not null check (category in ('carrier','internal','compliance')),
  severity    text not null default 'med' check (severity in ('low','med','high','critical')),
  is_active   boolean not null default true
);

create table if not exists public.nigos (
  id          uuid primary key default gen_random_uuid(),
  policy_id   uuid references public.policies(id) on delete cascade,
  pipeline_id uuid references public.pipeline(id) on delete cascade,
  reason_id   text references public.nigo_reasons(id) on delete set null,
  notes       text,
  status      text not null default 'open' check (status in ('open','in_review','resolved','wont_fix')),
  assigned_to text references public.reps(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists nigos_status_idx on public.nigos (status) where status in ('open','in_review');
create index if not exists nigos_assigned_idx on public.nigos (assigned_to) where status in ('open','in_review');

------------------------------------------------------------------------------
-- E. Forecast — model runs + manual overrides
------------------------------------------------------------------------------

create table if not exists public.forecast_runs (
  id              uuid primary key default gen_random_uuid(),
  generated_at    timestamptz not null default now(),
  period_text     text not null,                                 -- "2026-Q3","2026-12"
  basis           text not null check (basis in ('deals','policies','blended')),
  forecast_cents  bigint not null default 0,
  confidence_pct  numeric(5,2),
  model           text,                                          -- "linear-trailing-3mo","gemini-prompted-v1",...
  raw             jsonb default '{}'::jsonb
);
create index if not exists forecast_runs_period_idx on public.forecast_runs (period_text, generated_at desc);

create table if not exists public.forecast_overrides (
  id              uuid primary key default gen_random_uuid(),
  period_text     text not null,
  override_cents  bigint not null,
  reason          text,
  set_by          text,
  set_at          timestamptz not null default now()
);
create index if not exists forecast_overrides_period_idx on public.forecast_overrides (period_text);

------------------------------------------------------------------------------
-- F. Coaching
------------------------------------------------------------------------------

create table if not exists public.coaching_sessions (
  id            uuid primary key default gen_random_uuid(),
  rep_id        text not null references public.reps(id) on delete cascade,
  coach_handle  text,
  scheduled_at  timestamptz,
  completed_at  timestamptz,
  focus_area    text,                                            -- "objection_handling","tpmo","cross_sell",...
  recording_id  uuid references public.recordings(id) on delete set null,
  outcome       text check (outcome in ('completed','no_show','rescheduled','cancelled')),
  rating        integer check (rating between 1 and 5),
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists coaching_sessions_rep_idx on public.coaching_sessions (rep_id, scheduled_at desc);

create table if not exists public.coaching_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.coaching_sessions(id) on delete cascade,
  rep_id      text references public.reps(id) on delete cascade,
  body        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists coaching_notes_rep_idx on public.coaching_notes (rep_id, created_at desc);

------------------------------------------------------------------------------
-- G. Vault — compliance documents (file metadata; bytes live in Supabase Storage)
--    Storage bucket "vault" must be created separately in the Supabase dashboard.
------------------------------------------------------------------------------

create table if not exists public.vault_files (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  kind            text not null check (kind in ('soa','jornaya_cert','trustedform_cert','recording','application','license','contract','other')),
  policy_id       uuid references public.policies(id) on delete set null,
  pipeline_id     uuid references public.pipeline(id) on delete set null,
  rep_id          text references public.reps(id) on delete set null,
  bucket          text not null default 'vault',
  path            text not null,                                  -- storage path within bucket
  size_bytes      bigint,
  mime_type       text,
  retention_until date,                                            -- compliance retention date
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists vault_files_policy_idx on public.vault_files (policy_id);
create index if not exists vault_files_pipeline_idx on public.vault_files (pipeline_id);
create index if not exists vault_files_kind_idx on public.vault_files (kind);

------------------------------------------------------------------------------
-- H. Book of business — households, clients, in-force entries
------------------------------------------------------------------------------

create table if not exists public.households (
  id              uuid primary key default gen_random_uuid(),
  household_name  text not null,
  primary_lead_id uuid references public.pipeline(id) on delete set null,
  city            text,
  state           text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid references public.households(id) on delete cascade,
  full_name         text not null,
  dob               date,
  contact_phone     text,
  contact_email     text,
  lead_pipeline_id  uuid references public.pipeline(id) on delete set null,
  relationship      text,                                          -- "primary","spouse","dependent","other"
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists clients_household_idx on public.clients (household_id);
create index if not exists clients_lead_idx on public.clients (lead_pipeline_id);

create table if not exists public.book_entries (
  id                  uuid primary key default gen_random_uuid(),
  rep_id              text not null references public.reps(id) on delete cascade,
  policy_id           uuid not null references public.policies(id) on delete cascade,
  in_force_since      date,
  last_review_at      timestamptz,
  persistency_score   numeric(5,2),                                 -- 0..100
  notes               text,
  created_at          timestamptz not null default now()
);
create unique index if not exists book_entries_unique on public.book_entries (rep_id, policy_id);

------------------------------------------------------------------------------
-- I. Recruiting
------------------------------------------------------------------------------

create table if not exists public.recruits (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  source            text,                                            -- "indeed","referral","linkedin","jobboard"
  contact_email     text,
  contact_phone     text,
  license_state     text,
  has_license       boolean default false,
  status            text not null default 'lead' check (status in ('lead','screen','interview','offer','onboarded','declined','dropped')),
  recruiter_handle  text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists recruits_status_idx on public.recruits (status);

create table if not exists public.interviews (
  id              uuid primary key default gen_random_uuid(),
  recruit_id      uuid not null references public.recruits(id) on delete cascade,
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  interviewer     text,
  outcome         text check (outcome in ('advance','hold','decline','no_show')),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists interviews_recruit_idx on public.interviews (recruit_id, scheduled_at desc);

------------------------------------------------------------------------------
-- J. Messaging — in-app threads + messages
------------------------------------------------------------------------------

create table if not exists public.threads (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'direct' check (kind in ('direct','team','lead','broadcast')),
  subject         text,
  related_lead_id uuid references public.pipeline(id) on delete set null,
  last_message_at timestamptz default now(),
  created_at      timestamptz not null default now()
);
create index if not exists threads_last_msg_idx on public.threads (last_message_at desc);

create table if not exists public.thread_members (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.threads(id) on delete cascade,
  member_handle text not null,                                       -- rep handle, "@marc" etc, or email for non-reps
  joined_at     timestamptz not null default now(),
  muted         boolean not null default false
);
create unique index if not exists thread_members_unique on public.thread_members (thread_id, member_handle);
create index if not exists thread_members_handle_idx on public.thread_members (member_handle);

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.threads(id) on delete cascade,
  sender_handle text not null,
  body          text not null,
  metadata      jsonb default '{}'::jsonb,                            -- attachments, reactions, mentions
  created_at    timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);

create table if not exists public.message_reads (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  reader_handle text not null,
  read_at       timestamptz not null default now()
);
create unique index if not exists message_reads_unique on public.message_reads (message_id, reader_handle);

------------------------------------------------------------------------------
-- K. Notifications (the bell icon)
------------------------------------------------------------------------------

create table if not exists public.notifications (
  id                uuid primary key default gen_random_uuid(),
  recipient_handle  text not null,                                    -- rep handle / email
  kind              text not null,                                    -- "lead_assigned","nigo","commission_paid","tier_promo","coaching"
  title             text not null,
  body              text,
  link              text,
  severity          text not null default 'info' check (severity in ('info','warn','urgent','success')),
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_handle, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_handle) where read_at is null;

------------------------------------------------------------------------------
-- L. Tasks / followups
------------------------------------------------------------------------------

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  rep_id          text references public.reps(id) on delete cascade,
  kind            text not null check (kind in ('call','sms','email','admin','followup','review','soa','other')),
  title           text not null,
  body            text,
  due_at          timestamptz,
  completed_at    timestamptz,
  related_lead_id uuid references public.pipeline(id) on delete set null,
  related_policy_id uuid references public.policies(id) on delete set null,
  priority        text not null default 'med' check (priority in ('low','med','high','urgent')),
  status          text not null default 'open' check (status in ('open','done','snoozed','cancelled')),
  created_at      timestamptz not null default now()
);
create index if not exists tasks_rep_due_idx on public.tasks (rep_id, due_at) where status = 'open';

create table if not exists public.followup_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  trigger      jsonb not null,                                         -- e.g. {"event":"stage_change","from":"Quoted","to":"App In"}
  action       jsonb not null,                                         -- e.g. {"create_task":{"kind":"followup","delay_hours":24}}
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

------------------------------------------------------------------------------
-- M. Tier history
------------------------------------------------------------------------------

create table if not exists public.tier_changes (
  id          uuid primary key default gen_random_uuid(),
  rep_id      text not null references public.reps(id) on delete cascade,
  from_tier   text check (from_tier in ('bronze','silver','gold','platinum','diamond')),
  to_tier     text not null check (to_tier in ('bronze','silver','gold','platinum','diamond')),
  reason      text,                                                     -- "automatic_promotion","override","seasonal","review"
  changed_by  text,
  changed_at  timestamptz not null default now()
);
create index if not exists tier_changes_rep_idx on public.tier_changes (rep_id, changed_at desc);

------------------------------------------------------------------------------
-- N. AEP (Annual Enrollment Period)
------------------------------------------------------------------------------

create table if not exists public.aep_periods (
  id          text primary key,                                         -- "2026-aep"
  name        text not null,                                            -- "2026 AEP"
  starts_at   date not null,
  ends_at     date not null,
  status      text not null default 'planned' check (status in ('planned','active','closed')),
  notes       text
);

create table if not exists public.aep_assignments (
  id              uuid primary key default gen_random_uuid(),
  period_id       text not null references public.aep_periods(id) on delete cascade,
  rep_id          text not null references public.reps(id) on delete cascade,
  territory       text,
  target_apps     integer not null default 0,
  target_ap_cents bigint not null default 0,
  completed_apps  integer not null default 0,
  completed_ap_cents bigint not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);
create unique index if not exists aep_assignments_unique on public.aep_assignments (period_id, rep_id);

------------------------------------------------------------------------------
-- O. RLS — enable on every new table; permissive for authenticated + anon
--    (matches 0001's prototype-mode policy. Tighten when login lands.)
------------------------------------------------------------------------------

do $$
declare
  t text;
  tables text[] := array[
    'agent_deployments','agent_install_tokens','agent_runs',
    'sequences','sequence_enrollments','tiering_overrides',
    'carriers','products','carrier_appointments',
    'policies','commissions','payouts','clawbacks',
    'lead_sources','attributions','touchpoints',
    'nigo_reasons','nigos',
    'forecast_runs','forecast_overrides',
    'coaching_sessions','coaching_notes',
    'vault_files',
    'households','clients','book_entries',
    'recruits','interviews',
    'threads','thread_members','messages','message_reads',
    'notifications',
    'tasks','followup_rules',
    'tier_changes',
    'aep_periods','aep_assignments'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "auth read %I" on public.%I for select to authenticated using (true)$p$, t, t);
    execute format($p$create policy "auth write %I" on public.%I for all to authenticated using (true) with check (true)$p$, t, t);
    execute format($p$create policy "anon read %I" on public.%I for select to anon using (true)$p$, t, t);
  end loop;
exception when duplicate_object then
  -- policies already exist (re-run); safe to ignore
  null;
end $$;

------------------------------------------------------------------------------
-- P. Seed reference data so the UI has something to render after hydrate
------------------------------------------------------------------------------

-- Nurture sequences (referenced by sequence_enrollments)
insert into public.sequences (id, name, description, steps) values
  ('t65_warmup',     'T65 Warm-up',          '5-touch sequence for new T65 leads', '["sms","call","email","sms","call"]'),
  ('quote_followup', 'Quote → App-in',       '3-touch nudge after a quote',         '["sms","call","email"]'),
  ('aep_renewal',    'AEP Renewal Reminder', 'Annual nudge before AEP opens',       '["email","sms","call"]'),
  ('cross_sell_fe',  'Cross-sell to FE',     'Med Supp issued → final expense',     '["sms","call","email"]')
on conflict (id) do nothing;

-- Lead sources mirror the values used in pipeline.source / queue.source
insert into public.lead_sources (id, name, kind, vendor, cost_per_lead_cents) values
  ('fb_lead_form',  'FB Lead Form',  'paid',     'Meta',          1800),
  ('t65_list',      'T65 list',      'paid',     'Vendor list',    900),
  ('inbound_call',  'Inbound call',  'inbound',  null,             0),
  ('referral',      'Referral',      'referral', null,             0),
  ('cross_sell',    'Cross-sell',    'organic',  'Internal',       0),
  ('tv_dr',         'TV DRTV',       'paid',     'TV buy',        4500),
  ('aged_lead',     'Aged Lead',     'paid',     'Vendor list',    500)
on conflict (id) do nothing;

-- Standard NIGO reasons
insert into public.nigo_reasons (id, label, category, severity) values
  ('missing_signature',    'Missing signature',          'carrier',    'high'),
  ('wrong_dob',            'DOB mismatch',               'carrier',    'high'),
  ('incomplete_app',       'Incomplete application',     'carrier',    'med'),
  ('soa_missing',          'SOA missing',                'compliance', 'critical'),
  ('soa_late',             'SOA captured > 48h after',   'compliance', 'high'),
  ('tpmo_missing',         'TPMO disclaimer missing',    'compliance', 'critical'),
  ('payment_invalid',      'Invalid payment method',     'carrier',    'med'),
  ('beneficiary_missing',  'Beneficiary missing',        'carrier',    'med'),
  ('id_verification',      'ID verification needed',     'internal',   'low'),
  ('appointment_inactive', 'Rep not appointed in state', 'internal',   'high')
on conflict (id) do nothing;

-- A current AEP period so AEP UIs have a row to render against
insert into public.aep_periods (id, name, starts_at, ends_at, status) values
  ('2026-aep', '2026 AEP', '2026-10-15', '2026-12-07', 'planned')
on conflict (id) do nothing;

-- A starter carrier set so the in-call carrier panel + appointments page render
insert into public.carriers (id, name, category, status, product_lines) values
  ('uhc',        'UnitedHealthcare', 'med_supp',           'active', array['Med Supp Plan G','Med Supp Plan N','MA-PD']),
  ('humana',     'Humana',           'medicare_advantage', 'active', array['MA-PD','PDP','Med Supp']),
  ('aetna',      'Aetna',            'medicare_advantage', 'active', array['MA-PD','Med Supp']),
  ('mutual',     'Mutual of Omaha',  'med_supp',           'active', array['Med Supp Plan G','Med Supp Plan N']),
  ('cigna',      'Cigna',            'medicare_advantage', 'active', array['MA-PD','Med Supp']),
  ('foresters',  'Foresters',        'final_expense',      'active', array['Final Expense $10K','Final Expense $25K']),
  ('americo',    'Americo',          'final_expense',      'active', array['Final Expense $15K','Final Expense $20K']),
  ('aig',        'AIG',              'annuity',            'active', array['Annuity $50K','Annuity $100K']),
  ('globe',      'Globe Life',       'final_expense',      'active', array['Final Expense $10K','Final Expense $25K'])
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Q. updated_at triggers for tables that have an updated_at column
------------------------------------------------------------------------------

create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_policies_updated on public.policies;
create trigger trg_policies_updated before update on public.policies
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_recruits_updated on public.recruits;
create trigger trg_recruits_updated before update on public.recruits
  for each row execute function public.tg_set_updated_at();
