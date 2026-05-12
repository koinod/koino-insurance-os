# Owner role audit · 2026-05-11

Branch: `feat/role-audit-owner-2026-05-11` (off `feat/onboarding-frontend-2026-05-11`)
Scope: every page + Settings tab the **owner** role lands on.
Method: read each surface end-to-end, trace every render path back to either
live data (Supabase tables hydrated through `data.jsx`) or hardcoded seed,
flag mismatches with file:line.

**DS note** — UI on every audit-shipped surface follows the **koino.capital
website DS** (green `#00d4aa` + near-black surfaces, 12-16px radii, smaller
cards, denser packing). Sourced from
`KOINO/ventures/products/storefront-static/index.html`. Scoped via the new
`.koino-ds` wrapper in `styles.css:48-238` so the rest of the OS keeps its
existing dark+amber tokens until a follow-on migration. See
`KoinoPlanCard` (`page-extras.jsx`), the empty states in
`page-attribution.jsx` + `page-pipeline-sequences.jsx`, and the dense
`BillingInvoicesPanel` for the pattern.

## Surfaces audited

| # | Surface | Source file | Verdict |
|---|---|---|---|
| 1 | P&L · Agency P&L | `page-owner.jsx:200-496` | shipped fix — was reading undefined data |
| 2 | Org Tree | `page-owner.jsx:498-791` | live · OK |
| 3 | Platform · Hardware enroll modal | `page-platform.jsx:10-94` | live · OK |
| 4 | Platform · Agent deploy modal | `page-platform.jsx:97-162` | live · OK |
| 5 | Platform · Calling setup | `page-platform.jsx:217-522` | live · OK (capability probes accurate) |
| 6 | Ops-depth · NIGO queue | `page-ops-depth.jsx:30-194` | live · demo gated |
| 7 | Ops-depth · Carriers | `page-ops-depth.jsx:296-425` | live · demo gated |
| 8 | Ops-depth · Scrubbers | `page-ops-depth.jsx:430-508` | synthesized — acceptable for now |
| 9 | Ops-depth · Forecast | `page-ops-depth.jsx:513-629` | live · OK |
| 10 | Attribution · Lead Vendors | `page-attribution.jsx` | shipped fix — was 100% hardcoded |
| 11 | Pipeline → Sequences | `page-pipeline-sequences.jsx` | shipped fix — was 100% hardcoded |
| 12 | Recruiting (owner-scope) | `page-recruiting.jsx:74-160` | live · `useScope()` correctly returns `isOwner` |
| 13 | Manager · Coaching · Owner view | `page-manager.jsx:769-836` | live · derives from `COACHING_SESSIONS` |
| 14 | Pipeline (owner view) | `page-pipeline.jsx:1-50` | shipped fix — manager scope was leaking fleet |
| 15 | Settings · Organization | `page-extras.jsx:2565-2599` | shipped fix (hydrate) — saves now survive refresh |
| 16 | Settings · Team & invites | `page-tenant.jsx:265-438` | live · OK |
| 17 | Settings · Carriers | `page-tenant.jsx:447-674` | live · OK (legacy + appointments fallback) |
| 18 | Settings · Billing | `page-extras.jsx:2657-` | shipped fix — replaced static stub with `AdminPlanCard` |
| 19 | Settings · Integrations (Connectors) | `page-extras.jsx:2709-2876` | shipped fix — Test button param mismatch |
| 20 | Settings · Agents | `page-extras.jsx:2891-3046` | live · OK (`suggested_agents_for_role` + `rba_installs`) |
| 21 | Settings · API keys | `page-extras.jsx:3048-3105` | session-only · documented placeholder |
| 22 | Settings · Routing rules | `page-extras.jsx:3107-3187` | demo gated — owner+manager mutate path lives in `RoutingRulesModal` (page-manager.jsx:859) |
| 23 | Settings · Notifications | `page-extras.jsx:3189-3223` | live (writes to `notification_prefs`) |
| 24 | Settings · Profile | `page-extras.jsx:3290-` | live · `save_profile` + `get_my_profile` RPCs (P6/P7) |
| 25 | Settings · Calling | `page-platform.jsx:353-522` | live · OK |
| 26 | Owner expenses | `page-expenses.jsx` | live · OK (queries `agency_expenses` directly) |
| 27 | Stripe checkout | `api/stripe/checkout.js` | OK · 503 with `missing` hint when env unset |
| 28 | Connector OAuth probe | `api/connector/test.js` | OK (post-fix to client) |
| 29 | Agent install via `agent_install_tokens` | `api/agents/issue-token.js` + `0002_fill_missing_domains.sql:36` | OK · note: brief mentioned `rba_install_tokens`; actual table is `agent_install_tokens` (RLS tightened in migration 0005) |

