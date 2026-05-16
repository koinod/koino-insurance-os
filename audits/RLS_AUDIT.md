# RLS AUDIT — public.* tables in supabase/migrations

Date: 2026-05-15
Method: Parsed every `create table public.X`, every `alter table … enable row level security`, every `create policy …`/`drop policy …` in `supabase/migrations/*.sql`. Auditor script: `/tmp/audit_rls.py`. Raw JSON: `/tmp/audit_rls.json`.

Parser caveats acknowledged up front:
- The big `do $$ … execute format(…) … $$` block at `0002_fill_missing_domains.sql:573-603` dynamically enables RLS and creates 3 blanket policies on each of 37 tables. The static regex won't see those `alter table … enable rls` calls — I cross-referenced manually.
- Subsequent migrations (especially `0024_lockdown_rls_phase1.sql`) drop specific policies by name; if a drop targets a permissive policy that 0002 actually created, the lockdown stands.
- "Tenant scoped" is judged by literal references to `agency_id`, `viewer_agency_ids()`, or `agency_members` inside the policy body — NOT by execution. A policy that references `viewer_agency_ids()` may still be misconfigured.

---

## CRITICAL — `using (true) with check (true)` for ALL on tenant-bearing tables

These tables had `auth write X` blanket policies created in `0002_fill_missing_domains.sql:597` (`for all to authenticated using (true) with check (true)`) and have NO matching `drop policy if exists "auth write X"` in any later migration. The result: any authenticated user can INSERT / UPDATE / DELETE any row on these tables across all agencies.

| Table | Has `agency_id` column? | Origin of blanket policy |
|---|---|---|
| `agent_runs` | NO (no ALTER adds it) | `0002_fill_missing_domains.sql:597` (loop iteration) |
| `attributions` | NO | `0002:597` |
| `clients` | NO | `0002:597` |
| `coaching_notes` | NO | `0002:597` |
| `coaching_sessions` | NO | `0002:597` |
| `followup_rules` | NO | `0002:597` |
| `forecast_overrides` | NO | `0002:597` |
| `forecast_runs` | NO | `0002:597` |
| `households` | NO | `0002:597` |
| `interviews` | NO | `0002:597` |
| `message_reads` | NO | `0002:597` |
| `messages` | NO | `0002:597` |
| `nigos` | NO | `0002:597` |
| `notifications` | NO | `0002:597` |
| `recruits` | NO | `0002:597` |
| `sequences` | YES (added in `0031_lead_drip_phase1.sql:28`) but blanket policy was not replaced post-add | `0002:597` |
| `thread_members` | NO | `0002:597` |
| `threads` | NO | `0002:597` |
| `touchpoints` | NO | `0002:597` |

(Tables `lead_sources`, `carriers`, `products`, `aep_periods`, `nigo_reasons` are intentionally left as "catalog" tables per `0024_lockdown_rls_phase1.sql:367-376` — but the residual `auth write X using(true)` policy ALSO lets any authenticated user mutate the catalog. See HIGH section.)

`0001_repflow_v2_init.sql` adds the equivalent blanket policies for `reps, pipeline, queue, courses, recordings, connections, hardware, ai_agents, workflows` (lines 199-228). Of those:
- `reps` SELECT → replaced by `0015_tenant_isolation.sql:136-138` (tenant-scoped). WRITE → never dropped. **CRITICAL.**
- `pipeline` SELECT → replaced by `0015:128-130`. WRITE → never dropped. **CRITICAL.**
- `queue` SELECT → replaced by `0015:132-134`. WRITE → never dropped. **CRITICAL.**
- `courses, recordings, connections, hardware, ai_agents, workflows` SELECT and WRITE → neither dropped anywhere. **CRITICAL** (all-tenant read AND write).

---

## HIGH — global catalog tables with `auth write X using(true)` for authenticated

These are intentionally readable by anon (catalog use), but the residual `auth write` policy from `0002:597` lets any authenticated user mutate the catalog (rename carriers, change commission grids, add fake lead sources, etc).

| Table | Origin |
|---|---|
| `aep_periods` | `0002:597` |
| `carriers` | `0002:597` |
| `lead_sources` | `0002:597` |
| `nigo_reasons` | `0002:597` |
| `products` | `0002:597` |

Note: `products` gained `agency_id` in `0010_carrier_quote_engine.sql` and `carriers` gains it in the drafted `1778891249_close_schema_drift.sql`, but neither replaces the blanket write policy.

---

## HIGH — `anon read` policies still wide open

`0024_lockdown_rls_phase1.sql:40-69` drops `anon read X` on 31 tables, but several `anon read X using(true)` policies created by `0002:598` were NEVER dropped:

