-- 0030 — public.client_errors table.
-- Captures runtime JS errors reported by lib/error-reporter.js via
-- /api/client-error. Reads restricted to super_admin (only Ian for now);
-- writes open to anon because errors may happen before auth resolves.

create table if not exists public.client_errors (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  message      text not null,
  stack        text,
  source       text,
  line_num     int,
  column_num   int,
  page_url     text,
  user_agent   text,
  viewer       jsonb,
  kind         text default 'error',
  -- denormalized convenience columns for grep-style queries; populated by trigger
  rep_id       text generated always as ((viewer->>'rep_id')) stored,
  agency_id    text generated always as ((viewer->>'agency_id')) stored,
  role         text generated always as ((viewer->>'role')) stored
);

create index if not exists client_errors_occurred_at_idx on public.client_errors (occurred_at desc);
create index if not exists client_errors_kind_idx        on public.client_errors (kind);
create index if not exists client_errors_agency_idx      on public.client_errors (agency_id);

alter table public.client_errors enable row level security;

-- Anon can INSERT only. Used by /api/client-error which talks to PostgREST
-- with the anon key.
drop policy if exists "client_errors_insert_anon" on public.client_errors;
create policy "client_errors_insert_anon" on public.client_errors
  for insert
  to anon, authenticated
  with check (true);

-- Reads restricted to super_admin members. Add other readers when needed.
drop policy if exists "client_errors_read_super_admin" on public.client_errors;
create policy "client_errors_read_super_admin" on public.client_errors
  for select
  to authenticated
  using (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid()
        and am.role = 'super_admin'
    )
  );

comment on table public.client_errors is
  'Runtime JS errors reported by browser. Read with: select occurred_at, kind, message, agency_id, role, page_url from public.client_errors order by occurred_at desc limit 50;';
