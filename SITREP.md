# Repflow · Situation Report

**Last updated:** 2026-05-01 · 29 commits in current build session.
**Live:** https://koino-insurance-os.vercel.app (production)
**Repo:** github.com/koinod/koino-insurance-os
**Backup branch:** `pre-v2-backup` (the original Next.js scaffold)

---

## What Repflow is

Operator-grade insurance distribution OS for IMOs / agencies running life & health producers. Single-page app served as static files from Vercel; Supabase Postgres backend with RLS multi-tenancy; real-time channel; in-browser AI co-pilot; click-to-call via Twilio Voice SDK; producer/agency onboarding wizards; full Stripe billing.

Designed so every page is **role-aware**: rep / manager / owner views render different functionality off the same component tree based on the operator's `agency_members.role`.

---

## Live infrastructure

### Vercel (auto-deploy from `main`)
- **Project:** `koino-insurance-os` (`prj_oLmPIcDH5OEgBJ1Mh0Urm13MIhRP`) under team `koinocapital-7163s-projects` (`team_zMGoewg8vNKneGcEDlfmeXuh`)
- **Domain:** koino-insurance-os.vercel.app
- **Vercel CLI auth token:** cached at `C:/Users/PLATINUM/AppData/Roaming/com.vercel.cli/Data/auth.json` (expires periodically — re-login if 403)
- **Env vars set (production + preview + dev):**
  ```
  GEMINI_API_KEY                  # AI co-pilot
  OPENROUTER_API_KEY              # AI co-pilot fallback
  STRIPE_SECRET_KEY               # billing (sk_live_...)
  STRIPE_WEBHOOK_SECRET           # billing webhook signature verify
  STRIPE_PRICE_SETUP_5000         # one-time $5k setup
  STRIPE_PRICE_AGENCY_MONTHLY     # $997/mo
  STRIPE_PRICE_REP_MONTHLY        # $97/mo
  ```
- **Env vars NOT yet set** (graceful 503 with structured body until they are):
  ```
  TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID, TWILIO_CALLER_ID
  NIPR_USER_ID, NIPR_PASSWORD
  VAPI_API_KEY, IPIPE_*, MAILGUN_*, CONVOSO_AUTH_TOKEN, JORNAYA_*, TRUSTEDFORM_API_KEY
  ```

### Supabase
- **Project:** `Repflow` (`zybndnqnbxarpkhqpcxq`) — region us-east-2
- **Anon publishable key:** `sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W` (RLS-protected; safe to ship in client)
- **Service role key:** never used in client; only via Supabase MCP for migrations
- **38 tables** under `public` schema, all RLS-enabled, scoped by `agency_id`
- **Realtime:** subscribed to 9 tables via `repflow-rt` channel (pipeline, queue, reps, hardware, ai_agents, connections, workflows, agent_deployments, agent_runs)

### Stripe (real production keys live)
- 3 Products + 3 Prices in account
- Webhook endpoint registered at `/api/stripe/webhook` with signing secret in env
- Smoke-tested end-to-end: `cs_live_b1Us6oPQXgfCMAiPsThQKATk…` returned by `/api/stripe/checkout`

---

## File map (what does what)