There is no Settings tab for **Profile / Notifications / Connectors / Agents
/ Team / Carriers / Products / Billing / Compliance / Branding** as listed —
the live tab list (`page-extras.jsx:2502-2506`) is `[org, team, carriers,
billing, integrations, agents, api, routing, calling, notifications,
profile]`. **Products / Compliance / Branding tabs do not exist yet** —
flagged in the gap list below.

---

## Engineering fixes shipped (priority A)

### 1. `AppData.EXPENSES` was never hydrated
**File**: `data.jsx` (post-fix lines 695-746)
**Symptom**: `page-owner.jsx:47` reads `AppData.LEAD_SPEND_TOTALS`,
`page-owner.jsx:88,406,416` reads `AppData.EXPENSES`, `page-owner.jsx:48`
reads `AppData.AGENCY_FIXED_COSTS_CENTS`, `page-today.jsx:567` reads
`AppData.LEAD_SPEND_TOTALS.mtd`. None of these were ever populated by
`data.jsx` (verified — 0 grep matches for assignment). Result: P&L
waterfall lead-spend / fixed-costs / NIGO drill-downs all rendered $0
even when `agency_expenses` had real rows (page-expenses.jsx queries
that table directly and was showing them, just not propagating to the
shared store).
**Fix**: Add expenses + lead_sources hydrate block under tenant scope,
project to the shape page-owner consumes, compute MTD/YTD/T12 lead-spend
totals + current-month fixed-cost rollup. Mirrors the resources hydrate
fail-soft pattern.
**Commit**: `b9430c4 fix(owner): hydrate AppData.EXPENSES + LEAD_SPEND_TOTALS for P&L waterfall`

### 2. Connector test button broken (param name mismatch)
**File**: `page-extras.jsx:2754` was sending `{connector_key: key}` but
`api/connector/test.js:79` reads `body.connector_id`.
**Symptom**: Every "Test" button in Settings → Integrations returned
`{ok:false, detail:"unknown connector \"\""}` regardless of which
connector was actually configured. Operator could not verify Twilio /
Stripe / OpenAI credentials.
**Fix**: Send both `connector_id` (the API contract) and `connector_key`
(forward-compat). Also surface the API's `detail` / `missing_env` strings
so the operator sees the real reason ("missing env: TWILIO_ACCOUNT_SID")
instead of generic "test failed".
**Commit**: `53e8949 fix(connectors): align Settings test button to api/connector/test contract`

### 3. Audit-log agency hijack
**File**: `page-billing.jsx:262-263`
**Symptom**: `instrumentAudit` was tagging every audit row to whichever
agency `.from("agencies").select("id").limit(1).maybeSingle()` happened
to return. On a multi-tenant viewer (super_admin, IMO owner with N
memberships) that was almost never the agency the operator was actually
working in. RLS scoping was correct on the audit insert but the
`p_agency_id` arg was wrong.
**Fix**: Use `window.getActiveAgencyId()` (already defined in
`data.jsx:195`, prioritises explicit switcher → `me().agency_id`).
**Commit**: `575d327 fix(settings): wire Billing tab to live agency + AdminPlanCard` (combined commit)

### 4. Manager pipeline scope leak
**File**: `page-pipeline.jsx:41` (pre-fix)
**Symptom**: Only the rep view was scoped (`role === "rep"
? all.filter(p => p.owner === meId) : all`). Manager and owner shared
the unscoped `all` path. In agencies where one manager owns a slice of
producers, that manager could see (and reassign / bulk-edit) every other
manager's deals — a multi-tenant data leak inside the same agency.
**Fix**: Use `window.scopeRepIds()` the way `page-manager.jsx:69` and
`page-ops-depth.jsx:71` already do — null = fleet (owner / admin /
super_admin), `[me + downline]` for managers, `[me]` for reps.
**Commit**: `b8e536c fix(pipeline): manager view scopes to downline (was leaking fleet)`

