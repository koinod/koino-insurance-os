-- 0049 call_coaching_scores — AI-generated per-call coaching analysis.
--
-- Populated by /api/cron/score-recent-calls (runs every 30 min via Vercel cron).
-- One row per call_recording. Idempotent — re-running score_call() on the same
-- recording replaces the row via the UNIQUE constraint on call_recording_id.
--
-- RLS: rep sees own; manager/owner see agency. Service role writes.

set local search_path = public;

create table if not exists public.call_coaching_scores (
  id                  uuid primary key default gen_random_uuid(),
  call_recording_id   uuid references public.call_recordings(id) on delete cascade,
  agency_id           uuid references public.agencies(id) on delete cascade,
  rep_id              text,
  talk_ratio_pct      numeric,        -- rep's share of speaking time 0-100
  filler_count        int,            -- "um", "uh", "like" occurrences
  score               int check (score between 0 and 100),
  summary             text,           -- 2-3 sentence call summary
  objections          jsonb default '[]'::jsonb,       -- [{ objection, handling, verdict }]
  action_items        jsonb default '[]'::jsonb,       -- [{ item, owner, due }]
  coaching_points     jsonb default '[]'::jsonb,       -- [{ point, example, improvement }]
  sentiment_arc       jsonb default '[]'::jsonb,       -- [{ t_pct, sentiment: positive|neutral|negative }]
  model_used          text,
  scored_at           timestamptz not null default now(),
  unique (call_recording_id)
);

create index if not exists coaching_scores_agency_idx
  on public.call_coaching_scores (agency_id, scored_at desc);

create index if not exists coaching_scores_rep_idx
  on public.call_coaching_scores (rep_id, scored_at desc);

alter table public.call_coaching_scores enable row level security;

drop policy if exists "coaching_visible" on public.call_coaching_scores;
create policy "coaching_visible" on public.call_coaching_scores
  for select to authenticated
  using (public.is_super_admin() or agency_id = ANY (public.viewer_agency_ids()));

drop policy if exists "coaching_service_write" on public.call_coaching_scores;
create policy "coaching_service_write" on public.call_coaching_scores
  for all to service_role using (true) with check (true);