```
index.html                         App shell, AuthGate wrapper, page switch, ⌘K, AI rail toggle
mobile.html                        Single-fitted FlowPhone for mobile rep app
sw.js                              Service worker (network-first; bypasses /api/* and /rest/*)
icon.svg                           PWA icon (R glyph, gradient)
manifest.webmanifest               PWA manifest

data.jsx                           Demo data + Supabase live hydration + 17 mutate.* helpers
                                   + realtime subscription. Active-agency scoping via getActiveAgencyId().
shared.jsx                         Topbar (liquid-glass pill), Sidebar, role NAV map, ⌘K palette,
                                   Modal/Field/Select/SectionPill primitives, AIRail (Gemini-backed)
icons.jsx                          ~50 inline Lucide-style SVG icons
tweaks-panel.jsx                   In-page settings panel (role/page/density/aiRail toggles)

page-today.jsx                     Today (rep / mgr / owner role-aware) + spend strip
page-floor.jsx                     Floor (combined pipeline+queue+history with mode tabs)
page-pipeline.jsx                  Pipeline list/kanban/sequences + Lead detail slide-out + new-lead/filter modals
page-pipeline-sequences.jsx        Sequence builder (step editor + enrolled-leads table)
page-queue.jsx                     Dial Queue (rep) + Dispatch (mgr) + InCall overlay
page-leaderboard.jsx               Leaderboard
page-manager.jsx                   Team Board (drag-drop + bulk-assign), Coaching role-aware,
                                   RoutingRulesModal, RepDrillSlideout, ReplayMomentModal
page-owner.jsx                     P&L (Ask the Book, period pill, waterfall drill, anomaly nav),
                                   OrgTree (tree/radial/flat with click-to-select + tier override)
page-ops.jsx                       Connections, Hardware, Agents (live log tail), Workflows
page-ops-depth.jsx                 NIGO Queue (with drill modal), Carriers, Scrubbers, Forecast
page-extras.jsx                    Vault (with upload modal + retention edit), Tiering, Commissions
                                   role-aware, Training role-aware, PageBook drill, PageStub, Settings (8 tabs)
page-recruiting.jsx                Outreach workbench: Campaigns / Conversations / Sequences / Leads / Insights
page-attribution.jsx               Lead Vendors → Pipeline → Commissions ROI loop with allocator
page-platform.jsx                  EnrollHostModal (hardware), DeployAgentModal, CallingSetup
                                   (per-OS desktop helper installers), repflowCall click-to-call shim
page-tenant.jsx                    OnboardingWizard (agency owner), SettingsTeam (invites),
                                   TwilioConfigModal, twilioReady() softphone runtime
page-onboarding.jsx                ProducerOnboardingWizard (rep-side, with NIPR verify),
                                   CONNECTOR_SCHEMAS (7 generic connectors), ConnectorConfigModal,
                                   generateSOAPdf
page-admin.jsx                     PageAdmin (IMO mission control: KPIs, system health,
                                   team roster, audit, plan, danger zone), PerAgencyNotificationsPanel
page-billing.jsx                   PricingModal (3 plans), AdminPlanCard (real Stripe checkout),
                                   AgencySwitcher (multi-membership Topbar dropdown),
                                   audit-log instrumentation (monkey-patches every mutate.*)
page-auth.jsx                      LoginScreen (magic-link), AuthGate (3-state: login / onboarding-owner / onboarding-producer / app)
page-mobile.jsx                    MobileRep with iOS frame
mobile-screens.jsx, mobile-extra-screens.jsx, ios-frame.jsx, design-canvas.jsx, mobile-styles.css
polish.jsx                         Toasts, exportPDF, skeletons, onboarding tour
styles.css                         Design tokens, layout, modals, slide-outs, responsive breakpoints,
                                   liquid-glass topbar, section-pill component, login shell

api/copilot.js                     AI co-pilot Edge fn: pickTools() + Gemini cascade + OpenRouter fallback
api/agents/issue-token.js          Mints one-time enrollment token + curl install command
api/agents/                        (host runtime endpoints)
api/twilio-token.js                Mints Voice SDK Capability JWT (HS256, hand-rolled, edge runtime)
api/twilio-twiml.js                Outbound TwiML bridge (browser → PSTN)
api/twilio-recording.js            Recording webhook → vault_artifacts insert
api/twilio-app/provision.js        Auto-creates TwiML app via Twilio REST
api/nipr-verify.js                 License verification (graceful 503 with self-attested fallback)
api/invites/create.js              Owner-only invite minting (forwards JWT to mint_invite RPC)
api/stripe/checkout.js             3-plan Checkout session creator
api/stripe/webhook.js              HMAC-SHA256 sig verify + idempotent event processing
api/stripe/portal.js                Billing portal redirect

install.sh                          Host enrollment script (cron heartbeat + agent runner)
agent-runner.sh                     Polls agent_deployments, executes templates, posts agent_runs
supabase/migrations/0001_repflow_v2_init.sql    Initial schema commit (subsequent migrations in MCP only)
```

---

## Schema (38 tables)

**Core domain** (originally seeded with 60 demo rows for `atlas` agency):
- `reps` — producers (mtd_cents, tier, presence, license_states[], carrier_appts[], onboarded_at)
- `pipeline` — leads in motion (stage workflow with `Issued` trigger)
- `queue` — inbound dial queue
- `courses` — training catalog
- `recordings` — call recordings + AI scoring
- `connections` — third-party services (twilio, vapi, stripe, etc.) with `config jsonb` per agency
- `hardware` — enrolled hosts (Mac mini, VPS) with heartbeat
- `ai_agents` — agent templates
- `workflows` — automation pipelines (with `active` flag)

**Multi-tenant**:
- `agencies` — id, slug, name, owner_user_id, plan, tier, state, npn, config jsonb, stripe_customer_id, subscription_*, trial_ends_at, current_period_end, monthly_price_cents
- `agency_members` — (agency_id, user_id) PK, role (owner|manager|rep), rep_id link
- `agency_invites` — token PK, role, email_hint, expires 7d, single-use
- `agency_notifications` — kind, severity, title, body, page_link, read_by[]
- `agency_audit_log` — actor, action, target, metadata

