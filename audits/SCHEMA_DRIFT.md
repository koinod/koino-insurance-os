# SCHEMA DRIFT AUDIT — code vs. supabase/migrations

Date: 2026-05-15
Method: Parsed every `from("...")`, `.select(...)`, `.insert(...)`, `.update(...)`, `.upsert(...)`, `.eq(...)`, `.order(...)` in every `.jsx`/`.js` outside `node_modules`/`dist`. Built `{table -> columns referenced in code}`. Parsed every `create table public.<X>` and `alter table public.<X> add column ...` in `supabase/migrations/*.sql`. Diffed.

False-positive filters applied:
- `sb.storage.from("...")` is NOT a Postgres table — excluded (`vault`, `call-recordings` buckets).
- Views (`v_*`) excluded from "missing table" list.
- Auditor script: `/tmp/audit_schema.py` (kept for reproduction). Raw JSON: `/tmp/audit_schema.json`.

---

## A. Tables referenced in code but NOT defined in `supabase/migrations/*.sql`

13 tables. All are most likely defined in pre-0001 migrations now archived under `supabase/migrations-export/*.b64` (the deployed schema knows them; the on-disk migrations do not). For a clean re-deploy, every one of these needs a real `create table` migration.

| Table | First code reference |
|---|---|
| `agency_audit_log` | `page-admin.jsx:123` |
| `agency_calls` | `mobile-screens.jsx:206` |
| `agency_carrier_appointments` | `page-tenant.jsx:494` |
| `agency_members` | `page-billing.jsx:219`, `page-admin.jsx:64`, `page-admin.jsx:81`, `page-admin.jsx:168`, `page-admin.jsx:178` |
| `agency_onboarding_steps` | `page-first-run.jsx:65` |
| `connector_catalog` | `page-first-run.jsx:435`, `page-extras.jsx:3931` |
| `lead_quotes` | `data.jsx:1920` |
| `nigo_items` | `data.jsx:1268`, `data.jsx:1289` |
| `notification_prefs` | `data.jsx:1231`, `page-extras.jsx:5216` |
| `recruiting_messages` | `data.jsx:408`, `data.jsx:1331` |
| `routing_rules` | `data.jsx:1538`, `data.jsx:1539`, `data.jsx:1550`, `page-extras.jsx:5047`, `page-owner.jsx:1645` |
| `saved_views` | `data.jsx:1584` |
| `vault_artifacts` | `data.jsx:1245`, `data.jsx:1257`, `page-transcriber.jsx:309` |

Bonus tables that are referenced AND have missing-columns rows below but whose `create table` is also not in this branch: `agencies`, `agency_invites`, `agency_lead_sources`, `agency_notifications`, `recruiting_applicants`, `recruiting_campaigns`. Their column ALTERs exist in `0031_lead_drip_phase1.sql` and elsewhere but the base table DDL is absent.

---

## B. Tables defined in migrations but missing columns referenced in code

15 tables. Cited file:line is the location of the first code reference to the missing column.

### `agencies`  *(base CREATE TABLE not in this branch)*
- `config` — `lib/agency-config.js:86`, `lib/agency-config.js:109`
- `created_at` — `page-admin.jsx:63`
- `id` — `page-billing.jsx:211`, `page-billing.jsx:279`, `data.jsx:1559`
- `name` — `page-billing.jsx:211`, `page-admin.jsx:63`
- `plan` — `page-admin.jsx:63`, `page-admin.jsx:160`
- `slug` — `page-billing.jsx:211`, `page-admin.jsx:63`
- `state` — `page-admin.jsx:63`

### `agency_expenses`  (origin: `0017_expenses.sql`)
- `memo` — `page-today.jsx:1454`
- `status` — `page-today.jsx:1454`

### `agency_invites`  *(base CREATE TABLE not in this branch)*
- `agency_id`, `email_hint`, `expires_at`, `role`, `token`, `used_at` — `page-admin.jsx:111`, `page-tenant.jsx:307`

