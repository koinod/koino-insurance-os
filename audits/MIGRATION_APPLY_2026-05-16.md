# Migration Apply — 2026-05-16

Status of the 8 new migrations (0041–0048) after the sprint merge wave.

## Applied to production (Insurance OS / jfphwmzwteermalzwojp)

| File | Tracker name | What it did |
|---|---|---|
| `0043_webhook_replay_seen.sql` | `0043_webhook_replay_seen` | New `webhook_replay_seen(slug, request_id)` table; RLS on; service-role-only writes |
| `0045_user_prefs.sql` | `0045_user_prefs` | New `user_prefs(rep_id, key, value)` table; self-only RLS via `agency_members` |
| `0047_inbound_sms.sql` + `0048_sms_optouts.sql` | `0047_sms_outbox_phase2_unified` | **Consolidated** — these two had conflicting `sms_outbox_status_check` definitions. Applied a UNION: `pending`/`claimed`/`sent`/`failed`/`expired`/`received`/`dry_run`/`skipped_no_consent`/`skipped_opted_out`/`skipped_quiet_hours`. New `sms_optouts` table + `sms_outbox.{direction,from_number,twilio_sid}` columns + unique index on `twilio_sid` |
| `0046_consent_default_fix.sql` | `0046_consent_default_fix` | TCPA fix: `pipeline.consent` default flipped `verified` → `pending`; CHECK widened to accept `implied`/`express`/`none`; **8 rows demoted from `verified` to `pending`** (none had proving touchpoints or paying-vendor sources) |

## Not applied — needs decisions

### `0041_close_schema_drift.sql` — redundant
Audit assumed `agencies`/`agency_members`/`agency_invites`/etc. were missing. They all exist in deployed via timestamp-format migrations. The file is idempotent (all `if not exists`) so applying would be a no-op, but it's not worth tracker churn. **Recommend: keep file as documentation of expected schema; do not apply.**

### `0044_recruits.sql` — schema collision
The deployed `recruits` table is a completely different shape from what 0044 declares:

| | Deployed | 0044 expects |
|---|---|---|
| Tenant key | none | `agency_id uuid` |
| Name | `full_name` | `name` |
| Email | `contact_email` | `email` |
| Phone | `contact_phone` | `phone` |
| Stage tracking | `status` (free text) | `stage` CHECK + per-stage timestamps |
| Owner | `recruiter_handle` (text) | `owner_rep_id` FK to `reps` |
| Other | `license_state`, `has_license` | applied/discovery/onboarded/licensed_at |

These model different concepts:
- **Deployed:** recruiter-CRM (contact + license state + recruiter handle)
- **0044:** funnel-stage tracker (Applied → Discovery → Onboarding → Licensed)

The Rookie of the Year play (CLAUDE.md) wants the funnel-stage shape. **Recommend: add `agency_id` + `stage` + per-stage timestamps as columns on the existing table (additive migration), update page-recruits.jsx to use the unified shape. Don't drop the deployed columns — they have data.**

### `0042_rls_harden.sql` — production-unsafe as written
**This is the most important security fix and the most-blocked.**

The migration's strategy: drop every `auth write X using(true) with check(true)` leak, then install tenant-scoped replacements for tables that have `agency_id`.

Problem: the migration leaves ~15 tables **with no write policy at all** (clients, messages, threads, notifications, recruits, households, interviews, touchpoints, coaching_notes, coaching_sessions, nigos, attributions, forecast_*, followup_rules, message_reads, thread_members, agent_runs). The author's comment says "write to the server only" — assuming all writes go through `security definer` RPCs.

Grep of the codebase shows direct `sb.from('X').{insert,update,delete}` calls on at least: `messages` (1), `threads` (2), `notifications` (1), `recruits` (2), `coaching_notes` (2), `coaching_sessions` (1). Applying 0042 as-is would lock authenticated users out of those writes → app down.

**To unblock:**
1. Either add `agency_id` to each affected table + install a tenant-scoped policy, OR
2. Route every direct `.from('X').{insert,update,delete}` call through a `security definer` RPC, OR
3. Add a `for all to authenticated using (tenant scope expression resolved via joins) with check (...)` policy per table.

Until one of those lands, **the cross-tenant write leak from `0002_fill_missing_domains.sql:597` remains live in production.**

## How application happened

`supabase db push` was NOT used. The local `00NN_*` migration filename convention is incompatible with the deployed DB's timestamp-format tracker — `migration list` shows 0/48 local migrations recorded as applied even though the schemas are mostly in place. Each new migration here was applied via the Supabase MCP `apply_migration` tool, which records its own timestamp entry in the tracker.

**Don't run `supabase db push` directly against this project until the tracker reconciliation is done** (separate session — Phase 2 in the retro).