### 5. SettingsBilling was a static card
**File**: `page-extras.jsx:2657-2707` (pre-fix)
**Symptom**: Hardcoded "Network · Annual / 9 of 25 producers / **** 4419
VISA" — fake numbers that drifted on every operator and ignored real
subscription state. Owner could not see real plan / period / status from
this surface; had to navigate to the standalone Billing page.
**Fix**: Replace with `AdminPlanCard` (already exists in
`page-billing.jsx:111-192`, wired to `/api/stripe/checkout` + `/api/stripe/portal`)
bound to the live `agencies` row. Add `BillingInvoicesPanel` reading
`billing_invoices` populated by the Stripe webhook. Realtime listener
on `data:mutated` re-pulls when webhook updates land.
**Commit**: `575d327 fix(settings): wire Billing tab to live agency + AdminPlanCard`

### 6. Pipeline → Sequences was 100% hardcoded
**File**: `page-pipeline-sequences.jsx:11-46` (pre-fix)
**Symptom**: `SEQ` and `ENROLLED` arrays seeded with Atlas demo cohort
(Cheryl Hampton, Robert Mendez, marc / dani / sade rep_ids). Real owners
saw fake names regardless of their tenant data. Migration 0011 +
hydrate already populate `AppData.SEQUENCES` and
`AppData.SEQUENCE_ENROLLMENTS` — they were just never read.
**Fix**: Add `_liveSeqList()` + `_liveEnrolledList(seqId)` projections
into the prototype's expected shape. Demo seed gated to demo agencies.
Real agencies with no live sequences see an empty state with a CTA.
`PIPELINE_SEQUENCES` export shifts from a static array to a function so
LeadDetail (`page-pipeline.jsx:441`) re-pulls each render and respects
realtime hydrate ticks. LeadDetail caller updated to invoke either form.
**Commits**: `40024f2`, `05b6544 fix(sequences): kill stray ENROLLED ref in sidebar active-count`

### 7. Lead Vendors / Attribution was 100% hardcoded
**File**: `page-attribution.jsx:10-35` (pre-fix)
**Symptom**: VENDORS / BY_STATE / BY_PRODUCT arrays seeded with demo
data (Facebook · T65 v3 creative, Convoso, Tampa, etc.). Owner ROAS,
CPA, CPL all displayed fake numbers regardless of the tenant's real
spend or policies.
**Fix**: Add `_liveAttribution()` that:
  - rolls `AppData.LEAD_SOURCES` + `AppData.EXPENSES` (lead_spend rows
    tagged to `lead_source_id`) into per-vendor spend
  - resolves leads to sources via `AppData.ATTRIBUTIONS` first, then
    `pipeline.source` string match against `source.name`
  - counts contacts / quotes / issued from `PIPELINE.stage`
  - sums realized AP from `POLICIES` joined back through `lead_pipeline_id`
  - allocates spend per state and per product by lead-share
Manager view scopes via `window.scopeRepIds()`. Owner sees fleet. Demo
seed only renders for demo agencies. Real agencies with no tagged spend
get an empty state with a CTA into the Expenses page (where
`lead_source_id` tagging lives).
**Commit**: `1be84e6 fix(attribution): wire Lead Vendors page to live AppData (was demo seed)`

### 8. ORG_SETTINGS never hydrated (saved values lost on refresh)
**File**: `data.jsx` post-fix lines 749-766
**Symptom**: `orgSettingsSave` (`data.jsx:1118`) upserts to
`public.org_settings`, but the hydrate path never read the table back.
Operator saves Settings → Organization name / NPN / operating_states once,
refresh page, sees empty defaults again. Same for the
`OperatingStatesEditor`'s 13-state default fallback.
**Fix**: Fail-soft fetch alongside the expenses hydrate. Handles jsonb
value column whether the driver returns parsed or stringified JSON.
**Commit**: `78ae858 fix(settings): hydrate org_settings so saved values survive refresh`

---

## Findings logged (not fixed this pass)

### High — owner-visible bugs