**Agent platform**:
- `agent_install_tokens` — 24h one-time enrollment
- `agent_deployments` — agent_id × host_id with manifest
- `agent_runs` — per-execution log row (status, log, exit_code, duration_ms)

**Operational depth**:
- `nigo_items` — Not-In-Good-Order workflow with deadline + status triggers
- `vault_artifacts` — SOA / Recording / LeadiD / TrustedForm / Consent / TPMO with retention
- `recruiting_campaigns`, `recruiting_applicants`, `recruiting_messages` (with `ai_drafted` flag)
- `lead_vendors`, `carriers`, `products`
- `routing_rules` — weighted dispatch
- `tiering_overrides` — per-rep manual tier
- `sequence_enrollments` — leads enrolled in pipeline sequences
- `org_settings` — key/value jsonb
- `notification_prefs` — per-user
- `saved_views` — per-user smart filters per page
- `stripe_events` — idempotent webhook processing

**RLS pattern** (post-Wave U fix):
- Reads: `agency_id in (select agency_id from agency_members where user_id = auth.uid() and active)`
- Writes: same `WITH CHECK` clause (cross-tenant writes physically impossible)
- BEFORE INSERT trigger on every operational table auto-fills `agency_id := current_agency_id()` if null

**Postgres triggers (auto-firing notifications + audit)**:
- `pipeline.stage → Issued` ⇒ success notification + audit
- `nigo_items` insert ⇒ severity-tiered notification
- `agency_invites.used_at` set ⇒ recruit notification + audit
- `connections.status` flip ⇒ system notification

**Key RPCs** (security definer where needed):
- `current_agency_id()` — caller's primary agency or null
- `create_agency(name, slug, state)` — onboarding owner setup
- `mint_invite(agency_id, role, email_hint)` — owner-only
- `redeem_invite(token)` — adds caller to members
- `provision_rep_for_member(name, handle, phone, email, npn, license_states[], carrier_appts[])` — producer onboarding
- `enroll_host(token, hostname, kind, fingerprint)` — agent host registration
- `host_pull_deployments(host_id)` — runner polling
- `host_post_run(deployment_id, host_id, agent_id, status, log, exit_code, duration_ms)` — run reporting
- `heartbeat_host(id, load_pct)` — host liveness ping
- `upsert_agency_subscription(stripe_customer_id, ...)` — Stripe webhook
- `log_audit(agency_id, action, target, metadata, actor_role)` — append audit row
- `create_notification(agency_id, kind, severity, title, body, page_link, ref_id)` — notification fan-out
- `mark_notification_read(id)` / `mark_all_notifications_read(agency_id)`

---

## What's wired end-to-end (verified live)

| System | Status | Evidence |
|---|---|---|
| AI co-pilot | ✅ Live | `gemini-2.5-flash` returned tool-called response in 2.97s |
| Multi-tenant RLS | ✅ Live | Anon GET on `agencies` returns `[]`, `redeem_invite("rfi_nope")` rejects 400 |
| Host enrollment | ✅ Live | `host_id: 241779fa57f8` enrolled from a real shell |
| Agent runtime + log streaming | ✅ Live | `ran a3 on 98061f4f5432 -> ok (0ms)` row in `agent_runs` |
| Stripe checkout | ✅ Live | `cs_live_b1Us6oPQXgfCMAi…` returned for $5k Agency setup plan |
| Webhook signature verify | ✅ Live | HMAC-SHA256 of `${t}.${body}`, idempotent via `stripe_events.id` PK |
| Realtime subscriptions | ✅ Live | `repflow-rt` channel mutates AppData on insert/update/delete |
| Auto-scope `agency_id` on insert | ✅ Live | BEFORE INSERT trigger via `current_agency_id()` |
| RLS write tightening | ✅ Live | `WITH CHECK (agency_id in member-agencies)` on 25 tables |

## What's wired but operator-side env-var dependent

These return structured `503` with the missing env-var names until set:
- Twilio softphone (Voice SDK) — `STRIPE_*` is set, Twilio variables aren't
- NIPR license verification — graceful self-attested fallback
- Vapi / iPipeline / Mailgun / Convoso / Jornaya / TrustedForm — connector dialogs save SIDs to `connections.config`, secrets go to operator's Vercel env

## What's NOT wired (genuine open gaps)

