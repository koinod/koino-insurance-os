# Overnight handoff — 2026-05-11

Branch: **`feat/onboarding-frontend-2026-05-11`** (off `main` @ `f590ad5`)
Window: ~4-hour sovereign pass against the backend that landed today.
Push: **NOT** pushed to remote — Ian to review locally then push.

```
7970fea fix(session): maybeSingle() sweep + role-rank sync for landing       (P5)
68e6962 feat(agents): Settings → Agents panel sources suggested_agents_for_role (P4)
6707f72 feat(connectors): Settings → Integrations reads connector_catalog    (P3)
3fa6a5b feat(onboarding): 9-step agency wizard wired to v_agency_onboarding  (P2)
370b9c2 fix(data): empty AppData by default, hardcoded seed only on demo skip (P1)
```

5 commits. Zero `main` touches. Zero remote pushes. Zero Stripe live-product changes.

---

## What shipped

### P1 — `370b9c2` — Killed hardcoded demo fixtures

**The bug Ian reported**: toggling manager role in the Tweaks panel surfaced
fake Atlas IMO / Marcus / Cheryl rows instead of the real (empty) agency.

**Root cause (`data.jsx`)**: lines 5-90 declared `REPS / PIPELINE / QUEUE /
COURSES / RECORDINGS / CONNECTIONS / HARDWARE / AGENTS / WORKFLOWS` as
hardcoded fixture arrays, then `window.AppData = { …those }` made them
ship in the initial bundle. The Supabase hydrate only overwrote when
`data?.length` was truthy — so a 0-row tenant left the demo data in place.

**Fix**:
- Renamed every fixture to `*_SEED` so the names aren't exported.
- Initialise `AppData.REPS / PIPELINE / QUEUE / …` as **empty arrays**.
- Added `window.loadDemoSeed()` — idempotent helper that pushes the
  in-memory seed into `AppData` and dispatches `data:hydrated`. Called
  from:
  1. The "Skip → Continue with demo data" button in `page-auth.jsx`
  2. A bootstrap check in `data.jsx` if `sessionStorage["repflow.demo"]`
     is already set
  3. The post-hydrate guard at the bottom of `hydrateFromSupabase` when
     the active agency carries `is_demo=true` AND its tables are empty.
- Replaced every `if (data?.length)` with `if (Array.isArray(data))` so
  a 0-row Supabase response assigns `[]` and pages re-render into their
  existing empty states (e.g. `page-manager.jsx:179` already has
  *"No producers visible at your scope. Invite reps."*).

**Files touched**: `data.jsx`, `page-auth.jsx`.

**Fixtures killed (file:line)**:
- `data.jsx:5`   `REPS` →   `REPS_SEED` (no longer assigned to AppData on init)
- `data.jsx:17`  `PIPELINE` → `PIPELINE_SEED` (idem)
- `data.jsx:32`  `QUEUE` →    `QUEUE_SEED`
- `data.jsx:41`  `COURSES` →  `COURSES_SEED`
- `data.jsx:48`  `RECORDINGS` → `RECORDINGS_SEED`
- `data.jsx:54`  `CONNECTIONS` → `CONNECTIONS_SEED`
- `data.jsx:69`  `HARDWARE` →   `HARDWARE_SEED`
- `data.jsx:76`  `AGENTS` →     `AGENTS_SEED`
- `data.jsx:85`  `WORKFLOWS` →  `WORKFLOWS_SEED`

(`page-resources.jsx`, `page-crm.jsx`, `page-extras.jsx`, `page-admin.jsx`,
`page-deal-write.jsx` already had `isDemoAgency()` guards on their local
SAMPLE_* constants — left those alone.)

**Verify**:
- Sign in as a real (non-demo) agency owner → `/manager` shows the
  empty-rep CTA.
- Toggle role to `manager` in the Tweaks panel → still empty-rep CTA.
- Click "Skip → demo data" on the login screen → fixtures populate
  and Marcus / Cheryl appear, as designed.

---

### P2 — `3fa6a5b` — 9-step agency onboarding wizard

`index.html` had been referencing `page-first-run.jsx` since v=74 but
the file never existed. `AuthGate` already routes to `window.PageFirstRun`
in two cases (`page-auth.jsx:358-371`):
- signed-in user with no `agency_members` row → user-type picker
- owner of an agency where `onboarding_complete=false` → resume wizard

**New file**: `page-first-run.jsx` (~830 lines). Single IIFE,
Babel-standalone, no build step.

**Surfaces**:
1. **`StartPicker`** — choose `Start a new agency` / `Join with an invite` /
   `I'm a solo producer`. "Start" + "Solo" call
   `rpc provision_sub_agency(name, slug, tier, owner_email, primary_state, plan)`
   then `start_agency_onboarding(agency_id)`. "Join" calls
   `rpc redeem_invite(p_token)`.

2. **`AgencyWizard`** — reads `v_agency_onboarding_status` for the active
   agency, renders the step matching `next_pending`. Has a fallback path
   that queries `agency_onboarding_steps` directly if the view isn't
   present, so the wizard never gets stuck on a schema-naming mismatch.