- **Migration 0017 ships demo seed inside a schema migration**
  (`supabase/migrations/0017_expenses.sql:225-236`). The CLAUDE.md
  hard rule "Schema migrations are CREATE TABLE / CREATE FUNCTION /
  CREATE POLICY only" forbids this. Atlas-only carve-out, but it
  still violates the principle and re-runs the seed on every replay.
  Recommend: move to a separate `seeds/atlas-demo.sql` script that's
  only run on demo provisioning.

- **`page-attribution.jsx:226` hardcodes "22%" override slice** in
  the projected outcome card. Should pull from agency commission grid
  (`AppData.PRODUCTS[].compPct` or `AgencyConfig.get().override_pct`).

- **`page-attribution.jsx:234-247` hardcodes 4 "optimization
  opportunities"** referencing LinkedIn agency owners / DataMail /
  Google bidding. Should compute from real CPA + persistency drift on
  live `vendors` array.

- **`page-pipeline-sequences.jsx:84-88,99,105`** — `Pause / Save / Add
  step / Send to anyone` controls in the sequence editor are dead
  buttons. No mutate.* binding. Owner cannot edit a sequence inline.

- **Settings → API keys** (`page-extras.jsx:3048-3105`) generates a
  client-side random "key" that's stored only in `sessionStorage`. No
  backend issuance. Documented in the comment but the operator-facing
  copy ("New API key generated · save it now") implies persistence.
  Fix: gate behind `AppData.LIVE` and surface "API key issuance
  endpoint not yet implemented" toast for live tenants.