1. **AEP-specific tooling** — banner removed in Wave S; no plan-year transition modal, SEP eligibility check, or Medicare Plan Finder API integration. Tooling can be added when seasonal value beats infrastructure depth.
2. **Producer e-sign / contracting** — when an invited rep redeems, they go through `ProducerOnboardingWizard` but no contractor agreement is generated or signed.
3. **Real OAuth flows** — every connector except Twilio uses paste-in creds. True OAuth requires `/api/connectors/{id}/auth/start` + `/callback` per provider.
4. **Convoso outbound + Vapi voice AI runtime** — schema exists; no wiring to push leads to a Convoso list or kick off Vapi outbound.
5. **Mailgun batch sends** — connector schema exists; no email send endpoint.
6. **Agency switcher hydrate scope** — Wave U fix landed BEFORE INSERT triggers + RLS tightening + scope() in hydrate, but `PageAdmin` / `SettingsTeam` / `TwilioConfigModal` still do `agencies.limit(1).single()`. RLS makes this safe but wrong-agency-on-screen for multi-membership users. Needs a small `loadActiveAgency()` helper used everywhere.
7. **Test coverage** — zero. No unit tests, no integration tests.
8. **Document generation** — only SOA. Consent forms, app starter forms, contractor agreements not generated.
9. **Compliance scrubbers** — DNC.gov / NIPR PDB / state-board feeds — all return synthesized data; no real API hits even though Wave R shipped the structure.

---

## Failures + learnings (from this build session)

1. **Babel-standalone aborts on first parse error**, not just the offending function. Duplicate `function PageStub` made `NotificationsPanel` look "not defined" — actual cause was the parser dying mid-file. **Lesson:** when a bare-name reference fails after a fresh deploy, check for redeclaration first.

2. **Vercel CDN + browser cache**. Plain `?_=v3` query on HTML doesn't bust JSX/CSS resources. **Solution shipped:** version every script/link tag (`?v=N`); bump on every wave that changes JSX.

3. **Vercel env vars don't take effect until next deployment.** Setting via REST API requires `forceNew=1` redeploy of the latest production deployment. Used `/v13/deployments` with `deploymentId` of the latest READY production build.

4. **`<window.X>` is invalid JSX.** Capital identifier required after dot. **Pattern shipped:** `(() => { const X = window.X; return X ? <X .../> : null; })()` IIFE.

5. **`flock` doesn't exist on Git Bash for Windows.** Made the agent-runner lock guard optional. Heredoc with `-c` is fragile when Python contains apostrophes — always write Python helpers to a separate file.

6. **NIPR PDB and other "real" insurance industry APIs require B2B contracts** rather than self-serve API keys. **Pattern shipped:** Edge fn returns 503 with structured body listing the missing env vars + a graceful "self-attested" fallback so the producer onboarding wizard works end-to-end either way.

7. **Stripe Checkout in subscription mode allows mixing one-time + recurring line items.** That's how the $5k setup + $997/mo single Checkout works. The setup item gets added to the first invoice; the trial covers the recurring side until day 31.

8. **HMAC-SHA256 signature verify in Edge runtime** must use Web Crypto (`crypto.subtle.importKey` + `sign`); Node `crypto` isn't available. Hand-rolled the Stripe sig check + the Twilio JWT mint this way.

9. **Postgres triggers can do double duty** — fire notifications + audit log entries on row mutations. Cleaner than instrumenting every client mutator. **Used for:** pipeline.stage → Issued, nigo_items insert, agency_invites used_at, connections.status flip.

10. **BEFORE INSERT trigger that fills `agency_id` from `current_agency_id()`** is the correct multi-tenant primitive. Eliminates need to instrument every client-side insert. Combined with `WITH CHECK (agency_id in member-agencies)` it's defense in depth.

---

## Suggested next steps (prioritized)

### Immediate (close the multi-tenant gap fully)
- **Single `loadActiveAgency()` helper** used by PageAdmin / SettingsTeam / TwilioConfigModal / VaultArtifact filters. Pulls from `localStorage.repflow.active_agency` first, falls back to `current_agency_id()` RPC, then to `agencies.limit(1)`.
- **Wave U commit + push** — multi-tenant tightening is in progress (BEFORE INSERT triggers + RLS write CHECK applied to DB; data.jsx hydrate scoped). Just needs to be committed.

### High-leverage product moves
- **Producer e-sign / contracting** — generate contractor agreement on invite redemption (PandaDoc or Documenso). Pairs with the producer-onboarding wizard.
- **AEP plan-year transition tooling** — opt-in flag in `agencies.config.aep_active`; SEP eligibility checker; Medicare Plan Finder API integration (CMS).
- **Convoso outbound + Vapi voice AI runtime wiring** — push leads from queue to Convoso list; kick off Vapi outbound campaigns from sequence steps.
- **Mailgun batch send** — sequence step → `/api/mailgun/send` → tracked open/click → notification on reply.

