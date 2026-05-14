-- 0026_vault_rework.sql
-- Vault rework: segments system + segment_id on resource tables + coaching-example flag
--
-- 1. vault_segments   — named content bundles ("AEP Bootcamp", "First 90 Days", …)
-- 2. segment_id cols  — nullable FK on agency_docs / agency_scripts / agency_videos
-- 3. is_coaching_example — bool flag on call_recordings for agency-wide pinning
--
-- SHAPE NOT DATA — no seed rows. Segments are created via /vault > Segments UI.

------------------------------------------------------------------------------
-- 1. vault_segments
------------------------------------------------------------------------------
create table if not exists public.vault_segments (
  id          uuid        primary key default gen_random_uuid(),
  agency_id   uuid        not null references public.agencies(id) on delete cascade,
  name        text        not null,
  description text,
  sort_order  int         not null default 100,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vault_segments_agency_idx
  on public.vault_segments (agency_id, sort_order);

create or replace function public.vault_segments_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists vault_segments_updated_at on public.vault_segments;
create trigger vault_segments_updated_at
  before update on public.vault_segments
  for each row execute function public.vault_segments_set_updated_at();

alter table public.vault_segments enable row level security;

drop policy if exists "anon atlas read vault_segments" on public.vault_segments;
create policy "anon atlas read vault_segments" on public.vault_segments
  for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "tenant read vault_segments" on public.vault_segments;
create policy "tenant read vault_segments" on public.vault_segments
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

drop policy if exists "manager write vault_segments" on public.vault_segments;
create policy "manager write vault_segments" on public.vault_segments
  for all to authenticated
  using (public.viewer_is_manager_in(agency_id))
  with check (public.viewer_is_manager_in(agency_id));

grant select                    on public.vault_segments to anon, authenticated;
grant insert, update, delete    on public.vault_segments to authenticated;

alter publication supabase_realtime add table public.vault_segments;

------------------------------------------------------------------------------
-- 2. segment_id on resource tables (nullable — items belong to at most one segment)
------------------------------------------------------------------------------
alter table public.agency_docs
  add column if not exists segment_id uuid
    references public.vault_segments(id) on delete set null;

alter table public.agency_scripts
  add column if not exists segment_id uuid
    references public.vault_segments(id) on delete set null;

alter table public.agency_videos
  add column if not exists segment_id uuid
    references public.vault_segments(id) on delete set null;

create index if not exists agency_docs_segment_idx
  on public.agency_docs (segment_id) where segment_id is not null;

create index if not exists agency_scripts_segment_idx
  on public.agency_scripts (segment_id) where segment_id is not null;

create index if not exists agency_videos_segment_idx
  on public.agency_videos (segment_id) where segment_id is not null;

------------------------------------------------------------------------------
-- 3. coaching-example flag on call_recordings
------------------------------------------------------------------------------
alter table call_recordings
  add column if not exists is_coaching_example boolean not null default false;

create index if not exists call_rec_coaching_example_idx
  on call_recordings (agency_id) where is_coaching_example = true;
