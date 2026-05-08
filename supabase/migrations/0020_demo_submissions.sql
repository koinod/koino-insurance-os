-- 0020 Demo website submissions.
--
-- Provides a separate table for leads captured via the "Demo Website" page
-- (separated from the main application leads in 'pipeline').
--
-- This ensures demo visitors can submit their info without polluting
-- real agency pipelines.

create table if not exists public.demo_submissions (
  id            uuid primary key default gen_random_uuid(),
  full_name     text,
  email         text,
  phone         text,
  company       text,
  tech_count    integer,
  message       text,
  created_at    timestamptz not null default now(),
  source_url    text,
  ip_address    text,
  metadata      jsonb
);

-- RLS
alter table public.demo_submissions enable row level security;

-- Anon can insert (from landing page)
create policy "anon insert demo_submissions" on public.demo_submissions
  for insert to anon with check (true);

-- Only super_admin can read all submissions
create policy "superadmin read demo_submissions" on public.demo_submissions
  for select to authenticated
  using (exists (
    select 1 from public.agency_members m
     where m.user_id = auth.uid()
       and m.role    = 'super_admin'
       and m.active  = true
  ));
