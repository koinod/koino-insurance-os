-- 0050_vault_script_library.sql
--
-- Seeds 10 professional insurance call scripts into every agency.
-- Idempotent: keyed on (agency_id, title, is_starter = true).
-- Re-running is a no-op.
--
-- Categories: Cold, Voicemail (3), Warm, Objection (3), Persistency, Closing
-- Merge tags: {{lead_first}}, {{rep_first}}, {{agency}}, {{lead_state}}, {{rep_phone}}

do $$
declare
  a uuid;
begin
  for a in select id from public.agencies loop

    -- ── 1. Cold Open — FE Direct Mail ──────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'FE Cold Open — Direct Mail'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'FE Cold Open — Direct Mail',
        'Cold', 'v1.0',
        E'Hi {{lead_first}}, this is {{rep_first}} with {{agency}}.\n\nThe reason I''m reaching out — you sent back a reply card a while back asking for information about final expense coverage. I want to make sure your request didn''t fall through the cracks.\n\nReal quick — when you filled that out, were you looking for coverage for yourself, or for someone else in your household?\n\n[Wait. Listen.]\n\nGot it. I can pull a rate for you right now if you have 90 seconds. It won''t cost anything, and if the number makes sense for your budget, we can talk about it. If not, no pressure.',
        'Direct mail FE lead opener. Leads with the card they sent back — earns trust before quoting.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 2. Voicemail #1 — First Touch ──────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Voicemail #1 — First Touch'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Voicemail #1 — First Touch',
        'Voicemail', 'v1.0',
        E'Hi {{lead_first}}, this is {{rep_first}} with {{agency}} — calling because you reached out about coverage and I want to make sure your request didn''t get lost in the shuffle.\n\nI''ll try you again later today. If now''s actually a better time, my direct number is {{rep_phone}}. Talk soon.',
        'First voicemail drop. Under 20 seconds. Reference their request, don''t pitch.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 3. Voicemail #2 — Soft Takeaway ────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Voicemail #2 — Soft Takeaway'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Voicemail #2 — Soft Takeaway',
        'Voicemail', 'v1.0',
        E'{{lead_first}}, it''s {{rep_first}} again — just a quick follow-up.\n\nI''m going to assume the coverage quotes are no longer something you''re looking at, and I''ll go ahead and close out your request.\n\nIf I''ve got that wrong and you do want to see what I found, just text the word RATE to {{rep_phone}} and I''ll send it right over. No calls, no hassle.\n\nEither way, hope you have a great day.',
        'Second voicemail — soft takeaway creates urgency without pressure. Texting "RATE" re-opts them in.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 4. Voicemail #3 — Breakup ──────────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Voicemail #3 — Breakup'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Voicemail #3 — Breakup',
        'Voicemail', 'v1.0',
        E'{{lead_first}}, {{rep_first}} with {{agency}} — this is my last attempt to connect with you.\n\nI respect your time and I won''t keep calling. I''m going to close your file out today.\n\nIf anything ever changes — new quote, a different product, a question — you can always reach me at {{rep_phone}}. I''m easy to find.\n\nTake care.',
        'Final voicemail before moving lead to cold/lost. Clean exit preserves reputation.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 5. Warm Inbound Handler ─────────────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Warm Inbound — Referral or Web Lead'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Warm Inbound — Referral or Web Lead',
        'Warm', 'v1.0',
        E'Hi {{lead_first}}, thanks for calling {{agency}} — you reached the right place.\n\nBefore we dive in, I want to make sure I give you accurate information instead of just throwing quotes at you. Can I ask you three quick questions?\n\n1. What are you trying to cover — is this for you personally, or for a family member?\n2. Have you had coverage before, or is this a first-time look?\n3. What''s your rough budget range — are we thinking under $50 a month, or are you open to going higher if the numbers make sense?\n\n[Listen. Then:]\n\nPerfect. Based on what you just told me, I''ve got at least two options worth looking at. Let me pull those rates right now — this takes about 60 seconds.',
        'Warm inbound: referral or web-form leads. Three-question discovery before quoting.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 6. Objection — "I need to think about it" ──────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Objection — "I need to think about it"'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Objection — "I need to think about it"',
        'Objection', 'v1.0',
        E'Totally — and I respect that. Before I let you go, can I ask what specifically you''re thinking about?\n\nIs it the price? The product itself? Or is it more that you want to check with someone else before you decide?\n\n[Wait for answer.]\n\n[If price:] The rate I quoted you today is locked for 30 days. If you wait and come back next month, it could be different because of age-banding — one birthday can bump the rate 6-8%. I''m not trying to rush you, I just want you to know the window.\n\n[If product/unsure:] That''s fair. What if I sent you a one-page comparison — your two best options side by side — so you can look at it on your own time? Would that be helpful?',
        'Soft "think about it" objection. Two-fork: price urgency vs information bridge.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 7. Objection — "I already have coverage" ───────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Objection — "I already have coverage"'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Objection — "I already have coverage"',
        'Objection', 'v1.0',
        E'Good — that''s actually the best case. I''m not here to replace something that''s working.\n\nThe one thing worth a 30-second check: most carriers quietly increase premiums at renewal by 8-14%, especially in {{lead_state}} this year. You might be paying more than you need to for the exact same benefit.\n\nIf what you have is still the best rate, I''ll tell you that and you can hang up. If I can save you $30-50 a month, wouldn''t you want to know?\n\nWhat carrier are you currently with?',
        'Already-covered objection. Don''t argue — offer a rate comparison as a service.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 8. Objection — "I can't afford it" ─────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Objection — "I can''t afford it"'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Objection — "I can''t afford it"',
        'Objection', 'v1.0',
        E'I hear you — and I want to be straight with you. I have options that start as low as $18 a month. Most people are surprised when they see the actual number.\n\nCan I ask what a comfortable monthly number looks like for you?\n\n[Wait.]\n\nOk. Let me see what I can build around that. I''d rather find something in your range than sell you something that''s going to lapse because the payment''s too tight.\n\n[Pull the lowest available option that hits their number. Quote it.]\n\nHow does that sit?',
        'Affordability objection. Lower the assumed price anchor, then anchor to their number.',
        array['rep','manager']::text[], true);
    end if;

    -- ── 9. Persistency Save Call ────────────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Persistency Save — At-Risk Policy'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Persistency Save — At-Risk Policy',
        'Persistency', 'v1.0',
        E'Hi {{lead_first}}, this is {{rep_first}} with {{agency}}.\n\nI''m calling because I noticed your policy flagged as at-risk, and before anything happens to your coverage, I want to make sure that''s intentional on your part.\n\nIf it''s a billing issue — missing payment, bank change — those are usually fixable in 5 minutes and we can get the policy reinstated without a new application.\n\nIf something changed with your situation and you''re looking to adjust or cancel, I''d rather you talk to me first so I can make sure you have something in place.\n\nWhat''s going on on your end?',
        'Proactive outreach before a policy lapses. Lead with their coverage interest, not the payment.',
        array['rep','manager','owner']::text[], true);
    end if;

    -- ── 10. Post-Application Thank-You ─────────────────────────────────────
    if not exists (
      select 1 from public.agency_scripts
       where agency_id = a
         and title = 'Post-Application Thank-You Call'
         and is_starter = true
    ) then
      insert into public.agency_scripts
        (agency_id, title, cat, version, body, description, target_roles, is_starter)
      values (a,
        'Post-Application Thank-You Call',
        'Closing', 'v1.0',
        E'Hi {{lead_first}}, it''s {{rep_first}} from {{agency}} — I just wanted to call and say thank you for your application today.\n\nYou made a good decision. Here''s what happens next:\n\n- The carrier will review your application, usually within 5-10 business days.\n- Once it''s approved, you''ll get a policy document mailed to you. Keep it somewhere safe.\n- Your first bank draft will go out on the date you selected.\n\nIf anything feels off or you have questions at any point, call me directly at {{rep_phone}}. You''re not talking to a call center — you''re talking to me.\n\nIs there anything you want to walk through before I let you go?',
        'Warm confirmation call after an app is submitted. Reduces buyer''s remorse and sets expectations.',
        array['rep','manager']::text[], true);
    end if;

  end loop;
end $$;
