-- 0086_licensing_public_read.sql
--
-- /licensing is a public-facing standalone surface (licensing.html, no
-- auth gate) — recruits should be able to land on it without a Repflow
-- account. The data tables backing it (licensing_requirements,
-- licensing_questions, licensing_guide_sections) need to be readable
-- by the anon role, not just authenticated users. Writes stay
-- super_admin-only via the existing policies.
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration 2026-06-03.

drop policy if exists "licensing_requirements_read_anon" on public.licensing_requirements;
create policy "licensing_requirements_read_anon"
  on public.licensing_requirements for select
  to anon
  using (true);

drop policy if exists "licensing_questions_read_anon" on public.licensing_questions;
create policy "licensing_questions_read_anon"
  on public.licensing_questions for select
  to anon
  using (true);

drop policy if exists "licensing_guide_sections_read_anon" on public.licensing_guide_sections;
create policy "licensing_guide_sections_read_anon"
  on public.licensing_guide_sections for select
  to anon
  using (true);

do $$
declare cnt int;
begin
  select count(*) into cnt from pg_policies
   where schemaname='public'
     and tablename in ('licensing_requirements','licensing_questions','licensing_guide_sections')
     and 'anon' = ANY (roles);
  if cnt < 3 then raise exception 'expected ≥3 anon select policies, got %', cnt; end if;
end $$;
