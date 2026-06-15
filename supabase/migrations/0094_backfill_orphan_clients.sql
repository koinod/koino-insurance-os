-- 0094 Backfill clients for orphan policies — make the Client Book reflect
-- historic deals written before commit c87fb8d (deal-write -> ensureClientForLead).
--
-- Background: page-client-book.jsx iterates public.clients and matches policies
-- via clients.lead_pipeline_id = policies.lead_pipeline_id. The fix in c87fb8d
-- (2026-06-14) added ensureClientForLead so every new deal-write creates the
-- sibling clients row. But historic policies whose lead-pipeline already
-- existed at the moment of that deploy never got a clients row, so their
-- agencies' Client Book is empty for all in-force AP written before yesterday.
--
-- Fix shape: for every policy whose lead_pipeline_id has NO clients row,
-- INSERT a clients row using pipeline.lead_name / phone / email. Idempotent
-- on re-run (the WHERE NOT EXISTS guard skips already-backfilled leads).
--
-- RLS note: clients has NO agency_id column. The "tenant rw clients" policy
-- (migration 0042) authorizes inserts via the linked pipeline row's agency.
-- This migration runs as the migration role and bypasses RLS — that's
-- intentional, the join is authoritative.

INSERT INTO public.clients (lead_pipeline_id, full_name, contact_phone, contact_email, relationship, created_at)
SELECT DISTINCT ON (p.lead_pipeline_id)
  p.lead_pipeline_id,
  COALESCE(NULLIF(TRIM(pl.lead_name), ''), 'Client'),
  pl.phone,
  pl.email,
  'primary',
  COALESCE(p.created_at, NOW())
FROM public.policies p
JOIN public.pipeline pl ON pl.id = p.lead_pipeline_id
WHERE p.lead_pipeline_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.lead_pipeline_id = p.lead_pipeline_id
  );

-- Verify: no orphan policies remain (every lead_pipeline_id referenced by a
-- policy now has a sibling clients row).
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT count(DISTINCT p.lead_pipeline_id) INTO orphan_count
  FROM public.policies p
  WHERE p.lead_pipeline_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.clients c WHERE c.lead_pipeline_id = p.lead_pipeline_id
    );
  IF orphan_count <> 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % orphan policy lead_pipeline_ids remain', orphan_count;
  END IF;
END $$;
