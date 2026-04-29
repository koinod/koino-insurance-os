-- KOINO Agency — initial schema
-- Single-tenant insurance team management.
-- Run via: supabase db push  (or psql via Supabase SQL editor)

-- ============================================================
-- Reference tables
-- ============================================================

create table if not exists carriers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid references carriers(id) on delete set null,
  name        text not null,
  category    text not null,            -- 'whole_life' | 'term' | 'iul' | 'final_expense' | 'annuity' | etc.
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists lead_vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  cost_per_lead numeric(10,2),
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Team
-- ============================================================

create table if not exists agents (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text not null,
  phone         text,
  role          text not null default 'agent', -- 'owner' | 'manager' | 'agent' | 'recruit'
  upline_id     uuid references agents(id) on delete set null,
  status        text not null default 'active', -- 'active' | 'inactive' | 'recruit'
  hire_date     date,
  joined_at     timestamptz not null default now(),
  notes         text
);

create index if not exists idx_agents_upline on agents(upline_id);
create index if not exists idx_agents_role on agents(role);
create index if not exists idx_agents_status on agents(status);

-- ============================================================
-- Clients (the people we sell to)
-- ============================================================

create type client_stage as enum (
  'new',
  'underwriting',
  'approved',
  'policy_delivered',
  'lapsed'
);

create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text,
  email           text,
  stage           client_stage not null default 'new',
  source          text,                          -- 'referral', 'lifejacket_vet', etc.
  lead_vendor_id  uuid references lead_vendors(id) on delete set null,
  agent_id        uuid references agents(id) on delete set null,
  received_at     date,
  follow_up_at    date,
  -- AI-generated fields (refreshed by the score-lead endpoint)
  ai_score        smallint,                      -- 1-10
  ai_reasoning    text,
  ai_close_probability numeric(4,3),             -- 0.000-1.000 (predicted close probability)
  ai_updated_at   timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_clients_stage on clients(stage);
create index if not exists idx_clients_agent on clients(agent_id);
create index if not exists idx_clients_followup on clients(follow_up_at);
create index if not exists idx_clients_score on clients(ai_score desc);

-- ============================================================
-- Deals (each policy submission)
-- ============================================================

create type deal_status as enum (
  'submitted',
  'underwriting',
  'approved',
  'issued',
  'declined',
  'withdrawn'
);

create type pipeline_tab as enum (
  'working',
  'active',
  'closed'
);

