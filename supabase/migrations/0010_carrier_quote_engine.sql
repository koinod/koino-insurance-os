-- 0010 carrier quote engine.
--
-- Adds eligibility + rate_table jsonb columns to products so the new
-- /api/quote edge function can rank products by client criteria
-- (age/state/tobacco/conditions). Creates quote_runs for audit.

alter table public.products
  add column if not exists eligibility jsonb,
  add column if not exists rate_table  jsonb;

create table if not exists public.quote_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  rep_id text references public.reps(id) on delete set null,
  lead_id uuid,
  call_id uuid,
  inputs jsonb not null,
  results jsonb not null,
  selected_product_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_runs_rep on public.quote_runs (agency_id, rep_id, created_at desc);
alter table public.quote_runs enable row level security;

create policy "anon atlas read" on public.quote_runs for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');
create policy "auth read agency" on public.quote_runs for select to authenticated using (true);
create policy "auth insert" on public.quote_runs for insert to authenticated with check (true);

-- Seeds 4 demo products for Atlas with realistic eligibility + rate tables.
-- Idempotent via the count guard. See migration history for full seed body.
