# Onboarding E2E Audit — 2026-05-15

## TODO (top of file) — backend work required before onboarding fully works

The frontend onboarding wizards (`page-first-run.jsx`, `page-onboarding.jsx`) target a
Supabase schema that **has not landed in `main`'s migrations**. The frontend changes in
this sprint make the wizards survive the gap (fallback to localStorage, "Skip to Today"
escape hatches, clearer error messages), but a real owner cannot complete onboarding to
the database without these:

1. **`agencies.onboarding_complete boolean default false`** column. Drives AuthGate's
   resume detection. `loadTenant` now selects it with a 42703 fallback, but the column
   is missing.
2. **Table `public.agency_onboarding_steps`** — `(agency_id uuid, step_key text,
   status text, payload jsonb, sort_order int, updated_at timestamptz)` plus the
   STEPS seed (profile, branding, carriers, products, connectors, agents_install,
   invite_team, billing, first_lead). RLS scoped to viewer's agencies.
3. **Table `public.connector_catalog`** — `(id text/uuid, connector_key text, label
   text, description text, category text, sort_order int, required_for_roles text[],
   config_schema jsonb)`. Loaded in StepConnectors. Without it the empty-state hint
   triggers, but the user can still reach Twilio via the inline shortcuts.
4. **Table `public.role_agent_defaults`** + RPC `suggested_agents_for_role(p_role text)
   returns setof (...)`. Drives StepAgents. Without it the wizard shows "No agent
   defaults set up yet" and continues — non-blocking.
5. **RPC `provision_sub_agency(p_name, p_slug, p_tier, p_owner_email, p_primary_state,
   p_plan)`** returning `jsonb { agency_id }` or `uuid`. Creates the agency + the
   first agency_members row with role=owner + seeds onboarding step rows. **Without
   this, account creation fails entirely.** This is the single blocking gap.
6. **RPC `start_agency_onboarding(p_agency_id uuid)`** idempotently seeds step rows.
7. **RPC `complete_onboarding_step(p_agency_id, p_step_key, p_payload jsonb)`** marks
   a step as completed + records payload. Frontend now falls back to localStorage on
   PGRST202 "function does not exist", so progress is per-browser only until this lands.
8. **View `public.v_agency_onboarding_status`** — derived `{ onboarding_complete,
   complete_steps, total_steps, next_pending, done_steps, pending_steps }` keyed on
   `agency_id`.
9. **RPC `provision_rep_for_member(p_name, p_handle, p_phone, p_email, p_npn,
   p_license_states, p_carrier_appts)`** — creates the rep row + links to
   agency_members. ProducerOnboardingWizard now surfaces a clearer error when this is
   missing, but reps can't actually finish their producer profile without it.
10. **Column `public.connections.config jsonb`** — used by `ConnectorConfigModal`
    to save Twilio/Vapi/etc. credentials. Save currently fails silently.

Schema-fix plan: one migration `0037_onboarding_backend.sql` that lands #1–#9 in order
(#1 then #2/#3/#4 tables, then #5–#7 RPCs that reference them, then #8 view that
references the tables). #10 can be its own small migration.

---

## Walk-through, step by step

The audit walks through a brand-new agency owner from "Sign in" to "I see Today" using
the actual code paths in `page-auth.jsx` → `page-first-run.jsx` → `page-onboarding.jsx`.

### Step 0 — Sign in
- **Path**: `LoginScreen` → magic-link → `AuthGate` resolves `session`.
- **State**: `me().role === "unmapped"`, `tenant.member === null`.
- **Working**: ✅ AuthGate routes to `PageFirstRun` `StartPicker` (line 405-409 in
  `page-auth.jsx`).
- **Was broken / fixed**: N/A.
- **Remaining**: N/A.

### Step 1 — Agency-create flow (StartPicker → AgencyWizard)
- **Path**: `StartPicker` mode=`pick` → user picks "Start a new agency" or "Solo
  producer" → mode=`start` → enter name/state → `startAgency(kind)`.
- **Was broken**:
  - Solo-producer button silently provisioned an `agency`-tier sub-agency because
    `startAgency("agency")` was hardcoded — kind got dropped between the buttons and
    the submit.
  - On RPC-missing error the toast showed raw PG codes that no human could action.
- **Fixed (commit `23298ad`)**:
  - Added `kind` state tracked from button click, passed into provision call.
  - Friendly recovery message when `provision_sub_agency` is missing.
- **Remaining broken**: `provision_sub_agency` is **not deployed** in
  `supabase/migrations/`. New owners cannot create an agency end-to-end on this
  branch's Supabase schema. See backend TODO #5. Frontend gracefully surfaces the
  error and the operator can still pick the demo path.

### Step 2 — Resume detection (relogin after partial onboarding)
- **Path**: AuthGate checks `tenant.agency.onboarding_complete === false &&
  tenant.member.role === "owner"` → resume the wizard.
