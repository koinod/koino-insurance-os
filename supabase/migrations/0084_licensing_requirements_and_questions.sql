-- 0084_licensing_requirements_and_questions.sql
--
-- Tables backing the /licensing module (see page-licensing.jsx + lib/licensing-data.json).
--
-- public.licensing_requirements — one row per (state_code, line) carrying
--   the cited primary-source values that drive the requirements card. RLS:
--   readable by anyone authenticated (global reference data, same pattern as
--   public.carriers global rows). Writable only by super_admin.
--
-- public.licensing_questions — practice-exam question bank, per (state_code,
--   line, domain). Same read/write pattern.
--
-- Both tables carry research_pending so the UI shows the honest "no cited
-- data yet" state instead of fabricated values — per repo principle #5
-- "No data without a source. No rule without a citation."
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration 2026-06-03.

create table if not exists public.licensing_requirements (
  id                            uuid primary key default gen_random_uuid(),
  state_code                    text not null check (state_code ~ '^[A-Z]{2}$'),
  line                          text not null check (line in ('life','health','annuity','mortgage_protection')),
  research_pending              boolean not null default true,
  research_pending_reason       text,
  prelicense_hours_required     int,
  prelicense_required_course    boolean,
  approved_course_vendors       jsonb,
  exam_vendor                   text check (exam_vendor in ('PSI','PEARSON_VUE','PROMETRIC','EXAMFX','OTHER') or exam_vendor is null),
  exam_fee_usd                  int,
  exam_passing_score_pct        int check (exam_passing_score_pct is null or (exam_passing_score_pct between 0 and 100)),
  exam_question_count           int,
  exam_time_minutes             int,
  fingerprint_required          boolean,
  fingerprint_vendor            text,
  fingerprint_code              text,
  fingerprint_fee_usd           int,
  license_application_fee_usd   int,
  license_renewal_years         int,
  ce_hours_per_cycle            int,
  ce_ethics_hours               int,
  background_check              text,
  nipr_path_url                 text,
  state_doi_url                 text,
  reciprocity_notes             text,
  license_type_note             text,
  marketing_rule_notes          text,
  marketing_rule_statute        text,
  source_url                    text,
  source_quote                  text,
  captured_at                   timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (state_code, line)
);

create index if not exists licensing_requirements_state_idx on public.licensing_requirements(state_code);
create index if not exists licensing_requirements_line_idx  on public.licensing_requirements(line);

alter table public.licensing_requirements enable row level security;

drop policy if exists "licensing_requirements_read_all_auth" on public.licensing_requirements;
create policy "licensing_requirements_read_all_auth"
  on public.licensing_requirements for select
  to authenticated
  using (true);

drop policy if exists "licensing_requirements_super_admin_write" on public.licensing_requirements;
create policy "licensing_requirements_super_admin_write"
  on public.licensing_requirements for all
  to authenticated
  using (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid() and am.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid() and am.role = 'super_admin'
    )
  );


create table if not exists public.licensing_questions (
  id                uuid primary key default gen_random_uuid(),
  state_code        text not null check (state_code ~ '^[A-Z]{2}$' or state_code = 'XX'),
  line              text not null check (line in ('life','health','annuity','mortgage_protection')),
  domain            text not null,
  stem              text not null,
  options           jsonb not null,
  correct_index     int  not null check (correct_index between 0 and 3),
  explanation       text,
  difficulty        text check (difficulty in ('easy','medium','hard') or difficulty is null),
  source_url        text,
  source_quote      text,
  created_at        timestamptz not null default now()
);

create index if not exists licensing_questions_state_line_idx on public.licensing_questions(state_code, line);
create index if not exists licensing_questions_domain_idx     on public.licensing_questions(domain);

alter table public.licensing_questions enable row level security;

drop policy if exists "licensing_questions_read_all_auth" on public.licensing_questions;
create policy "licensing_questions_read_all_auth"
  on public.licensing_questions for select
  to authenticated
  using (true);

drop policy if exists "licensing_questions_super_admin_write" on public.licensing_questions;
create policy "licensing_questions_super_admin_write"
  on public.licensing_questions for all
  to authenticated
  using (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid() and am.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.agency_members am
      where am.user_id = auth.uid() and am.role = 'super_admin'
    )
  );

do $$
declare
  has_req  boolean;
  has_qs   boolean;
  rls_req  boolean;
  rls_qs   boolean;
begin
  select to_regclass('public.licensing_requirements') is not null into has_req;
  select to_regclass('public.licensing_questions')    is not null into has_qs;
  select relrowsecurity from pg_class where relname='licensing_requirements' and relnamespace=(select oid from pg_namespace where nspname='public') into rls_req;
  select relrowsecurity from pg_class where relname='licensing_questions'    and relnamespace=(select oid from pg_namespace where nspname='public') into rls_qs;
  if not has_req then raise exception 'public.licensing_requirements missing'; end if;
  if not has_qs  then raise exception 'public.licensing_questions missing';    end if;
  if not rls_req then raise exception 'public.licensing_requirements RLS not enabled'; end if;
  if not rls_qs  then raise exception 'public.licensing_questions RLS not enabled';    end if;
end $$;
