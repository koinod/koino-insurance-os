-- 0061_quick_lint_fixes.sql
--
-- Two trivial WARN-level Supabase advisor closures:
--   1. function_search_path_mutable on public.profiles_updated_at
--      → pin search_path so a hijacked role can't redirect resolution
--   2. rls_enabled_no_policy on public.webhook_replay_seen
--      → add an explicit deny-all policy. Service role bypasses RLS so
--        the webhook idempotency tracker keeps working; everyone else
--        is locked out (was already locked out by "RLS on + 0 policies",
--        but explicit > implicit and the lint complains).
--
-- Leaving for a follow-up sweep (0062_+):
--   - 53 functions with `EXECUTE ... TO PUBLIC` grants. Need per-function
--     analysis: revoke from PUBLIC, re-grant only to roles that actually
--     call each function. Mass-revoke would break the app.
--   - 13 rls_policy_always_true — mostly intentional (anon SMS opt-out,
--     anon client_errors, anon quote form). 2 worth scrutinizing:
--     activity_log "authed write" + automation_rules "owner manager write"
--     (need agency-id scoping in USING clause).
--
-- Dashboard-only (cannot fix via SQL):
--   - auth_leaked_password_protection → Auth → Settings → "Enable
--     HaveIBeenPwned check"

ALTER FUNCTION public.profiles_updated_at()
  SET search_path = public, pg_temp;

CREATE POLICY "deny_all_default"
  ON public.webhook_replay_seen
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
