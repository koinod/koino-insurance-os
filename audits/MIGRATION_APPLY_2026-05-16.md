# Migration Apply — 2026-05-16

Status of the 8 new migrations (0041–0048) after the sprint merge wave,
plus the per-table RLS work that closed the cross-tenant write leak.

## Production state (Insurance OS / `jfphwmzwteermalzwojp`)

| Tracker entry | Source file(s) | What it did |
|---|---|---|
| `0043_webhook_replay_seen` | `0043_webhook_replay_seen.sql` | New `webhook_replay_seen(slug, request_id)` table; RLS on; service-role-only writes |
| `0045_user_prefs` | `0045_user_prefs.sql` | New `user_prefs(rep_id, key, value)` table; self-only RLS via `agency_members` |
| `0047_sms_outbox_phase2_unified` | `0047_inbound_sms.sql` (consolidated with 0048) | **Merged source files** because their `sms_outbox_status_check` definitions collided. Applied UNION: `pending`/`claimed`/`sent`/`failed`/`expired`/`received`/`dry_run`/`skipped_no_consent`/`skipped_opted_out`/`skipped_quiet_hours`. New `sms_optouts` table + `sms_outbox.{direction, from_number, twilio_sid}` columns + unique index on `twilio_sid` |
| `0046_consent_default_fix` | `0046_consent_default_fix.sql` | TCPA fix: `pipeline.consent` default flipped `verified`→`pending`; CHECK widened to accept `implied`/`express`/`none`; **8 rows demoted from `verified` to `pending`** |
| `0049_rls_pass1_agency_id_cols_and_scoped_policies` | `0042_rls_harden.sql` (Pass 1 section) | Added `agency_id` columns to recruits/notifications/threads/households/interviews/followup_rules/forecast_overrides/forecast_runs. Backfilled notifications via `recipient_handle → reps.handle` (4 of 12 matched); orphans assigned to atlas-demo. Installed `tenant rw X` scoped policies on 17 tables (parallel to leaks). |
| `0050_rls_pass2_drop_leaks_no_write_tables` | `0042_rls_harden.sql` (Pass 2 section) | Dropped 17 `auth write X using(true) with check(true)` leak policies on tables with 0 direct client writes |
| `0051_rls_pass3_drop_remaining_leaks` | `0042_rls_harden.sql` (Pass 3 section) | Dropped 7 remaining leak policies (messages, threads, notifications, recruits, coaching_notes, coaching_sessions, thread_members). Required code patch in `data.jsx` to include `agency_id` on `threads.insert` |
| `0052_recruits_add_funnel_columns` | (new — local file is `0042_rls_harden.sql` tail) | Added Rookie-of-the-Year funnel columns (`stage`, `applied_at`, `discovery_at`, `onboarded_at`, `licensed_at`, `owner_rep_id`) onto deployed `recruits` table (which has `full_name`/`contact_email`/etc. shape — coexistence not replacement). Patched `page-recruits.jsx` to use the deployed column names. |

## The leak is closed

`SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual='true' AND with_check='true' AND cmd IN ('ALL','UPDATE','DELETE') AND 'authenticated' = ANY(roles)` → **0**.

Smoke 25/25 green vs prod after every pass.

## Local migration files — final state

| File | Status |
|---|---|
| `0041_close_schema_drift.sql` | **NO-OP placeholder** — original DDL would be idempotent against current schema but adds churn; kept as documentation of expected shape. See `audits/SCHEMA_DRIFT.md`. |
| `0042_rls_harden.sql` | **REWRITTEN** to match what was actually applied (Pass 1+2+3+0052 consolidated). Re-running against the now-fixed DB would be a no-op (all `drop policy if exists` / `create policy` patterns are idempotent). |
| `0044_recruits.sql` | **DELETED** — collided with deployed `recruits` schema (deployed shape: contact-mgmt; the 0044 file wanted funnel-stage). Replaced by additive `0052` migration applied in production. |
| `0047_inbound_sms.sql` | **REWRITTEN** to be the unified Phase 2 SMS migration (was 0047 + 0048 merged). |
| `0048_sms_optouts.sql` | **DELETED** — content folded into `0047`. |

## `supabase db push` advisory — still in effect

This project's deployed migration tracker uses timestamp-format versions
(e.g. `20260516223408_0043_webhook_replay_seen`) while the local files use
`00NN_*` convention. `supabase migration list` shows **0 of 50 local
migrations as recorded applied** because the version-name mismatch means
the CLI doesn't recognize them as the same migrations.

**Do not run `supabase db push` directly.** All migrations from 2026-05-16
forward have been applied via the Supabase MCP `apply_migration` tool,
which records each one with a fresh timestamp entry. To apply new
migrations going forward, use the same path.

## Code changes that depend on these migrations

- `data.jsx:2057` — `threads.insert` now includes `agency_id` (otherwise the
  Pass 3 WITH CHECK rejects the insert because the new scoped policy
  requires a non-NULL tenant id).
- `page-recruits.jsx` — `addRecruit` now writes to `full_name`/`contact_email`/
  `contact_phone` (deployed column names), and the kanban card renderer
  falls back gracefully between the two naming sets.

## What's still owed (not in this round)

- **agency_id NOT NULL constraint** on the columns added by Pass 1: currently
  nullable to avoid breaking existing rows. After all writes are confirmed
  setting agency_id, tighten to NOT NULL + drop the `IS NULL` clause from
  the USING expressions.
- **Per-rep visibility scope** on `coaching_notes`/`coaching_sessions`: current
  policy lets every agency member see every other member's coaching notes.
  Probably wrong — should be self + manager-of-rep only.
- **3 false-live UIs** (notifications bell, in-app chat, vault carriers
  block) per `audits/REALTIME_COVERAGE.md` — still suggest realtime but
  don't subscribe.
- **5 onboarding RPCs** missing in deployed DB per `audits/ONBOARDING_GAPS.md` —
  `provision_sub_agency` is the hard blocker for fresh-owner agency creation.
