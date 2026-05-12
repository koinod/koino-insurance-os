# Owner role audit · 2026-05-11

Branch: `feat/role-audit-owner-2026-05-11` (off `feat/onboarding-frontend-2026-05-11`)
Scope: every page + Settings tab the **owner** role lands on.
Method: read each surface end-to-end, trace every render path back to either
live data (Supabase tables hydrated through `data.jsx`) or hardcoded seed,
flag mismatches with file:line. **Two passes**: pass 1 fixed the data
hydrate + replaced demo-seed pages with live data + shipped the koino DS
layer; pass 2 drilled every button on every surface, wired sequence /
NIGO / forecast mutate paths, added Products / Compliance / Branding
Settings tabs, and surfaced owner-only levers (forecast override, anomaly
snooze, Org Tree → page scope handoff).

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
| 1 | P&L · Agency P&L | `page-owner.jsx:200-496` | shipped pass 1 + 2 — data hydrate + anomaly snooze + period-aware waterfall |
| 2 | Org Tree | `page-owner.jsx:498-791` | shipped pass 2 — "Drill into sub-tree" carries scope to /attribution + /performance |
| 3 | Platform · Hardware (PageHardware) | `page-ops.jsx:155-300` | shipped pass 2 — per-host Inspect + Remove + empty state |
| 4 | Platform · Hardware enroll modal | `page-platform.jsx:10-94` | live · OK |
| 5 | Platform · Agent deploy modal | `page-platform.jsx:97-162` | live · OK |
| 6 | Platform · Calling setup (Twilio + helpers) | `page-platform.jsx:217-522` | live · OK |
| 7 | Ops-depth · NIGO queue | `page-ops-depth.jsx:30-194` | shipped pass 2 — Log NIGO button + mutate path bugs fixed |
| 8 | Ops-depth · Carriers | `page-ops-depth.jsx:296-425` | live · demo gated |
| 9 | Ops-depth · Scrubbers | `page-ops-depth.jsx:430-540` | shipped pass 2 — gains `embedded` prop for Settings → Compliance |
| 10 | Ops-depth · Forecast | `page-ops-depth.jsx:545-`  | shipped pass 2 — Set goal + Override forecast levers |
| 11 | Attribution · Lead Vendors | `page-attribution.jsx` | shipped pass 1 + 2 — live data, period selector, CSV, New vendor modal, live optimization signals, Org-Tree scope chip |
| 12 | Pipeline → Sequences | `page-pipeline-sequences.jsx` | shipped pass 1 + 2 — live data + full inline editor (new / save / pause / step CRUD) |
| 13 | Recruiting (owner-scope) | `page-recruiting.jsx:74-160` | live · `useScope()` correctly returns `isOwner` |
| 14 | Manager · Coaching · Owner view | `page-manager.jsx:769-836` | live · derives from `COACHING_SESSIONS` |
| 15 | Pipeline (owner view) | `page-pipeline.jsx:1-50` | shipped pass 1 — manager scope was leaking fleet |
| 16 | Settings · Organization | `page-extras.jsx:2565-2599` | shipped pass 1 (hydrate) — saves now survive refresh |
| 17 | Settings · Team & invites | `page-tenant.jsx:265-438` | live · OK |
| 18 | Settings · Carriers | `page-tenant.jsx:447-674` | live · OK (legacy + appointments fallback) |
| 19 | Settings · Products | `page-extras.jsx` `SettingsProducts` | **NEW pass 2** — live CRUD over public.products |
| 20 | Settings · Billing | `page-extras.jsx` `SettingsBilling` | shipped pass 1 — replaced static stub with live `KoinoPlanCard` + invoices |
| 21 | Settings · Integrations (Connectors) | `page-extras.jsx:2709-2876` | shipped pass 1 — Test button param mismatch |
| 22 | Settings · Agents | `page-extras.jsx:2891-3046` | live · OK (`suggested_agents_for_role` + `rba_installs`) |
| 23 | Settings · API keys | `page-extras.jsx:3218-` | shipped pass 2 — gated session-only mock behind isDemo, webhooks from `webhook_endpoints` |
| 24 | Settings · Routing rules | `page-extras.jsx:3107-3187` | shipped pass 2 — owner-side now hits `routing_rules` |
| 25 | Settings · Notifications | `page-extras.jsx` `SettingsNotifications` | live (writes to `notification_prefs`) |
| 26 | Settings · Profile | `page-extras.jsx:3553-` | live · `save_profile` + `get_my_profile` RPCs (P6/P7) |
| 27 | Settings · Calling | `page-platform.jsx:353-522` | live · OK |
| 28 | Settings · Compliance | `page-extras.jsx` `SettingsCompliance` | **NEW pass 2** — TPMO/SOA/DNC toggles + embedded scrubber |
| 29 | Settings · Branding | `page-extras.jsx` `SettingsBranding` | **NEW pass 2** — name/tagline/color/logo upload to Supabase storage |
| 30 | Owner expenses | `page-expenses.jsx` | live · OK (queries `agency_expenses` directly) |
| 31 | Stripe checkout | `api/stripe/checkout.js` | OK · 503 with `missing` hint when env unset |
| 32 | Connector OAuth probe | `api/connector/test.js` | OK (post-fix to client) |
| 33 | Agent install via `agent_install_tokens` | `api/agents/issue-token.js` + `0002_fill_missing_domains.sql:36` | OK · note: brief mentioned `rba_install_tokens`; actual table is `agent_install_tokens` (`rba_installs` is the separate agents-installed-on-agency table consumed by Settings → Agents) |

