-- 0103_retire_starter_scripts.sql
--
-- Remove the seeded/test starter scripts from every agency and stop future
-- agencies from inheriting script seeds. Managers can still create their own
-- scripts in the UI and import them from text, Google Docs, or PDFs.

delete from public.agency_scripts
 where is_starter = true;

delete from public.agency_scripts
 where agency_id = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'
   and title in (
     'Med Supp — Plan G open',
     'Final Expense — empathy',
     'TPMO disclosure (verbatim)',
     'AEP — switch reasons'
   );

create or replace function public.vault_seed_starter_for_agency(p_agency_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.training_courses
    (agency_id, title, track, description, dur_min, required, sections,
     target_roles, is_starter, is_published)
  select p_agency_id,
         'Repflow Intro for Reps','Onboarding',
         'Day-one orientation: where to find leads, how to dial, what to log, and the three rules that keep the floor running clean.',
         18, true,
         '[{"title":"The floor","lessons":[{"title":"Walk the floor in 60 seconds","videoUrl":"","description":"Where leads land, where calls happen, where you log."},{"title":"The three rules","videoUrl":"","description":"Log every call. Disposition every lead. Never skip the SOA."}]},{"title":"Your first dial","lessons":[{"title":"Pre-call: read the lead in 10 seconds","videoUrl":"","description":"Source, age, product, last touch — that''s all you need."},{"title":"The open","videoUrl":"","description":"Name, agency, reason. Stop. Listen."}]}]'::jsonb,
         array['rep','manager']::text[], true, true
   where not exists (
     select 1 from public.training_courses
      where agency_id = p_agency_id and title = 'Repflow Intro for Reps' and is_starter = true);

  insert into public.training_courses
    (agency_id, title, track, description, dur_min, required, sections,
     target_roles, is_starter, is_published)
  select p_agency_id,
         'Lead Drip 101','Onboarding',
         'How the drip engine fires: triggers, segments, throttles, and what a rep sees vs what runs in the background.',
         14, false,
         '[{"title":"What drip actually does","lessons":[{"title":"Why drip exists","videoUrl":"","description":"You can''t personally touch 800 leads. Drip can."},{"title":"Triggers vs sequences","videoUrl":"","description":"Trigger = what fires it. Sequence = the steps that run."}]},{"title":"Segments","lessons":[{"title":"How segments target reps","videoUrl":"","description":"Filter rules pick leads. The same segment can drive a drip and a campaign."}]}]'::jsonb,
         array['rep','manager','owner']::text[], true, true
   where not exists (
     select 1 from public.training_courses
      where agency_id = p_agency_id and title = 'Lead Drip 101' and is_starter = true);

  insert into public.training_courses
    (agency_id, title, track, description, dur_min, required, sections,
     target_roles, is_starter, is_published)
  select p_agency_id,
         'Quoting Cycle Walkthrough','FE',
         'Quote → application → underwriting → policy issued. Where the rep''s job ends and the back office picks up.',
         22, true,
         '[{"title":"The quote","lessons":[{"title":"Pulling a real rate in under 60s","videoUrl":"","description":"Use Auto-Quoter. Don''t freelance carrier sheets."},{"title":"Reading the rate card","videoUrl":"","description":"What the columns mean and what to never promise."}]},{"title":"After the quote","lessons":[{"title":"The application","videoUrl":"","description":"What the e-app actually captures and what underwriting will re-ask."},{"title":"Issue + first payment","videoUrl":"","description":"Why the policy isn''t real until the bank draft hits."}]}]'::jsonb,
         array['rep','manager','owner']::text[], true, true
   where not exists (
     select 1 from public.training_courses
      where agency_id = p_agency_id and title = 'Quoting Cycle Walkthrough' and is_starter = true);
end;
$$;
