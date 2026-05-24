-- 0069 — Seed two system sequences that pair with autodialer outcome flow.
--
-- Applied to prod via mcp__claude_ai_Supabase__apply_migration on 2026-05-24.
-- This file is a ledger marker.
--
-- Two global system sequences (agency_id = NULL) per existing pattern:
--   sys_voicemail_followup    — 3 SMS over 5 days, after autodial outcome=voicemail
--   sys_appointment_confirm   — 2 SMS, confirm + day-of reminder, after outcome=appointment
--
-- Tokens consumed by drip-runner: {{first}} {{rep}} {{product}} {{state}} {{ap}}
--
-- Wired-in next cycle (after AI-voice terminal settles): page-autodialer.jsx
-- recordOutcome() calls AppData.mutate.sequenceEnroll(leadId, sequenceId,
-- repId) where sequenceId is looked up from a per-agency org_settings
-- outcome_routes map. Default routes:
--   voicemail   → sys_voicemail_followup
--   appointment → sys_appointment_confirm

INSERT INTO public.sequences (id, name, description, steps, audience, is_active, agency_id)
VALUES
  (
    'sys_voicemail_followup',
    'Voicemail follow-up · 3-touch',
    'Auto-enroll lead after autodial outcome = voicemail. 3 SMS touches over 5 days.',
    $json$
    [
      { "day": 0, "ch": "SMS", "template": "Hi {{first}}, this is {{rep}} — just left you a voicemail about your {{product}} options. Reply YES and I'll send a quick text breakdown. Talk soon." },
      { "day": 2, "ch": "SMS", "template": "Following up {{first}} — most folks have one specific question after seeing the quote. What's yours?" },
      { "day": 5, "ch": "SMS", "template": "Last text from me, {{first}}. If now isn't right, no hard feelings — just reply STOP and I'll close out." }
    ]
    $json$::jsonb,
    'lead',
    true,
    NULL
  ),
  (
    'sys_appointment_confirm',
    'Appointment confirm + day-of reminder',
    'Auto-enroll lead after autodial outcome = appointment. 2 SMS: confirm now + day-of reminder.',
    $json$
    [
      { "day": 0, "ch": "SMS", "template": "Confirmed, {{first}}! Looking forward to our call. I'll reach out at the time we set. Reply with any questions before then." },
      { "day": 1, "ch": "SMS", "template": "Quick reminder {{first}} — our call is today. I'll ring you at the time we set. Talk soon." }
    ]
    $json$::jsonb,
    'lead',
    true,
    NULL
  )
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.sequences
  WHERE id IN ('sys_voicemail_followup', 'sys_appointment_confirm');
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'expected 2 new sequences, got %', cnt;
  END IF;
END $$;