The pass-1 audit flagged Products / Compliance / Branding as missing
tabs. Pass 2 shipped all three.

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

## Pass 2 fixes shipped (drilled every button)

### 9. Attribution toolbar fully wired + live optimization signals
**File**: `page-attribution.jsx`
- Period selector pill (MTD / T30 / T90 / YTD) replaces the dead "April"
  button. `_liveAttribution()` accepts a period cutoff so spend / AP /
  ROAS reflect the chosen window. Header reads "By vendor · MTD" instead
  of stuck on "April".
- Export button writes a CSV of the active tab (vendors / state /
  product) with per-period file naming.
- New vendor button opens `NewLeadVendorModal` — inserts into
  `agency_lead_sources` and re-hydrates.
- ROI explorer's hardcoded 22% override replaced with
  `AgencyConfig.get().override_pct`. Slider range bumped to $100k.
  Saturation cap now derives from each vendor's actual spend × 2 (was
  flat $12k).
- `OptimizationOpportunitiesPanel` rebuilt from live VENDORS array —
  Cut/Scale/Watch/Test/Tag signals derived from real CPA, ROAS,
  persistency, untagged-spend.
- `lib/agency-config.js`: added `override_pct` to DEFAULTS +
  mergeWithDefaults.
**Commit**: `f83bc36`

### 10. Sequences inline editor (every step wired)
**File**: `page-pipeline-sequences.jsx` + `data.jsx`
- Sidebar "+" opens `NewSequenceModal` (creates a starter-step sequence).
- Header sequence name is now an editable input.
- Pause / Resume button calls new `AppData.mutate.sequenceToggleActive`
  → `sequences.is_active`.
- Save button calls new `AppData.mutate.sequenceSave` → insert or
  update `public.sequences`.
- Per-step day input now editable. Channel `Select` wired. Condition
  "Send to anyone" / "Only if no reply" / "no_book" / "no_open" wired.
- Per-step textarea is now controlled (was `defaultValue`, edits lost
  on re-render).
- Per-step delete button added; Add step button appends day+1 starter.
- Enrolled-leads table gains pause/resume per row via new
  `AppData.mutate.enrollmentStatus`.
**Commit**: `58eedf5`

### 11. Settings → Routing rules now hits the database
**File**: `page-extras.jsx`
- `SettingsRouting` loads from `public.routing_rules` on mount, writes
  via `AppData.mutate.routingRuleSave` / `routingRuleDelete` (the same
  paths the manager-side `RoutingRulesModal` uses). Per-rule active
  toggle. Was local-state-only CRUD that vanished on refresh.

### 12. Settings → API keys gates fake key behind demo
**File**: `page-extras.jsx`
- Live tenants see "issuance endpoint not yet wired" notice + a
  recommendation to use the agent install token for now. Demo agencies
  can still play with the session-only key.