create table if not exists deals (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  agent_id            uuid not null references agents(id) on delete restrict,
  carrier_id          uuid references carriers(id) on delete set null,
  product_id          uuid references products(id) on delete set null,
  lead_vendor_id      uuid references lead_vendors(id) on delete set null,
  -- Money
  annual_premium      numeric(12,2),                  -- AP
  expected_commission numeric(12,2),
  deposits            numeric(12,2) default 0,
  outstanding         numeric(12,2) default 0,
  -- Dates
  submitted_at        date,
  draft_date          date,
  issued_at           date,
  -- Status
  status              deal_status not null default 'submitted',
  pipeline_tab        pipeline_tab not null default 'working',
  policy_number       text,
  -- AI fields
  ai_close_probability numeric(4,3),
  ai_next_action      text,
  ai_updated_at       timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_deals_agent on deals(agent_id);
create index if not exists idx_deals_status on deals(status);
create index if not exists idx_deals_pipeline_tab on deals(pipeline_tab);
create index if not exists idx_deals_submitted on deals(submitted_at desc);
create index if not exists idx_deals_client on deals(client_id);

-- ============================================================
-- Activities — call logs, notes, status changes, AI events
-- ============================================================

create type activity_kind as enum (
  'call',
  'sms',
  'email',
  'note',
  'meeting',
  'stage_change',
  'ai_score_run',
  'ai_followup_generated',
  'ai_coaching_run'
);

create table if not exists activities (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references agents(id) on delete set null,
  client_id     uuid references clients(id) on delete cascade,
  deal_id       uuid references deals(id) on delete cascade,
  kind          activity_kind not null,
  body          text,
  outcome       text,                            -- 'connected', 'voicemail', 'declined', etc.
  duration_seconds integer,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_activities_client on activities(client_id);
create index if not exists idx_activities_deal on activities(deal_id);
create index if not exists idx_activities_agent on activities(agent_id);
create index if not exists idx_activities_kind on activities(kind);
create index if not exists idx_activities_created on activities(created_at desc);

-- ============================================================
-- Follow-ups — agent-scoped scheduled tasks
-- ============================================================

create type followup_status as enum ('pending', 'completed', 'snoozed', 'cancelled');

create table if not exists followups (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references agents(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  deal_id     uuid references deals(id) on delete cascade,
  due_at      timestamptz not null,
  title       text not null,
  body        text,
  status      followup_status not null default 'pending',
  ai_drafted  boolean not null default false,    -- did the AI write the body?
  completed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_followups_agent_due on followups(agent_id, due_at);
create index if not exists idx_followups_status on followups(status);

-- ============================================================
-- AI runs log (auditing what the AI wrote and when)
-- ============================================================

create table if not exists ai_runs (
  id            uuid primary key default gen_random_uuid(),
  endpoint      text not null,                   -- 'score-lead' | 'generate-followup' | 'coaching'
  client_id     uuid references clients(id) on delete cascade,
  deal_id       uuid references deals(id) on delete cascade,
  agent_id      uuid references agents(id) on delete cascade,
  request_payload  jsonb,
  response_payload jsonb,
  model         text,
  tokens_in     integer,
  tokens_out    integer,
  duration_ms   integer,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ai_runs_endpoint on ai_runs(endpoint);
create index if not exists idx_ai_runs_client on ai_runs(client_id);

-- ============================================================
-- updated_at triggers
-- ============================================================

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_clients_updated on clients;
create trigger trg_clients_updated before update on clients
  for each row execute function set_updated_at();

drop trigger if exists trg_deals_updated on deals;
create trigger trg_deals_updated before update on deals
  for each row execute function set_updated_at();

-- ============================================================
-- Convenience views
-- ============================================================

create or replace view v_leaderboard as
select
  a.id as agent_id,
  a.full_name,
  count(d.id) filter (where d.status in ('approved','issued')) as deals_won,
  count(d.id) as deals_total,
  coalesce(sum(d.annual_premium) filter (where d.status in ('approved','issued')), 0) as total_ap,
  coalesce(sum(d.expected_commission) filter (where d.status in ('approved','issued')), 0) as total_commission,
  coalesce(sum(d.deposits), 0) as deposits,
  coalesce(sum(d.outstanding), 0) as outstanding
from agents a
left join deals d on d.agent_id = a.id
where a.status = 'active'
group by a.id, a.full_name
order by total_ap desc;

create or replace view v_pipeline_funnel as
select
  stage::text as stage,
  count(*) as count,
  coalesce(sum(d.annual_premium), 0) as total_ap
from clients c
left join deals d on d.client_id = c.id and d.status not in ('declined','withdrawn')
group by stage
order by case stage::text
  when 'new' then 1
  when 'underwriting' then 2
  when 'approved' then 3
  when 'policy_delivered' then 4
  when 'lapsed' then 5
end;

-- ============================================================
-- Seed data (carriers + products)
-- ============================================================

insert into carriers (name) values
  ('Transamerica'), ('ETHOS'), ('F&G'), ('Everlast'),
  ('Mutual of Omaha'), ('Foresters'), ('Americo'), ('AIG'), ('Globe Life')
on conflict (name) do nothing;

insert into products (name, category)
select * from (values
  ('Whole Life', 'whole_life'),
  ('Term Life', 'term'),
  ('Child IUL', 'iul'),
  ('Indexed Universal Life', 'iul'),
  ('Final Expense', 'final_expense'),
  ('Single Premium Annuity', 'annuity')
) p(name, category)
on conflict do nothing;

insert into lead_vendors (name, cost_per_lead) values
  ('Referral', 0),
  ('Life Jacket Vet', 35),
  ('FB Lead Form', 18),
  ('Internal Cross-sell', 0),
  ('Aged Lead', 5)
on conflict (name) do nothing;
