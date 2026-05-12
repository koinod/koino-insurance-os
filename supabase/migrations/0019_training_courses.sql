-- 0019 training courses (product-training surface, currently localStorage-only)
--
-- Promotes page-extras.jsx ProductTraining from localStorage to Supabase so
-- owners + managers can author + assign once, and reps see the same library
-- across devices. Mirrors the existing client shape:
--   { id, title, track, dur_min, required, description, sections: [...] }
-- with sections stored as JSONB to preserve the nested section→lesson tree
-- the CourseBuilder modal already produces.
--
-- Auth model: scoped by agency via viewer_agency_ids() (matches 0015), plus
-- anon read of demo agency for the public Atlas demo.
--
-- Authorship gate: owners + managers (agency_members.role in those values)
-- can write courses + assignments. Reps own their own progress rows.

------------------------------------------------------------------------------
-- 0. helper: is the current viewer a manager-or-higher in the given agency?
------------------------------------------------------------------------------
create or replace function public.viewer_is_manager_in(p_agency_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_members
     where user_id = auth.uid()
       and agency_id = p_agency_id
       and active = true
       and role in ('owner','imo_owner','super_admin','manager')
  );
$$;
grant execute on function public.viewer_is_manager_in(uuid) to authenticated;

------------------------------------------------------------------------------
-- 1. training_courses — sections live in a jsonb blob so the existing
--    CourseBuilder UI (page-extras.jsx) keeps working without an ORM rewrite.
------------------------------------------------------------------------------
create table if not exists public.training_courses (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  slug          text,
  title         text not null,
  track         text,                                  -- "FE", "Compliance", "AEP", etc.
  description   text,
  dur_min       int,
  required      boolean not null default false,
  -- nested course tree: [{ title, lessons: [{ title, video_url, description }] }]
  sections      jsonb not null default '[]'::jsonb,
  -- target_roles drives who sees the course on /training. Empty/null = all.
  target_roles  text[] not null default array['owner','manager','rep']::text[],
  display_order int not null default 100,
  is_published  boolean not null default true,
  archived      boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists training_courses_agency_idx
  on public.training_courses (agency_id, display_order)
  where archived = false;
create index if not exists training_courses_track_idx
  on public.training_courses (agency_id, track)
  where archived = false;

create or replace function public.training_courses_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists training_courses_updated_at on public.training_courses;
create trigger training_courses_updated_at
  before update on public.training_courses
  for each row execute function public.training_courses_set_updated_at();

------------------------------------------------------------------------------
-- 2. training_assignments — owner/manager assigns a course to one or many reps
------------------------------------------------------------------------------
create table if not exists public.training_assignments (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  course_id     uuid not null references public.training_courses(id) on delete cascade,
  rep_id        text not null references public.reps(id) on delete cascade,
  due_at        date,
  assigned_by   uuid references auth.users(id) on delete set null,
  assigned_at   timestamptz not null default now(),
  unique (course_id, rep_id)
);
create index if not exists training_assignments_rep_idx
  on public.training_assignments (rep_id, due_at);
create index if not exists training_assignments_agency_idx
  on public.training_assignments (agency_id, course_id);

------------------------------------------------------------------------------
-- 3. training_progress — one row per (rep, lesson). lesson_key is the
--    "section_idx.lesson_idx" pair the client already uses, so the JSON
--    structure stays positional. Cleaner than encoding lessons as their own
--    rows when the entire authoring UI assumes nested order.
------------------------------------------------------------------------------
create table if not exists public.training_progress (
  rep_id       text not null references public.reps(id) on delete cascade,
  course_id    uuid not null references public.training_courses(id) on delete cascade,
  lesson_key   text not null,                          -- e.g. "0.2"
  completed_at timestamptz not null default now(),
  primary key (rep_id, course_id, lesson_key)
);
create index if not exists training_progress_course_idx
  on public.training_progress (course_id, rep_id);

------------------------------------------------------------------------------
-- 4. RLS
------------------------------------------------------------------------------
alter table public.training_courses     enable row level security;
alter table public.training_assignments enable row level security;
alter table public.training_progress    enable row level security;

-- training_courses --------------------------------------------------------
drop policy if exists "anon atlas read courses" on public.training_courses;
create policy "anon atlas read courses" on public.training_courses
  for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9' and is_published = true and archived = false);

drop policy if exists "tenant read courses" on public.training_courses;
create policy "tenant read courses" on public.training_courses
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

drop policy if exists "manager write courses" on public.training_courses;
create policy "manager write courses" on public.training_courses
  for all to authenticated
  using (public.viewer_is_manager_in(agency_id))
  with check (public.viewer_is_manager_in(agency_id));

-- training_assignments ----------------------------------------------------
drop policy if exists "anon atlas read assignments" on public.training_assignments;
create policy "anon atlas read assignments" on public.training_assignments
  for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');

drop policy if exists "tenant read assignments" on public.training_assignments;
create policy "tenant read assignments" on public.training_assignments
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));

drop policy if exists "manager write assignments" on public.training_assignments;
create policy "manager write assignments" on public.training_assignments
  for all to authenticated
  using (public.viewer_is_manager_in(agency_id))
  with check (public.viewer_is_manager_in(agency_id));

-- training_progress -------------------------------------------------------
-- Reps read + write their own; managers/owners read their team's progress.
drop policy if exists "anon atlas read progress" on public.training_progress;
create policy "anon atlas read progress" on public.training_progress
  for select to anon
  using (
    course_id in (
      select id from public.training_courses
       where agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
    )
  );

drop policy if exists "tenant read progress" on public.training_progress;
create policy "tenant read progress" on public.training_progress
  for select to authenticated
  using (
    course_id in (
      select id from public.training_courses
       where agency_id in (select public.viewer_agency_ids())
    )
  );

drop policy if exists "rep write own progress" on public.training_progress;
create policy "rep write own progress" on public.training_progress
  for all to authenticated
  using (rep_id = (select rep_id from public.me() limit 1))
  with check (rep_id = (select rep_id from public.me() limit 1));

------------------------------------------------------------------------------
-- 5. grants
------------------------------------------------------------------------------
grant select on public.training_courses                           to anon, authenticated;
grant select on public.training_assignments                       to anon, authenticated;
grant select on public.training_progress                          to anon, authenticated;
grant insert, update, delete on public.training_courses           to authenticated;
grant insert, update, delete on public.training_assignments       to authenticated;
grant insert, update, delete on public.training_progress          to authenticated;

------------------------------------------------------------------------------
-- 6. realtime
------------------------------------------------------------------------------
alter publication supabase_realtime add table public.training_courses;
alter publication supabase_realtime add table public.training_assignments;
alter publication supabase_realtime add table public.training_progress;
