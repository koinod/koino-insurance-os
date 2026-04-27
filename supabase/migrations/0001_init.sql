-- KOINO Insurance OS — initial schema
-- All money columns are *_cents (bigint) — never floats.
-- RLS policies are stubbed below; tighten before prod.

create extension if not exists "pgcrypto";

-- ─── ORGS / USERS / REPS ──────────────────────────────────────────
create type role_enum as enum ('OWNER', 'MANAGER', 'AGENT');

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text unique not null,
  full_name text,
  role role_enum not null default 'AGENT',
  created_at timestamptz not null default now()
);

create table reps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  full_name text not null,
  npn text,
  license_state text,
  license_number text,
  upline_id uuid references reps(id),
  carrier_appointments jsonb not null default '[]',
  contracts_signed jsonb not null default '[]',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── CARRIERS / PRODUCTS / COMP GRIDS ────────────────────────────
create table carriers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  unique (org_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  category text,
  unique (org_id, name)
);

create table commission_grids (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  carrier_id uuid not null references carriers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null, -- null = default org rate
  rate_bps int not null, -- basis points (10000 = 100%)
  effective_at date not null default current_date,
  unique (org_id, carrier_id, product_id, rep_id, effective_at)
);

-- ─── LEAD VENDORS / LEADS ────────────────────────────────────────
create table lead_vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  vendor_type text, -- Aged | Live Transfer | Referral | Direct Mail | Web Form | Other
  cost_per_lead_cents bigint not null default 0,
  active boolean not null default true,
  unique (org_id, name)
);

create type lead_status_enum as enum (
  'New', 'Contacted', 'Qualified', 'Quoted', 'App Started', 'Submitted', 'Closed Won', 'Closed Lost'
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  address jsonb,
  household_id uuid,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  vendor_id uuid references lead_vendors(id) on delete set null,
  source text,
  status lead_status_enum not null default 'New',
  assigned_rep_id uuid references reps(id) on delete set null,
  attempts int not null default 0,
  last_touch_at timestamptz,
  est_ap_cents bigint,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ─── DEALS ────────────────────────────────────────────────────────
create type deal_status_enum as enum (
  'Draft', 'Submitted', 'Underwriting', 'Approved', 'Issued',
  'Pending', 'Declined', 'Lapsed', 'Chargeback'
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid not null references reps(id),
  client_id uuid references clients(id) on delete set null,
  lead_source_id uuid references lead_vendors(id) on delete set null,
  carrier_id uuid not null references carriers(id),
  product_id uuid not null references products(id),
  ap_cents bigint not null,
  est_comm_cents bigint not null,
  deposits_cents bigint not null default 0,
  outstanding_cents bigint not null default 0,
  status deal_status_enum not null default 'Draft',
  policy_number text,
  submitted_at date,
  draft_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deals_org_status_idx on deals (org_id, status);
create index deals_agent_idx on deals (agent_id, submitted_at desc);

-- ─── ACTIVITIES / FOLLOW-UPS ─────────────────────────────────────
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  kind text not null, -- call | email | sms | meeting | note
  subject text,
  body text,
  meta jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  due_at timestamptz not null,
  reason text,
  status text not null default 'open', -- open | done | snoozed | cancelled
  ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── RECRUITING ──────────────────────────────────────────────────
create type recruit_stage_enum as enum (
  'Invited', 'Onboarding', 'Contracted', 'Licensed', 'Appointed', 'Active', 'Dropped'
);

create table recruiting_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  state text,
  source text,
  recruiter_rep_id uuid references reps(id) on delete set null,
  stage recruit_stage_enum not null default 'Invited',
  invited_at timestamptz not null default now(),
  next_step text,
  contract_signed_at timestamptz,
  license_verified_at timestamptz,
  appointed_carriers jsonb not null default '[]',
  meta jsonb not null default '{}'
);

-- ─── RLS (stubs — tighten before prod) ───────────────────────────
-- TODO: enable RLS on every table:
--   alter table deals enable row level security;
-- TODO: per-org isolation:
--   create policy "deals_same_org" on deals for all
--     using (org_id = (select org_id from users where id = auth.uid()));
-- TODO: AGENT role can only see own deals (or downline);
-- MANAGER sees downline; OWNER sees org.