### Operational depth
- **Real OAuth flows** for connectors other than Twilio. Each is ~2-3hrs (Vapi, iPipeline, Mailgun, Stripe is already done).
- **DNC scrubber** — actual hit to DNC.gov registry; gate dialing in Queue/Floor.
- **NIPR PDB B2B contract** — when business signs the contract, just set `NIPR_USER_ID` + `NIPR_PASSWORD` env vars; the SOAP call is already sketched.
- **Carrier appointment auto-sync** — pull current appointments from UHC Producer / Humana Vantage / Aetna SRC APIs into `reps.carrier_appts[]`.

### UI / polish
- **Empty states everywhere** — most lists already have them; some still bare.
- **Onboarding tour second pass** — 6-step tour landed in Wave G; could add a contextual "What's this?" overlay per page.
- **Test coverage** — zero. Add Playwright smoke tests for: sign-in → onboarding → invite → redeem → producer onboarding → first dial.
- **PWA service worker offline behavior** — registered but untested. Validate against airplane-mode scenario.

### Selling motion
- **Marketing site** — currently the landing page is the app itself. A separate `/pricing` page (rendered server-side from the prices in Stripe) would help.
- **Demo agency seeded for tour** — already exists as `atlas`; add a "see a demo agency" toggle on the login screen so prospects can poke around without signing up.
- **Affiliate program for Rep Solo → Agency upgrade path** — ties into the LTV motion the user explicitly highlighted.

---

## Crucial context for the next session

**To resume work, you need:**

1. The 5 GitHub repos / paths:
   - `KOINO/projects/koino-insurance-os` — the deployed app
   - `koinod/koino-insurance-os` GitHub remote
   - Supabase project `zybndnqnbxarpkhqpcxq` ("Repflow")
   - Vercel project `koino-insurance-os` under team `koinocapital-7163s-projects`
   - Stripe account (sk_live key in `~/.secrets/.env` on WSL omni)

2. The auth chain:
   - Magic-link login → AuthGate → tenant detection → onboarding wizard (owner OR producer) → app shell
   - `localStorage.repflow.active_agency` is the single source of truth for which agency is being viewed (multi-membership users)

3. The cache-busting convention:
   - Bump `?v=N` on every script + style tag in `index.html` and `mobile.html` whenever a JSX file changes. Otherwise browsers serve stale.

4. The mutation surface:
   - 17 helpers on `AppData.mutate.*` in `data.jsx`
   - Every helper is wrapped by Wave T audit instrumentation — fires `log_audit` RPC after success in LIVE mode
   - `WITH CHECK` on all RLS write policies physically prevents cross-tenant writes
   - `BEFORE INSERT` trigger auto-fills `agency_id` from `current_agency_id()`

5. The pricing model (live):
   - **Rep Solo** $97/mo · optional 7-day trial · Stripe price `price_1TT6VvFoINA2r9r5nGgqz2mX`
   - **Agency Starter** $5,000 setup + $997/mo · 30-day trial includes month 1 · `price_1TT6VtFoINA2r9r5UD80cl2o` + `price_1TT6VuFoINA2r9r5LjohGrSK`
   - **Agency Trial** 7-day free, then $5,997 at trial end · same prices, just `trial_period_days: 7`

6. The wave history (so you know what's been tried + when):
   - **A** Supabase live wiring · **B** Auth + RLS · **C** Pipeline sequences · **D** AI co-pilot · **E** Lead-source attribution · **F** NIGO + bulk + saved views · **G** Polish · **H** Mobile · **I** Realtime + agent runtime · **J** Mutations buildout + liquid-glass topbar · **K** Manager + owner pages functionality · **L** NIGO/Vault/Coaching/Calls/Settings actions · **M+N+O** Multi-tenant + invites + Twilio softphone + onboarding · **P+Q** Producer onboarding + connector framework + SOA · **R** Twilio TwiML + NIPR · **S** AEP banner gone, per-agency notifications, Admin dashboard · **T** Stripe billing (3 plans + 7d trial) + audit + notifications + switcher · **U** Multi-tenant tightening (in progress).

7. The "graceful 503" pattern:
   - Edge fns that depend on operator-side env vars (Twilio, NIPR, Stripe, Vapi, etc.) all return `503` with `{ error: "X_not_configured", detail: ..., missing: [env_var_names] }` so the UI shows a clear setup path instead of breaking.

---

End of sitrep. Next session can `git pull && cat SITREP.md` and pick up.
