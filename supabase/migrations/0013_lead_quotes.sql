-- 0013 lead quotes.
--
-- The InCall Carrier Quote tool computes a ranked carrier list per call but
-- the quote is disposable today — close the call and the math is gone.
-- This table persists the snapshot so the rep (or their manager) can come
-- back and see what was offered, why, and what the recommendation was.

create table if not exists public.lead_quotes (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null,
  lead_id       uuid references public.pipeline(id) on delete set null,
  rep_id        text references public.reps(id)    on delete set null,
  product       text,                                -- 'medsupp' | 'fe' | 'term' | 'iul' | 'annuity' | 'mapd'
  inputs        jsonb not null,                      -- { age, state, gender, tobacco, bmi, healthDetail }
  ranked        jsonb not null,                      -- [{carrierId, name, score, reason, monthly?}]
  recommended_carrier_id text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists lead_quotes_agency_idx on public.lead_quotes (agency_id);
create index if not exists lead_quotes_lead_idx   on public.lead_quotes (lead_id, created_at desc);
create index if not exists lead_quotes_rep_idx    on public.lead_quotes (rep_id, created_at desc);

alter table public.lead_quotes enable row level security;

drop policy if exists "anon atlas read" on public.lead_quotes;
create policy "anon atlas read" on public.lead_quotes for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "auth agency read" on public.lead_quotes;
create policy "auth agency read" on public.lead_quotes for select to authenticated
  using (agency_id = (select agency_id from public.me() limit 1));

drop policy if exists "auth agency write" on public.lead_quotes;
create policy "auth agency write" on public.lead_quotes for all to authenticated
  using (agency_id = (select agency_id from public.me() limit 1))
  with check (agency_id = (select agency_id from public.me() limit 1));