- **Was broken**:
  - `loadTenant` only selected `(id, slug, name, plan, state)` from `agencies` — never
    fetched `onboarding_complete`. The check at line 414 always evaluated to
    `undefined === false` → never resumed. Anyone who exited the wizard mid-flow lost
    their place forever.
  - Resume gate only matched `role === "owner"`. But the role retirement in `app.jsx`
    collapses owner → manager for the UI tweak, and depending on how the agency was
    provisioned the DB role might be `manager` rather than `owner`. Both should
    resume.
- **Fixed (commit `2d80517`)**:
  - `loadTenant` now selects `onboarding_complete` with a 42703 (column missing)
    fallback to the legacy select.
  - AuthGate resume gate widened to the owner-like set
    `{owner, manager, super_admin, admin, imo_owner}`.
- **Remaining broken**: The `agencies.onboarding_complete` column **doesn't exist** in
  this branch's migrations. Until backend TODO #1 lands, resume never fires because
  the value is always `undefined`. Frontend is ready.

### Step 3 — Step submit (every step)
- **Path**: `submitStep(payload)` → `completeStep(sb, agencyId, nextKey, payload)` →
  `sb.rpc("complete_onboarding_step", ...)`.
- **Was broken**: When `complete_onboarding_step` doesn't exist, every step submit
  errored inline and the user was stuck on the same step. The error message ("function
  does not exist") was raw PostgREST. No exit was offered.
- **Fixed (commit `9696879`)**:
  - `completeStep` catches PGRST202 / "function does not exist" and writes progress
    to localStorage scoped per-agency: `repflow.onboarding.<agencyId>`.
  - `fetchStatus` similarly falls back to derive status from the local ledger when
    `agency_onboarding_steps` is missing.
  - `WizardChrome` shows a yellow banner when running in `_source === "local"` mode
    so the operator knows this isn't persisted across browsers.
  - `WizardChrome` always has a top-right "Skip to Today" button — no step is a trap.
- **Remaining broken**: Persistence across browsers requires backend TODOs #2 + #7.
  Single-browser onboarding works.

### Step 4 — Carrier appointments (StepCarriers)
- **Path**: Reads `carriers` (master catalog from `0002_fill_missing_domains.sql`).
  Lets user pick checkboxes + add free-text "other carriers". Save payload =
  `{ carrier_ids, carrier_text }`.
- **Working**: ✅ Skip path exists — empty selection saves `{ carrier_text: [] }`. The
  button reads "Skip this step →" when nothing's selected. Step is reachable / skippable.
- **Remaining broken**: Save target is the missing `complete_onboarding_step` RPC; the
  carrier list itself doesn't actually persist anywhere because there's no
  `agency_appointments` or similar table referenced. Marked as backend gap (any
  follow-up will need a table).

### Step 5 — Lead vendor / source configuration
- **Path**: The wizard does NOT include a dedicated lead-vendor step. Lead source is
  captured implicitly via `StepFirstLead.source` (manual / referral / fb-leads /
  inbound / list). Real lead-vendor configuration lives outside the wizard in
  `page-leaddrip.jsx` (which exists and has connector wiring per commit `f995220`).
- **Working**: ✅ The lead-source picker on StepFirstLead is required but defaults to
  `manual` so the user can always proceed. A "Skip" path exists.
- **Remaining**: There's no first-class "configure a lead vendor" step in the wizard —
  user has to land on `/?page=leaddrip` post-onboarding to wire FB / Convoso / etc.
  Acceptable: the wizard isn't a trap loop, just a deferred capability.

### Step 6 — Twilio setup reachability
- **Path**: Wizard StepConnectors reads from `connector_catalog`. When that table is
  empty (the case on stock Supabase since the table doesn't exist), the user used to
  see only the message "Connector catalog is empty in your project. You can configure
  connectors later" with no actionable button — Twilio felt unreachable from onboarding.
- **Fixed (commit `44d2aba`)**: Empty-state now exposes inline buttons "Set up
  Twilio", "Set up Vapi", "Set up OpenAI" that open `ConnectorConfigModal` directly
  (the modal is defined in `page-onboarding.jsx` and registers Twilio's full field
  schema). Twilio is reachable from onboarding even without a populated catalog table.
- **Remaining broken**: `connections.config jsonb` column doesn't exist (backend TODO
  #10), so the save inside `ConnectorConfigModal` will fail silently against the
  current `0001` schema. Twilio is only "reachable", not "configurable end-to-end",
  without that backend fix.

### Step 7 — Form validation + error paths
- **Was broken**:
  - StepProfile only checked `legal_name.trim().length > 1` — NPN, email, ZIP went
    unvalidated. Garbage values silently round-tripped to the save RPC.
  - StepBranding accepted any `logo_url` including raw "foo" — the broken-image
    `onerror` hid the failure.
  - StepInviteTeam rows accepted "not-an-email" silently; the row would mint a
    useless invite or fail server-side with no client warning.
  - ProducerOnboardingWizard step 0 only checked name + phone non-empty.
- **Fixed (commits `9696879`, `2d80517`, `44d2aba`)**:
  - StepProfile: regex-validated email + ZIP, length-checked NPN, surfaced issues
    inline as `state-warning` text, kept the submit button disabled until valid.
  - StepBranding: requires `http(s)://` prefix when logo_url is non-empty; submit
    blocked otherwise.
  - StepInviteTeam: every row's email is regex-checked, malformed rows get a
    warning border, the Mint button stays disabled until all non-empty rows are
    valid. Partial-failure toast distinguishes minted vs failed.
  - ProducerOnboardingWizard step 0: phone needs 10+ digits, email is regex-checked.
- **Remaining**: Server-side validation is still the source of truth, but the
  client now prevents the obvious typos that produced silent failures.

### Step 8 — Async mutator awaiting + user feedback
- **Was broken**:
  - StepFirstLead's pipeline insert used `consent: "self-attested"` which violates
    `pipeline.consent CHECK (consent in ('verified', 'pending', 'none'))`. The
    insert always failed; the catch swallowed the error and only logged
    `console.warn`. The user thought their lead landed when it didn't.
  - `sendOne` in StepInviteTeam swallowed RPC errors and only checked `r?.data`,
    masking PostgREST overload-resolution failures.
- **Fixed (commits `9696879`)**:
  - First-lead insert uses `consent: "pending"`. The error path now sets `insertErr`
    state which renders as a warning so the operator knows the lead didn't save and
    can re-add from CRM.
  - `mint_invite` RPC call passes all 4 named params (`p_upline_rep_id: null` so
    PostgREST resolves the right overload). The `/api/invites/create` fallback now
    forwards the `Authorization: Bearer <jwt>` header that the edge function
    actually requires.

### Step 9 — Exit pathways (no trap loops)
- **Status (after fixes)**:
  - StartPicker: `Back` from start/join → pick mode. Always reachable.
  - AgencyWizard: top-right "Skip to Today" + bottom-left "Finish later · open Repflow"
    on every step. ✅ Both call `onDone()` which calls `refreshTenant()`. Wizard
    surfaces error-recovery screen if `statusErr` is set with `Try again` + `Open
    Repflow anyway`.
  - ProducerOnboardingWizard: top-right "Skip for now →" on steps 0/1/2 (added in
    commit `2d80517`). Without this the rep was trapped on step 2 if
    `provision_rep_for_member` was missing.
  - InviteTeamPanel: always renders Generate button + per-step copy. Owner-like roles
    now see it.

---

## Confidence

| Path | Frontend ready? | Backend present? | Owner reaches Today? |
| --- | --- | --- | --- |
| Sign-in → StartPicker | ✅ | ✅ | ✅ |
| StartPicker → provision_sub_agency | ✅ | ❌ (missing RPC) | ⚠️ blocked at provision |
| AgencyWizard step submits | ✅ (local fallback) | ❌ (missing RPC) | ✅ via local fallback |
| "Skip to Today" exits | ✅ | n/a | ✅ |
| Producer wizard → provision_rep_for_member | ✅ (clearer error) | ❌ | ⚠️ blocked at rep provision |
| Producer wizard "Skip for now" exit | ✅ | n/a | ✅ |
| Twilio configurable from onboarding | ✅ (shortcut) | ❌ (`connections.config` missing) | ⚠️ reachable, won't persist |
| Invite minting | ✅ (signature fixed) | ✅ (mint_invite exists) | ✅ |

**End-to-end verdict** (fresh owner on this branch's schema): the single hard block is
`provision_sub_agency`. Once that lands the wizard walks through (with local-fallback
persistence) and the operator reaches Today. Until then, the frontend surfaces an
honest "this RPC isn't deployed yet" error instead of a silent dead-end.

## Files touched in this sprint

- `page-first-run.jsx` — StartPicker kind tracking, validation, local fallback,
  always-on Skip-to-Today CTA, friendlier RPC-missing errors, connector shortcuts in
  empty state, invite-email validation.
- `page-onboarding.jsx` — Producer wizard email/phone validation, always-on
  Skip-for-now exit, clearer error when provision_rep_for_member is missing.
- `page-invite-team.jsx` — Owner role added to allowed inviter set + email-hint
  validation.
- `page-auth.jsx` — Resume gate widened from `role==="owner"` to the owner-like set.
- `page-tenant.jsx` — `loadTenant` selects `agencies.onboarding_complete` with
  graceful fallback when the column is missing.
- `audits/ONBOARDING_GAPS.md` — this file.