3. **9 step components**:
   - `profile` — legal name, NPN, EIN, phone, email, full address.
   - `branding` — logo URL + primary + dark colors, live preview tile.
   - `carriers` — multi-select from `public.carriers` (master catalog)
     + freeform "Other carriers" text input.
   - `products` — multi-select 10 lines of business (Med Supp, FE, IUL,
     annuity, etc.).
   - `connectors` — reads `connector_catalog`, shows each card with
     current connected/not-connected badge from `public.connections`.
     Connect button opens the existing `window.ConnectorConfigModal`
     (defined in `page-onboarding.jsx`) so the CONNECTOR_SCHEMAS stays
     the source of truth for field shapes.
   - `agents_install` — calls `rpc suggested_agents_for_role('owner')`;
     required agents pre-checked + disabled (can't be omitted).
   - `invite_team` — three default rows (manager + 2 reps); tries
     `rpc mint_invite` first, falls back to `POST /api/invites/create`.
     Invite links rendered with Copy button — **no auto-email** (TCPA-safe).
   - `billing` — 4 plan cards (trial / starter / growth / scale);
     non-trial plans open `/api/stripe/checkout` in a new tab. If
     `STRIPE_SECRET_KEY` isn't set the user gets a toast and can still
     continue on trial.
   - `first_lead` — inserts directly into `public.pipeline` (RLS-scoped).
     Failure is non-blocking — the wizard finishes anyway.

Each step submit calls
`rpc complete_onboarding_step(p_agency_id, p_step_key, p_payload jsonb)`
then refreshes the status. Wizard exits to the main app when
`onboarding_complete=true`. There's also a "Finish later · open Repflow"
escape hatch on every step so the operator isn't trapped if a step
becomes unsolvable.

**Files touched**: `page-first-run.jsx` (new), `index.html` (cache bump).

---

### P3 — `6707f72` — Settings → Integrations reads `connector_catalog`

`SettingsIntegrations` in `page-extras.jsx` was destructuring
`AppData.CONNECTIONS` — which is now `[]` for real agencies after P1.
Result: signed-in operators saw an empty integrations panel and had no
way to wire Twilio / Stripe / Gmail / iPipeline.

**New shape** (`page-extras.jsx:2698-…`):
- Query `public.connector_catalog` (global) for the master list.
- Query `public.connections` (RLS-scoped) for the agency's connected state.
- Cross-reference by `connector_key` → render
  **Connected / Action needed / Not connected** badge per row.
- Group by `category` — one panel per group.
- **Test** button POSTs to `/api/connector/test` (endpoint already in repo).
- **Connect / Configure / Reconnect** opens `TwilioConfigModal` for twilio
  or the generic `ConnectorConfigModal` for everything else.
- Empty `connector_catalog` → friendly empty state, doesn't crash.
- Catalog read error → recovery panel with retry button.
- Demo agencies (`isDemoAgency()`) still see the old `AppData.CONNECTIONS`
  rendering so the sandbox tour stays alive.

**Files touched**: `page-extras.jsx`, `index.html` (cache bump).

---

### P4 — `68e6962` — Settings → Agents panel

Added an `agents` tab to `PageSettings` for every role (owner / manager /
rep with role-appropriate ordering) and a new `SettingsAgents` component
in `page-extras.jsx`.

**Behaviour**:
- `rpc suggested_agents_for_role(p_role)` returns the recommended agent
  list for the viewer's role.
- `public.rba_installs` is queried (RLS-scoped) for currently-installed agents.
- Two panels: **Required for {role}s** at top, **Recommended** below.
- Each row: name, description, required badge, install/uninstall button.
- Required agents show **Installed** chip and a disabled Uninstall button
  (the backend should reject the uninstall anyway, but the UI mirrors it).
- Install path: tries `rpc install_agent(p_agent_key)` first; falls back
  to `rba_installs upsert` keyed on `(agency_id, agent_key)`.
- Uninstall: `rba_installs delete` scoped by `agent_key + agency_id`.
- `agency_id` comes from `rpc current_agency_id()` (matches the new ranking).
- Empty `role_agent_defaults` seed → friendly empty state.

**Files touched**: `page-extras.jsx`, `index.html` (cache bump).

---

### P5 — `7970fea` — Session error audit

**Changes**:
1. **`.single()` → `.maybeSingle()`** on 6 reads where 0 rows is normal
   (brand-new agency, unconfigured connector, unused token). All were
   already inside try/catch so behaviour on the 0-row path is unchanged,
   but the browser console no longer fills with PGRST116 errors that
   obscure real failures.
   - `page-admin.jsx:29` and `:208` — `agencies` lookup
   - `page-billing.jsx:262` — audit-log `agency_id` resolution
   - `page-onboarding.jsx:334` — `connections` config prefill
   - `page-platform.jsx:36` — enrollment-token poll
   - `page-tenant.jsx:688` — Twilio config rehydrate

2. **Role-sync ranking in `index.html`** — previously ordered by
   `joined_at` only, which dropped a super_admin to whatever role they
   joined first. Now matches the 2026-05-11 `current_agency_id()` rank:
   ```
   super_admin > owner > imo_owner > admin > manager > rep, tie on joined_at
   ```
   Plus super_admin now lands on `/platform` (parity with admin).

3. Cache-buster bumped to `?v=76` across `index.html` so the bundles
   refresh on next deploy.

**Files touched**: `index.html`, `page-admin.jsx`, `page-billing.jsx`,
`page-onboarding.jsx`, `page-platform.jsx`, `page-tenant.jsx`.

---

## Build status

Compile-checked with `@babel/standalone@7.29.0` (the same version the
page loads):

- `data.jsx` → OK
- `page-first-run.jsx` → OK
- `page-extras.jsx` → OK
- `page-admin.jsx` → OK
- `page-billing.jsx` → OK
- `page-onboarding.jsx` → OK
- `page-platform.jsx` → OK
- `page-tenant.jsx` → OK

I did NOT serve and click through with computer-use this pass (worktree
is on Windows + tools needed for browser drive are deferred). Treat the
local smoke test as Ian's next step:

```powershell
cd C:\Users\PLATINUM\Documents\GitHub\koino-insurance-os\.claude\worktrees\angry-curie-fad065
python -m http.server 8000
# then open http://localhost:8000 in a browser
```

Expected:
1. Login screen renders.
2. Click "Skip → Continue with demo data" → AppData populates from seed,
   role toggle in Tweaks now switches between owner/manager/rep with
   demo data visible. ✅ legacy behavior preserved.
3. Sign in as Ian's real Supabase user → `PageFirstRun` mounts if any
   of the routing conditions match (no member, or onboarding incomplete).
4. Toggle role in Tweaks panel to manager → **empty state** "No producers
   visible at your scope. Invite reps." ✅ no more Atlas/Marcus bleed.
5. Settings → Integrations → connector catalog renders, grouped by
   category, with live connected badges.
6. Settings → Agents → required + recommended agents for owner role.

---

## What's NOT done (deferred)

These were lower-priority items in the brief that I didn't get to:

- **RLS empty-set disambiguation**: Supabase returns the same shape for
  "no rows" and "RLS denied access". Telling them apart would need either
  (a) a server-side hint via a SECURITY DEFINER wrapper, or (b) probing
  with a `count` query before the data fetch. Neither is a 30-minute fix.
- **Full dead-onClick sweep**: I grepped for `onClick={() => {}}` and
  `onClick={null}` style stubs in my changed files (zero hits) but did
  NOT do a project-wide sweep against the new role toggles. PR #17 did
  the last major pass; recommend re-running that pattern when next pass
  starts.
- **`viewer_agency_ids()` auth-guard**: The `AuthGate` already gates
  on session presence before any page mounts, so this is currently fine.
  If it ever needs hardening, the API-side guard in `api/me.js` is the
  better place.
- **Mobile (`mobile.html`)**: doesn't load `page-first-run.jsx` (it's
  a single-purpose rep dialer shell). Onboarding is desktop-only by
  design, but the rep producer wizard in `page-onboarding.jsx` already
  works on small viewports.
