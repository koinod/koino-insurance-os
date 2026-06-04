-- 0085_licensing_guide_sections_and_variety_scope.sql
--
-- Two pieces:
--  1. public.licensing_guide_sections — pre-stored study-guide sections keyed
--     by (state_code, variety_id, section_number). When the rep clicks a
--     section in /licensing, the page checks this table first (one cheap
--     row read) and only falls back to live LLM generation if no pre-stored
--     row exists. This avoids the 5-10s wait per section + the per-section
--     LLM cost for the highest-traffic varieties.
--  2. Add variety_id to public.licensing_questions so the practice bank can
--     be scoped per exam variety (CA Life-Only vs VA Series 11-05 have
--     wildly different weightings). The existing (state_code, line) tuple
--     stays.
--
-- Both tables are public reference data: anyone authenticated reads;
-- super_admin writes (the batch generator runs under the service role and
-- bypasses RLS).
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration 2026-06-03.

create table if not exists public.licensing_guide_sections (
  id                uuid primary key default gen_random_uuid(),
  state_code        text not null check (state_code ~ '^[A-Z]{2}$'),
  variety_id        text not null,
  section_number    text not null,
  domain            text,
  weight_pct        int,
  section_doc       jsonb not null,
  model             text,
  generated_at      timestamptz not null default now(),
  unique (state_code, variety_id, section_number)
);
create index if not exists licensing_guide_sections_state_variety_idx on public.licensing_guide_sections(state_code, variety_id);

alter table public.licensing_guide_sections enable row level security;

drop policy if exists "licensing_guide_sections_read_all_auth" on public.licensing_guide_sections;
create policy "licensing_guide_sections_read_all_auth"
  on public.licensing_guide_sections for select
  to authenticated
  using (true);

drop policy if exists "licensing_guide_sections_super_admin_write" on public.licensing_guide_sections;
create policy "licensing_guide_sections_super_admin_write"
  on public.licensing_guide_sections for all
  to authenticated
  using (
    exists (select 1 from public.agency_members am where am.user_id = auth.uid() and am.role = 'super_admin')
  )
  with check (
    exists (select 1 from public.agency_members am where am.user_id = auth.uid() and am.role = 'super_admin')
  );

alter table public.licensing_questions
  add column if not exists variety_id text;
create index if not exists licensing_questions_variety_idx on public.licensing_questions(variety_id) where variety_id is not null;

do $$
declare has_sec boolean; has_col boolean;
begin
  select to_regclass('public.licensing_guide_sections') is not null into has_sec;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='licensing_questions' and column_name='variety_id'
  ) into has_col;
  if not has_sec then raise exception 'public.licensing_guide_sections missing'; end if;
  if not has_col then raise exception 'licensing_questions.variety_id column missing'; end if;
end $$;
