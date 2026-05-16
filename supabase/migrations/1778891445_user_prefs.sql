-- 1778891445_user_prefs.sql
-- Per-rep persisted preferences (autodial queue, saved kanban filters, etc.)
--
-- Schema: rep_id is text (matches public.reps.id slug — not uuid as the
-- spec suggested). Values are jsonb so each pref key can carry arbitrary
-- shape (the autodial queue is an array of {id, lead, phone, _addedAt}
-- objects).
--
-- RLS: rep only reads/writes their own row. Resolves auth.uid() → rep_id
-- via public.agency_members (the canonical mapping table; there is no
-- public.users table — the spec's `from public.users where id = auth.uid()`
-- doesn't apply to this schema).

create table if not exists public.user_prefs (
  rep_id      text not null,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  primary key (rep_id, key)
);

alter table public.user_prefs enable row level security;

drop policy if exists user_prefs_self on public.user_prefs;
create policy user_prefs_self on public.user_prefs
  for all
  using (
    rep_id in (
      select rep_id from public.agency_members
       where user_id = auth.uid()
         and active = true
         and rep_id is not null
    )
  )
  with check (
    rep_id in (
      select rep_id from public.agency_members
       where user_id = auth.uid()
         and active = true
         and rep_id is not null
    )
  );

create index if not exists user_prefs_rep_idx on public.user_prefs(rep_id);