- **Settings → Webhooks** (`page-extras.jsx:3088-3101`) hardcoded
  Atlas webhook URLs. Should pull from a `webhook_endpoints` table
  (doesn't exist yet) or hide for non-demo agencies.

- **`page-extras.jsx:3107-3187` SettingsRouting** is a local-state-only
  CRUD. Owner-side mutations should hit `routing_rules` (the table the
  manager-side `RoutingRulesModal` already writes to via
  `AppData.mutate.routingRuleSave` in `page-manager.jsx:883`).

### Medium — UX gaps

- **No Compliance tab in Settings.** `page-ops-depth.jsx:430-508`
  PageScrubbers exists as a standalone page but the Settings sidebar
  doesn't expose it. Brief mentioned `Compliance` tab — recommend
  adding `["compliance", "Compliance"]` to the `TABS` array
  (`page-extras.jsx:2503`) and rendering `<window.PageScrubbers/>`
  with a CTA to add carrier appointment rules.

- **No Products tab.** `AppData.PRODUCTS` is hydrated
  (`data.jsx:425`) but only the Carriers tab inline-displays them
  (read-only). Owner cannot add/edit products from Settings.

- **No Branding tab.** `agencies.brand_logo_url` /
  `agencies.brand_color` columns don't exist yet. Recommend a
  migration adding them + a Settings tab that uploads to Supabase
  storage and re-renders the topbar mark.

- **`page-owner.jsx:329-334` "Ask the Book" form** dispatches `ai:ask`
  but no listener is registered for that prompt context in the AI rail.
  Verify with a test query.

- **`page-owner.jsx:565` org-tree node sizing** uses MTD as a fallback
  when no policies. Acceptable, but the legend ("size = book of
  business") doesn't tell the operator that. Add a tooltip when
  fallback is in effect.

- **`page-pipeline-sequences.jsx`** "+ New sequence" button toasts
  "coming next pass" — owner has no way to author a sequence at all
  right now (only enroll into existing ones).

- **`page-attribution.jsx:76`** Top-bar buttons "April · Export · New
  vendor" are dead. Period selector should drive the rollup; Export
  should be a CSV button; New vendor should open the Lead Sources
  modal (or deeplink to Settings → wherever lead sources land).

### Low — UI / dense polish

- **`page-owner.jsx:316`** subtitle says "needs data" when `m.hasLive`
  is false — strong signal but could include a "Import policies" CTA
  inline rather than only in the empty waterfall state.

- **`page-owner.jsx:354`** the right rail has `gridTemplateColumns:
  "1.4fr 1fr"` which collapses awkwardly on narrow screens. Add a
  responsive media query class (existing `.org-grid` already does this
  for the org tree).

- **`page-attribution.jsx`** every panel has its own grid template;
  no shared `.attribution-grid` responsive class. Lower priority.

- **`page-tenant.jsx:445-446`** Carrier categories + product lines are
  hardcoded constants. Should come from a `carrier_categories` /
  `product_lines` reference table so an IMO owner can extend them.

---

## Engineering items already in good shape

- **Agent install via `agent_install_tokens`** — `api/agents/issue-token.js`
  has correct mint flow (operator JWT → `me()` resolution → role gate →
  insert under user JWT so RLS applies). Bootstrap flow correctly skips
  auth. The host enrollment polling in `page-platform.jsx:31-40` reads
  back the same table to detect callback. Migration 0005 tightened RLS
  appropriately. Note: brief referenced `rba_install_tokens`; actual
  table is `agent_install_tokens` (`rba_installs` is the separate
  agents-installed-on-an-agency table consumed by Settings → Agents).

- **Stripe checkout subscription** — `api/stripe/checkout.js` correctly
  returns 503 with a `missing` hint listing every absent env var, sets
  `client_reference_id = agency_id`, threads metadata + tier through
  `subscription_data`, and supports the three plans (rep_solo,
  agency_setup, agency_trial_7d).

- **Stripe portal** — `api/stripe/portal.js` (verified file exists,
  46 lines). `AdminPlanCard.openPortal` (`page-billing.jsx:123`)
  correctly threads JWT.

- **Owner expense + reimbursement workflow** —
  `page-expenses.jsx:369-414` `ReimburseQueue` + per-source ROAS panel
  + payment-source breakdown + CSV export. Fully wired. Migration
  0017 RLS correctly gates manager inserts to lead-spend / recruiting-
  ad / marketing / training / meals / travel kinds, owner manages all.

- **Connector OAuth (Gmail / Twilio / Stripe)** — `api/connector/test.js`
  has correct env var checks + provider whoami probes for OpenAI,
  Twilio, Mailgun, Stripe. Returns 200 with `{ok, detail, missing_env}`
  so the UI can render inline. (Gmail isn't in the CHECKS map; brief
  mentioned it. Recommend adding a `gmail` entry that probes the OAuth
  refresh token via `https://www.googleapis.com/gmail/v1/users/me/profile`.)

---

## Commits in this branch

```
85f128c ui(owner-audit): re-skin to koino.capital DS (green + black, rounded soft)
78ae858 fix(settings): hydrate org_settings so saved values survive refresh
05b6544 fix(sequences): kill stray ENROLLED ref in sidebar active-count
1be84e6 fix(attribution): wire Lead Vendors page to live AppData (was demo seed)
40024f2 fix(sequences): wire Pipeline -> Sequences to live AppData (was demo seed)
b8e536c fix(pipeline): manager view scopes to downline (was leaking fleet)
575d327 fix(settings): wire Billing tab to live agency + AdminPlanCard
53e8949 fix(connectors): align Settings test button to api/connector/test contract
b9430c4 fix(owner): hydrate AppData.EXPENSES + LEAD_SPEND_TOTALS for P&L waterfall
```

9 commits, 0 pushes (per brief).

## Recommended next pass

1. Add **Compliance / Products / Branding** Settings tabs (medium-UX).
2. Wire **Settings → Routing rules** owner-side to `routing_rules` table
   (matches manager-side already via `RoutingRulesModal`).
3. Build **inline sequence editor** — owner can author a sequence from
   `page-pipeline-sequences.jsx` directly, not just enroll.
4. Move migration 0017's Atlas demo seed out of schema migration into a
   `seeds/` script.
5. Replace `page-attribution.jsx:226` "22% override" with live
   `AgencyConfig` value.
6. Add a `gmail` entry to `api/connector/test.js` CHECKS map.
7. **DS migration** — propagate the `.koino-ds` palette across the rest of
   the OS (sidebar, topbar, page-owner / page-platform / page-ops-depth /
   page-recruiting / page-manager / page-pipeline). Either rename the
   existing oklch tokens to point at the koino.capital values or wrap each
   page shell in `.koino-ds`. Consistency hit until that lands: the audit
   surfaces (Settings → Billing, attribution + sequences empty states)
   render in the green+black website palette, while the rest of the OS
   still renders in the dark+amber prototype palette.