- Webhooks read from `public.webhook_endpoints` (empty state when the
  table isn't seeded) instead of hardcoded Atlas zapier / n8n URLs.

### 13. Settings → Products tab (new)
**File**: `page-extras.jsx` `SettingsProducts`
- Live CRUD over `public.products`. Owner adds / edits / archives.
  Joins to `carriers` for the carrier picker. Drives the deal-write
  product list + per-product attribution.

### 14. Settings → Compliance tab (new)
**File**: `page-extras.jsx` `SettingsCompliance`
- TPMO / SOA / DNC policy toggles + grace window + recording retention.
  Persists to `org_settings` via `orgSettingsSave`. Embeds the existing
  `PageScrubbers` (now `embedded` prop) so the owner can test pre-call
  scrub from the same surface.

### 15. Settings → Branding tab (new)
**File**: `page-extras.jsx` `SettingsBranding`
- Display name + tagline + accent color (with live preview) + logo
  upload to Supabase storage bucket `agency-brand`. No new migration —
  all four keys land in `org_settings` until a brand-columns migration
  ships. Friendly toast on missing-bucket so operator knows to
  provision it.
- Re-skinned in `.koino-ds` (green + black, rounded soft).
**Commits**: `a1cbabc`, `fb1d772` (DS polish)

### 16. PageHardware per-host actions (Inspect + Remove)
**File**: `page-ops.jsx`
- Each host card gains Inspect + Remove buttons.
- `HostInspectModal` pulls `agent_deployments` + last 8 `agent_runs`
  for the host. Shows status / uptime / load KPIs, deployments table,
  recent runs with status pills, shortcut to Agents page.
- Empty state when no hosts (was blank grid).
**Commit**: `0f1a0d7`

### 17. NIGO + Forecast mutate path bugs + new levers
**File**: `data.jsx` + `page-ops-depth.jsx`
- `nigoCreate` was writing to non-existent `nigo_items` table; actual
  table from migration 0002 is `nigos`. Same bug on `nigoStatus`.
  Every NIGO insert / status update silently errored on real tenants.
- Both functions used `AppData.NIGO` (singular) for the in-memory copy;
  hydrate populates `AppData.NIGOS` (plural). Optimistic updates were
  invisible.
- PageNIGO gains "Log NIGO" button + `NewNIGOModal` picking live
  policies / `nigo_reasons` / reps.
- PageForecast gains "Set goal" (persists
  `forecast_monthly_goal_cents` to `org_settings` — Coverage ratio
  KPI now uses it instead of hardcoded $50k) and "Override forecast"
  (pins manual number via new `forecastOverrideSet` writing to
  `public.forecast_overrides`).
**Commit**: `3d5e890`

### 18. Owner anomaly snooze + Org Tree scope handoff
**File**: `page-owner.jsx` + `page-attribution.jsx`
- Anomaly cards gain 24h snooze action (X icon). Keyed by (title +
  body) hash, persisted in localStorage with auto-prune. "{N} snoozed"
  link to clear.
- Waterfall panel header reflects period ("Revenue waterfall · year to
  date" vs hardcoded "this month").
- Org Tree "Drill into sub-tree" stashes resolved `rep_ids` + label in
  sessionStorage before nav. Rep nodes → `/performance`; region / owner
  → `/attribution`.
- `page-attribution.jsx` reads sessionStorage scope on mount; layers
  over manager scope inside `_liveAttribution` (tree scope wins).
  Header shows green "Filtered: <label> ×" chip; × clears back to
  fleet/manager view.
**Commit**: `b7ed3d6`

## Commits in this branch

```
fb1d772 ui(settings): re-skin new Settings tabs to koino.capital DS
b7ed3d6 fix(owner): anomaly snooze + scope handoff from Org Tree drill-in
3d5e890 fix(ops-depth): NIGO create + forecast override + monthly goal levers
0f1a0d7 fix(hardware): per-host inspect + remove actions, empty state
a1cbabc fix(settings): owner Routing+API live + Products+Compliance+Branding tabs
58eedf5 fix(sequences): wire inline editor + new sequence + pause/save/add-step
f83bc36 fix(attribution): toolbar period + export + new-vendor + live opportunities
d211ed3 docs: note koino.capital DS in OWNER_AUDIT_REPORT.md
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

17 fix commits + 2 doc commits, 0 pushes (per brief).

## Recommended next pass

1. ~~Add **Compliance / Products / Branding** Settings tabs~~ — shipped pass 2.
2. ~~Wire **Settings → Routing rules** owner-side to `routing_rules`~~ — shipped pass 2.
3. ~~Build **inline sequence editor**~~ — shipped pass 2.
4. ~~Replace `page-attribution.jsx` "22% override" with `AgencyConfig`~~ — shipped pass 2.
5. Move migration 0017's Atlas demo seed out of schema migration into a
   `seeds/` script.
6. Add a `gmail` entry to `api/connector/test.js` CHECKS map.
7. **Schema migration** — add `agencies.brand_logo_url`,
   `agencies.brand_color`, `agencies.brand_tagline` columns. Branding tab
   currently writes to `org_settings` jsonb which works but isn't joinable
   from the agencies table.
8. **Storage bucket** — provision public `agency-brand` bucket on Supabase
   with RLS allowing owners to write `<agency_id>/*`. Branding tab logo
   upload otherwise toasts a friendly create-bucket message.
9. **`api/keys/*` endpoints** — the Settings → API keys tab still surfaces
   "endpoint not yet wired" for live tenants. Build the issuance /
   rotation / revocation flow.
10. **Hourly snooze options** — owner anomaly snooze is 24h only. Could
    add 4h / 7d / forever buttons.
11. **DS migration** — propagate `.koino-ds` palette across the rest of
    the OS (sidebar, topbar, page-owner / page-platform / page-ops-depth
    / page-recruiting / page-manager / page-pipeline). Either rename the
    existing oklch tokens to point at the koino.capital values or wrap
    each page shell in `.koino-ds`. Until that lands, audit surfaces
    (Settings → Billing / Branding / Products / Compliance, attribution
    + sequences empty states) render in the green+black website palette
    while the rest of the OS renders the dark+amber prototype palette.
12. **NIGO reasons seed** — the new `NewNIGOModal` falls back to "empty
    picker" when `public.nigo_reasons` has no rows; seed the canonical
    list (Missing signature, Banking info wrong, DOB mismatch, etc.) on
    agency provision.
13. **Forecast override surfacing** — when an override is active, P&L
    pages (page-owner, page-today) should display "manual override
    active" so other operators don't think the weighted calc is broken.
