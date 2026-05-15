-- 0035_vault_starter_content.sql
-- Starter content for every agency: 3 courses + 5 scripts marked is_starter=true.
--
-- Live agencies that just landed on the new Vault CREATE surface need something
-- to walk on — empty grids feel broken even when "no-courses" is the truthful
-- state. These rows are pinned with is_starter=true so the UI can render a
-- "starter" chip and so an admin sweep can delete or refresh them later.
--
-- Idempotency: keyed on (agency_id, title, is_starter=true). The DO block uses
-- NOT EXISTS to skip rows already present, so re-running this migration is a
-- no-op. New agencies created after this migration runs will NOT inherit the
-- starter rows automatically — that path can be added later via a trigger if
-- the team wants every newly provisioned agency to pre-populate.

do $$
declare a uuid;
begin
  for a in select id from public.agencies loop

    -- ── Courses ────────────────────────────────────────────────────────────
    if not exists (
      select 1 from public.training_courses
       where agency_id = a and title = 'Repflow Intro for Reps' and is_starter = true
    ) then
      insert into public.training_courses
        (agency_id, title, track, description, dur_min, required, sections,
         target_roles, is_starter, is_published)
      values (
        a,
        'Repflow Intro for Reps',
        'Onboarding',
        'Day-one orientation: where to find leads, how to dial, what to log, and the three rules that keep the floor running clean.',
        18,
        true,
        '[
          {"title":"The floor","lessons":[
            {"title":"Walk the floor in 60 seconds","videoUrl":"","description":"Where leads land, where calls happen, where you log."},
            {"title":"The three rules","videoUrl":"","description":"Log every call. Disposition every lead. Never skip the SOA."}
          ]},
          {"title":"Your first dial","lessons":[
            {"title":"Pre-call: read the lead in 10 seconds","videoUrl":"","description":"Source, age, product, last touch — that''s all you need."},
            {"title":"The open","videoUrl":"","description":"Name, agency, reason. Stop. Listen."}
          ]}
        ]'::jsonb,
        array['rep','manager']::text[],
        true,
        true
      );
    end if;

    if not exists (
      select 1 from public.training_courses
       where agency_id = a and title = 'Lead Drip 101' and is_starter = true
    ) then
      insert into public.training_courses
        (agency_id, title, track, description, dur_min, required, sections,
         target_roles, is_starter, is_published)
      values (
        a,
        'Lead Drip 101',
        'Onboarding',
        'How the drip engine fires: triggers, segments, throttles, and what a rep sees vs what runs in the background.',
        14,
        false,
        '[
          {"title":"What drip actually does","lessons":[
            {"title":"Why drip exists","videoUrl":"","description":"You can''t personally touch 800 leads. Drip can."},
            {"title":"Triggers vs sequences","videoUrl":"","description":"Trigger = what fires it. Sequence = the steps that run."}
          ]},
          {"title":"Segments","lessons":[
            {"title":"How segments target reps","videoUrl":"","description":"Filter rules pick leads. The same segment can drive a drip and a campaign."}
          ]}
        ]'::jsonb,
        array['rep','manager','owner']::text[],
        true,
        true
      );
    end if;

    if not exists (
      select 1 from public.training_courses
       where agency_id = a and title = 'Quoting Cycle Walkthrough' and is_starter = true
    ) then
      insert into public.training_courses
        (agency_id, title, track, description, dur_min, required, sections,
         target_roles, is_starter, is_published)
      values (
        a,
        'Quoting Cycle Walkthrough',
        'FE',
        'Quote → application → underwriting → policy issued. Where the rep''s job ends and the back office picks up.',
        22,
        true,
        '[
          {"title":"The quote","lessons":[
            {"title":"Pulling a real rate in under 60s","videoUrl":"","description":"Use Auto-Quoter. Don''t freelance carrier sheets."},
            {"title":"Reading the rate card","videoUrl":"","description":"What the columns mean and what to never promise."}
          ]},
          {"title":"After the quote","lessons":[
            {"title":"The application","videoUrl":"","description":"What the e-app actually captures and what underwriting will re-ask."},
            {"title":"Issue + first payment","videoUrl":"","description":"Why the policy isn''t real until the bank draft hits."}
          ]}
        ]'::jsonb,
        array['rep','manager','owner']::text[],
        true,
        true
      );
    end if;

    -- ── Scripts ────────────────────────────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a and title = 'Cold Open' and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (
        a,
        'Cold Open',
        'Cold',
        'v1.0',
        E'Hi {{lead_first}}, this is {{rep_first}} with {{agency}}. The reason for my call is simple — you filled out a request to look at coverage and I wanted to give you a real answer instead of more spam.\n\nQuick question: when you put in that request, was it for yourself or for someone else in your household?',
        'Standard cold-lead open. Earns 15 seconds by being honest about why you''re calling.',
        array['rep','manager']::text[],
        true
      );
    end if;

    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a and title = 'Voicemail #1' and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (
        a,
        'Voicemail #1',
        'Voicemail',
        'v1.0',
        E'Hi {{lead_first}}, {{rep_first}} with {{agency}} — you reached out about coverage and I wanted to make sure your request didn''t fall through the cracks. I''ll try you again later today. If now''s a better time, my number''s {{rep_phone}}. Talk soon.',
        'First voicemail. Keep it short. Mention they reached out.',
        array['rep','manager']::text[],
        true
      );
    end if;

    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a and title = 'Voicemail #2' and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (
        a,
        'Voicemail #2',
        'Voicemail',
        'v1.0',
        E'{{lead_first}}, it''s {{rep_first}} again. I''m going to assume the rate quotes are no longer something you''re looking at — I''ll close out your request unless I hear back. If you do want me to send what I found, just text the word ''rate'' to {{rep_phone}}.',
        'Second voicemail — soft takeaway. Often pulls a reply when #1 didn''t.',
        array['rep','manager']::text[],
        true
      );
    end if;

    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a and title = 'Storm-season Inbound' and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (
        a,
        'Storm-season Inbound',
        'Warm',
        'v1.0',
        E'Hi {{lead_first}}, thanks for calling {{agency}}. I see you''re in {{lead_state}} — before we look at coverage, is there an active claim or a property impact I should know about right now?\n\n[Wait for answer.]\n\nGood. Quick way I work: I''ll ask three questions, pull a real rate, and you''ll know what your options look like before we hang up.',
        'For warm inbound during storm/hurricane/wildfire surges. Lead with claim-safety, then move to discovery.',
        array['rep','manager']::text[],
        true
      );
    end if;

    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a and title = 'Objection — "I''m not interested"' and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (
        a,
        'Objection — "I''m not interested"',
        'Objection',
        'v1.0',
        E'Totally fair — and most people aren''t, until they see a number. Can I ask: is it that you''ve already got coverage you''re happy with, or that the timing''s just bad right now?\n\n[If already covered:] Got it — I''m not here to replace what works. The one thing worth a 30-second check is the renewal rate, because that''s where most carriers quietly bump people 8-12% this year. Want me to pull what your current carrier is filing?\n\n[If timing:] I get it. The rate I''d quote you today is locked for 30 days — I can text it over, you look at it on your time, and if it doesn''t beat what you''ve got, you delete the text. Fair?',
        'Two-fork objection handler. Don''t argue — sort.',
        array['rep','manager']::text[],
        true
      );
    end if;

  end loop;
end $$;
