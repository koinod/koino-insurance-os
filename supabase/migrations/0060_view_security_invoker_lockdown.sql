-- 0060_view_security_invoker_lockdown.sql
--
-- Closes Supabase Security Advisor findings (2026-05-17):
--   * auth_users_exposed       — v_user_landing exposed auth.users to anon
--   * security_definer_view × 3 — v_user_landing, v_user_metrics,
--                                v_agency_onboarding_status ran as SECURITY
--                                DEFINER, bypassing RLS.
--
-- Three changes per view:
--   1. Recreate with WITH (security_invoker = true) so queries run as the
--      calling role and respect RLS on the underlying tables.
--   2. Add a WHERE auth.uid() filter to row-scope to the caller where the
--      view's semantics are per-user (v_user_landing, v_user_metrics).
--      v_agency_onboarding_status stays multi-row because it's agency-scoped
--      and callers filter by agency_id — RLS on agencies covers it.
--   3. Revoke SELECT from anon (callers are always authenticated app users).
--      Re-grant SELECT to authenticated + service_role.

-- ── v_user_landing ─────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_user_landing;
CREATE VIEW public.v_user_landing
WITH (security_invoker = true) AS
SELECT
  u.id                    AS user_id,
  u.email,
  a.slug                  AS landing_agency,
  a.name                  AS landing_agency_name,
  a.is_demo,
  am.role                 AS landing_role,
  ( SELECT count(*) FROM agency_members
    WHERE agency_members.user_id = u.id AND agency_members.active )      AS total_memberships,
  ( SELECT array_agg(ag.slug ORDER BY ag.slug)
    FROM agency_members m JOIN agencies ag ON ag.id = m.agency_id
    WHERE m.user_id = u.id AND m.active )                                 AS all_agencies
FROM auth.users u
LEFT JOIN LATERAL (
  SELECT agency_id, role
  FROM agency_members
  WHERE user_id = u.id AND active
  ORDER BY
    CASE role
      WHEN 'super_admin' THEN 1
      WHEN 'owner'       THEN 2
      WHEN 'manager'     THEN 3
      WHEN 'rep'         THEN 4
      ELSE 5
    END,
    joined_at
  LIMIT 1
) am ON true
LEFT JOIN agencies a ON a.id = am.agency_id
WHERE u.id = (SELECT auth.uid());

REVOKE ALL ON public.v_user_landing FROM anon;
GRANT  SELECT ON public.v_user_landing TO authenticated, service_role;

-- ── v_user_metrics ─────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_user_metrics;
CREATE VIEW public.v_user_metrics
WITH (security_invoker = true) AS
SELECT
  am.user_id,
  am.agency_id,
  a.slug         AS agency_slug,
  am.role,
  am.rep_id,
  ( SELECT count(*) FROM commissions c
    WHERE c.rep_id = am.rep_id )                                          AS commissions_count,
  ( SELECT count(*) FROM recordings r
    WHERE r.agency_id = am.agency_id AND r.rep_id = am.rep_id )           AS calls_recorded,
  ( SELECT count(*) FROM policies p
    WHERE p.agency_id = am.agency_id )                                    AS agency_policies_total,
  ( SELECT count(*) FROM pipeline pp
    WHERE pp.agency_id = am.agency_id )                                   AS agency_pipeline_open
FROM agency_members am
JOIN agencies a ON a.id = am.agency_id
WHERE am.active
  AND am.user_id = (SELECT auth.uid());

REVOKE ALL ON public.v_user_metrics FROM anon;
GRANT  SELECT ON public.v_user_metrics TO authenticated, service_role;

-- ── v_agency_onboarding_status ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_agency_onboarding_status;
CREATE VIEW public.v_agency_onboarding_status
WITH (security_invoker = true) AS
SELECT
  a.id           AS agency_id,
  a.slug,
  a.name,
  a.is_demo,
  a.onboarding_complete,
  a.onboarding_step,
  ( SELECT count(*) FROM agency_onboarding_steps
    WHERE agency_id = a.id )                                              AS total_steps,
  ( SELECT count(*) FROM agency_onboarding_steps
    WHERE agency_id = a.id AND status = 'complete' )                      AS complete_steps,
  ( SELECT step_key FROM agency_onboarding_steps
    WHERE agency_id = a.id AND status = 'pending'
    ORDER BY step_order LIMIT 1 )                                         AS next_pending,
  ( SELECT array_agg(step_key ORDER BY step_order)
    FROM agency_onboarding_steps
    WHERE agency_id = a.id AND status = 'pending' )                       AS pending_steps,
  ( SELECT array_agg(step_key ORDER BY step_order)
    FROM agency_onboarding_steps
    WHERE agency_id = a.id AND status = 'complete' )                      AS done_steps
FROM agencies a;

REVOKE ALL ON public.v_agency_onboarding_status FROM anon;
GRANT  SELECT ON public.v_agency_onboarding_status TO authenticated, service_role;
