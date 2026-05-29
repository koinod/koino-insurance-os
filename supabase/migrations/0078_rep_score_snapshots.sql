-- 0078_rep_score_snapshots.sql
-- GAP-X1 predictive engine — PERSISTENCE. The risk/breakout heuristics were
-- computed client-side each render off live reps.* columns (no history, no
-- trend, recomputed per viewer). This table stores a daily server-computed
-- snapshot per rep so scores are durable, trendable, and consistent across
-- viewers. Written nightly by /api/cron/score-reps (service role); read by
-- the Today predictive cards. SHAPE only — no seed data.

create table if not exists public.rep_score_snapshots (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  rep_id         text not null references public.reps(id)     on delete cascade,
  as_of_date     date not null default (now() at time zone 'utc')::date,
  risk_score     int  not null default 0,
  breakout_score int  not null default 0,
  inputs         jsonb,
  created_at     timestamptz not null default now(),
  unique (rep_id, as_of_date)
);

create index if not exists idx_rep_score_snapshots_agency_date
  on public.rep_score_snapshots(agency_id, as_of_date desc);

alter table public.rep_score_snapshots enable row level security;

-- Read: scoped to the caller's agency. Writes are service-role only (the
-- nightly cron), which bypasses RLS — so no insert/update policy is needed.
drop policy if exists rep_score_snapshots_read on public.rep_score_snapshots;
create policy rep_score_snapshots_read on public.rep_score_snapshots
  for select using (agency_id = public.current_agency_id());

comment on table public.rep_score_snapshots is
  'Daily per-rep predictive scores (risk/breakout), computed server-side by /api/cron/score-reps. inputs holds the raw signals for transparency. Read by Today predictive cards.';

-- Verify the table + policy landed (fail loudly on partial apply).
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='rep_score_snapshots') then
    raise exception 'rep_score_snapshots table was not created';
  end if;
  if not exists (select 1 from pg_policies
                 where tablename='rep_score_snapshots' and policyname='rep_score_snapshots_read') then
    raise exception 'rep_score_snapshots_read policy missing';
  end if;
end $$;