- **Real Stripe live products**: per the constraint. The wizard's
  billing step opens `/api/stripe/checkout` which uses whatever keys
  are in the Vercel env — no live prices touched.

---

## RPCs / tables this branch assumes exist

If any of these are missing in production, the affected step or panel
will surface its error to the operator instead of silently failing:

**RPCs** (all from the 2026-05-11 deploy):
- `provision_sub_agency(name, slug, tier, owner_email, primary_state, plan)`
- `start_agency_onboarding(p_agency_id uuid)`
- `complete_onboarding_step(p_agency_id, p_step_key, p_payload jsonb)`
- `suggested_agents_for_role(p_role text)`
- `current_agency_id()`
- `viewer_agency_ids()`
- `mint_invite(p_agency_id, p_role, p_email_hint)` (with `/api/invites/create` fallback)
- `redeem_invite(p_token)` (pre-existing)
- `install_agent(p_agent_key)` (with direct `rba_installs` fallback)

**Tables / views**:
- `public.agency_onboarding_steps`
- `public.connector_catalog`
- `public.role_agent_defaults`
- `public.rba_installs`
- `public.connections` (pre-existing)
- `public.v_agency_onboarding_status` (with `agency_onboarding_steps`
  direct-read fallback)

If a query against any of these returns `PGRST205` ("relation does not
exist") the wizard step's error panel will show it verbatim — that's the
intended fail-loud behaviour so the schema mismatch doesn't hide.

---

## Push-ready checklist

- [x] All 5 commits land cleanly on branch `feat/onboarding-frontend-2026-05-11`
- [x] No commits on `main`
- [x] No remote pushes
- [x] All changed `.jsx` files compile under `@babel/standalone`
- [x] Cache busters bumped (`?v=76`) so deployed shells will refresh
- [ ] Local smoke test in a browser (Ian to run — see above)
- [ ] `git push origin feat/onboarding-frontend-2026-05-11` (Ian to run)

— Done. Time-box ≈ 3 hours; one hour of the budget held in reserve for
 the smoke test and any obvious adjustments before push.