### `agency_lead_sources`  *(base CREATE TABLE not in this branch; ALTERs in `0031_lead_drip_phase1.sql`)*
- `active` — `page-leaddrip.jsx:919`, `page-leaddrip.jsx:999`, `page-expenses.jsx:94`
- `age` — `page-leaddrip.jsx:999`
- `agency_id` — `page-leaddrip.jsx:920`, `page-leaddrip.jsx:999`, `page-expenses.jsx:95`
- `cost_per_lead_cents` — `page-expenses.jsx:94`
- `email`, `lead_name`, `name`, `phone`, `product`, `state`, `vendor` — `page-leaddrip.jsx:999` (insert object)
- `id` — `page-leaddrip.jsx:919`, `page-leaddrip.jsx:946`, `page-leaddrip.jsx:960`

### `agency_notifications`  *(base CREATE TABLE not in this branch)*
- `agency_id`, `created_at` — `page-admin.jsx:714`, `page-admin.jsx:721`
- `id` — `data.jsx:1762`, `data.jsx:1788`

### `agent_deployments`  (origin: `0002_fill_missing_domains.sql`)
- `template` — `page-platform.jsx:109`
- `version` — `page-platform.jsx:109`

### `carriers`  (origin: `0002_fill_missing_domains.sql`)
- `agency_id` — `page-tenant.jsx:485`, `lib/rate-engine.js:161`

### `connections`  (origin: `0001_repflow_v2_init.sql`)
- `config` — `page-onboarding.jsx:334`, `page-tenant.jsx:724`, `page-extras.jsx:3932`
- `connector_key` — `page-extras.jsx:3932`

### `pipeline`  (origin: `0001_repflow_v2_init.sql`)
- `agency_id` — `page-first-run.jsx:710`
- `phone` — `page-first-run.jsx:710`

### `products`  (origin: `0002_fill_missing_domains.sql`)
- `agency_id` — `lib/rate-engine.js:162`

### `queue`  (origin: `0001_repflow_v2_init.sql`)
- `assigned_rep_id` — `data.jsx:1620`, `data.jsx:1632`

### `recruiting_applicants`  *(base CREATE TABLE not in this branch)*
- `enrolled_at` — `data.jsx:407`
- `id` — `data.jsx:1320`

### `recruiting_campaigns`  *(base CREATE TABLE not in this branch)*
- `created_at` — `data.jsx:406`
- `id` — `data.jsx:1350`

### `reps`  (origin: `0001_repflow_v2_init.sql`)
- `agency_id` — `page-admin.jsx:98`, `page-tree.jsx:60`  (NOTE: heavily used in JOINs in migrations 0008/0009/0015, but no `alter table public.reps add column agency_id` exists in this branch; column lives in deployed DB only.)
- `upline_rep_id` — `page-admin.jsx:98`, `page-admin.jsx:188`  (note: `upline_id` IS added in `0004_auth_identity_link.sql:18`; `upline_rep_id` is a separate distinct ref.)

### `sequence_enrollments`  (origin: `0002_fill_missing_domains.sql`)
- `agency_id` — `page-leaddrip.jsx:183`
- `next_send_at` — `page-leaddrip.jsx:183`

---

## C. What the SQL remediation does

See `supabase/migrations/1778891249_close_schema_drift.sql` (timestamp = current unix time on 2026-05-15). It:
1. `create table if not exists` for every missing-base table, modeled on the smallest viable shape the code uses (id + agency_id + standard timestamps + key fields the code actually writes).
2. `alter table … add column if not exists` for every missing column on existing tables, with safe defaults / nullable types. No drops. No data destruction.

Not applied. Review before `supabase db push`.

---

## D. Known limitations of this audit

- Object-literal column detection only walks the inline insert/upsert/update `{...}` body in source. Dynamic objects built via `Object.assign` or destructured from props are NOT inspected — there will be more real columns referenced that aren't flagged here.
- Storage buckets (`sb.storage.from(...)`) are filtered out; if code references both a storage bucket and a table of the same name, the bucket suppresses the table flag.
- "Missing column" on a base table that itself isn't in this branch may double-count (the column needs the base table first).
- TODO: cross-check the deployed schema via `supabase db pull` or the live introspection RPC to confirm which "?" tables actually exist in production.