| Table | Status |
|---|---|
| `aep_periods` | intentional catalog — OK |
| `agent_install_tokens` | TIGHTENED in `0005_tighten_agent_install_tokens_rls.sql` — OK |
| `carriers` | intentional catalog per `0024:373` — OK with caveat |
| `commissions` | dropped in `0015:84` — OK |
| `lead_sources` | intentional catalog per `0024:372` — OK |
| `nigo_reasons` | intentional catalog per `0024:371` — OK |
| `policies` | dropped in `0015:64` — OK |
| `products` | intentional catalog per `0024:374` — OK |
| `sequences` | dropped in `0024:62` — OK |
| `followup_rules` | NOT dropped → still `for select to anon using (true)`. **HIGH leak** (followup definitions readable to anon). |

Also `0001_repflow_v2_init.sql:220-228` adds `anon read X` for `reps, pipeline, queue, courses, recordings, connections, hardware, ai_agents, workflows`. `0024` does NOT drop these. **CRITICAL anon leak**: anon reads can pull every rep's name + commission tier + dial count, the whole pipeline across every agency, queue assignments, courses, recordings metadata, connection configs, hardware fingerprints, AI agent configs, and workflow rules.

---

## MEDIUM — `using (true)` for SELECT on `authenticated` (not catalog tables)

After the 0024 sweep, the following SELECT-only `using(true)` policies for `authenticated` remain in this branch's migrations:

| Table | Source | Why it might be OK |
|---|---|---|
| `call_recordings` | `0015_call_recordings_and_admin.sql:66` policy `"agent reads call_recordings"` for `agent` role only | Intentional — agent role only |
| `followup_runs` | `0008_floor_workflows_and_followups.sql:123` policy `"auth read agency"` | REPLACED by `0024:175-180`. OK. |
| `followup_templates` | `0008:73` `"auth read agency"` | REPLACED by `0024:183-185`. OK. |
| `workflow_assignments` | `0008:33` `"auth read own agency"` | REPLACED by `0024:232-235`. OK. |
| `carrier_profiles, product_features_life, product_features_annuity` | `0029_life_annuity_underwriting.sql:204-222` `for select to authenticated using (true)` | Underwriting **catalog** — likely intentional, but no comment justifies it. |

---

## MEDIUM — `0024_lockdown_rls_phase1.sql` explicitly defers tables WITHOUT `agency_id`

`0024:16-21` enumerates these as deferred to a phase-2 migration that does NOT exist in this branch:

> `recruits, threads, notifications, sequences, forecast_*, followup_rules, interviews, households, clients, attributions, touchpoints, nigos`

The deferred work is already covered in CRITICAL above (they have the blanket write). Cross-listed here so the open ticket is visible.

---

## MEDIUM — Policies referencing columns that may not exist on the table

A spot-check across the policy bodies didn't find any obvious references to columns the table doesn't have, EXCEPT:

- `0024:269-282` (`book_entries`), `:286-293` (`carrier_appointments`), `:296-304` (`clawbacks`), `:307-315` (`payouts`), `:317-326` (`tasks`), `:328-337` (`tier_changes`), `:339-348` (`vault_files`), `:242-266` (`aep_assignments`) — all of these join `public.reps r where r.agency_id = ANY (public.viewer_agency_ids())`. They DEPEND on `reps.agency_id` existing. Per `audits/SCHEMA_DRIFT.md`, `reps.agency_id` is NOT defined in any `create table` or `alter table … add column` in this branch's migrations. The deployed DB has it (legacy migrations), but a clean re-deploy would fail to apply 0024 if `reps.agency_id` weren't already present. Treat this as a transitive dependency on the drafted `1778891249_close_schema_drift.sql`.

---

## TODO — items that need ground-truth verification

- Whether 0002's dynamic RLS-enable loop actually executed on a clean DB or was short-circuited by the `exception when duplicate_object then null` catch — observable only by introspecting `pg_class.relrowsecurity` in the deployed DB.
- Whether `agency_id` on tables like `recruits, threads, attributions, touchpoints` actually exists in the deployed DB — the static migration files don't add it, but the code references it (see `audits/SCHEMA_DRIFT.md`).
- A live `pg_policies` snapshot vs. this static analysis. The static view is best-effort.

---

## Remediation

See `supabase/migrations/1778891250_rls_harden.sql` (drafted alongside this audit). Strategy:
1. Drop every remaining `auth write X` blanket policy named by 0002's loop.
2. Drop the residual `anon read X` blanket policies for the `0001` tables (`reps, pipeline, queue, courses, recordings, connections, hardware, ai_agents, workflows`).
3. Drop the lingering `followup_rules anon read true`.
4. For tables with a known `agency_id` (per current branch + the drafted schema-drift migration), add `auth write X for all to authenticated using/with check (agency_id = ANY (public.viewer_agency_ids()))`. For tables without `agency_id`, drop the blanket and add **no** replacement — those tables intentionally have no scoped writes from the client (server only).

Not applied. Review before `supabase db push`. Migration depends on `1778891249_close_schema_drift.sql` having run first (for `reps.agency_id`).
