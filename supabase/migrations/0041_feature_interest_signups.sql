-- 0041_feature_interest_signups.sql
-- Lightweight signal capture for "notify me when X ships" CTAs across the app.
-- First consumer: ComposerInterestModal in shared.jsx (Customize-your-sidebar v2).
-- Reusable for any future "would you use this?" widget — feature column is
-- arbitrary text so we don't need a new table per feature.

create table if not exists public.feature_interest_signups (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete cascade,
  agency_id   uuid        references public.agencies(id) on delete set null,
  feature     text        not null,
  created_at  timestamptz not null default now(),
  unique (user_id, feature)
);

create index if not exists feature_interest_feature_idx
  on public.feature_interest_signups (feature);

alter table public.feature_interest_signups enable row level security;

drop policy if exists "feature_interest_self" on public.feature_interest_signups;
create policy "feature_interest_self"
  on public.feature_interest_signups
  for all to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.feature_interest_signups to authenticated;
