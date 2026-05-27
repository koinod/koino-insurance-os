-- ─────────────────────────────────────────────────────────────────────────────
-- 0074 RBA super-admin diagnostic commands
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Extends rba_commands.kind CHECK constraint with 6 new sa_* values.
-- 2. Creates RPC rba_post_super_admin_command — super_admin-only shortcut that
--    posts an sa_* command to any device and writes an audit trail.
--
-- SCHEMA NOTE: rba_audit (from 0030) uses columns
--   (device_id, user_id, agency_id, tool, args_hash, result text, detail,
--    duration_ms, created_at)
-- The task spec describes a different rba_audit shape (actor_id, kind, payload).
-- This migration writes to the ACTUAL 0030 schema: tool=p_kind, result='ok'.
--
-- CONSTRAINT NOTE: rba_commands.kind is an inline CHECK on the column; Postgres
-- auto-names it rba_commands_kind_check.  DROP CONSTRAINT + ADD CONSTRAINT is
-- the only portable way to extend a CHECK list without recreating the table.
-- ─────────────────────────────────────────────────────────────────────────────

set local search_path = public;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 · EXTEND kind CHECK constraint                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.rba_commands
  DROP CONSTRAINT IF EXISTS rba_commands_kind_check;

ALTER TABLE public.rba_commands
  ADD CONSTRAINT rba_commands_kind_check CHECK (kind IN (
    -- platform commands (original 23)
    'ping','caps_refresh','models_list','clear_workspace','quarantine',
    -- tool invocations
    'auto_quote','twilio_dial','sendblue_send','draft_email','draft_sms',
    'fathom_pull_notes','linkedin_send','linkedin_inbox_scan',
    'fb_pull_lead_forms','ig_dm_reply','meta_dm_send',
    'browser_run','script_review','file_review',
    -- automations
    'post_call_followup','pre_appt_reminder','session_refresh','health_probe',
    -- super-admin diagnostics (new in 0074)
    'sa_snapshot_state','sa_inspect_db','sa_tail_logs',
    'sa_diag_pull','sa_replay_failed','sa_export_local_state'
  ));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 · RPC rba_post_super_admin_command                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Accepts only sa_* kinds.  Uses auth.uid() so the caller must be authenticated.
-- Writes an rba_audit row using the ACTUAL 0030 schema (tool / result / detail).

CREATE OR REPLACE FUNCTION public.rba_post_super_admin_command(
  p_device_id uuid,
  p_kind      text,
  p_payload   jsonb DEFAULT '{}'
)
RETURNS uuid   -- the new command id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_install  public.rba_installs%ROWTYPE;
  v_cmd_id   uuid;
BEGIN
  -- Guard 1: caller must be super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_super_admin';
  END IF;

  -- Guard 2: kind must start with sa_
  IF p_kind NOT LIKE 'sa_%' THEN
    RAISE EXCEPTION 'invalid_sa_kind: %', p_kind;
  END IF;

  -- Fetch install row to resolve agency_id
  -- NB: primary key in rba_installs is device_id (not id)
  SELECT * INTO v_install
    FROM public.rba_installs
   WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'device_not_found: %', p_device_id;
  END IF;

  -- Insert command
  -- NB: column is posted_by (not issued_by) per 0030 DDL
  INSERT INTO public.rba_commands
    (device_id, agency_id, posted_by, kind, payload)
  VALUES
    (p_device_id, v_install.agency_id, auth.uid(), p_kind,
     COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_cmd_id;

  -- Audit trail
  -- Writes to ACTUAL 0030 rba_audit schema:
  --   tool     ← p_kind
  --   result   ← 'ok'  (CHECK constraint: ok | denied | error)
  --   detail   ← command id for cross-reference
  INSERT INTO public.rba_audit
    (device_id, user_id, agency_id, tool, result, detail)
  VALUES
    (p_device_id, auth.uid(), v_install.agency_id,
     p_kind, 'ok',
     'cmd:' || v_cmd_id::text);

  RETURN v_cmd_id;
END;
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 · GRANT                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

GRANT EXECUTE ON FUNCTION public.rba_post_super_admin_command(uuid, text, jsonb)
  TO authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4 · VERIFY                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Confirms all 6 new sa_* values are present in the rebuilt CHECK constraint
-- by parsing pg_get_constraintdef() and counting substring matches.
-- Raises EXCEPTION (aborts the migration transaction) if any value is missing.

DO $$
DECLARE
  v_def   text;
  v_count int := 0;
  v_kinds text[] := ARRAY[
    'sa_snapshot_state','sa_inspect_db','sa_tail_logs',
    'sa_diag_pull','sa_replay_failed','sa_export_local_state'
  ];
  v_k     text;
BEGIN
  -- Pull the constraint definition from the catalog
  SELECT pg_get_constraintdef(oid)
    INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.rba_commands'::regclass
     AND conname  = 'rba_commands_kind_check'
     AND contype  = 'c';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'verify failed: rba_commands_kind_check not found in pg_constraint';
  END IF;

  FOREACH v_k IN ARRAY v_kinds LOOP
    IF v_def NOT LIKE ('%' || v_k || '%') THEN
      RAISE EXCEPTION 'verify failed: kind % missing from rba_commands_kind_check', v_k;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'verify failed: expected 6 sa_* kinds confirmed, got %', v_count;
  END IF;

  RAISE NOTICE 'verify ok: all 6 sa_* kinds present in rba_commands_kind_check';
END $$;
