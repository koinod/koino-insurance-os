# RBA overnight build — handoff for 2026-05-15

You went to sleep, I shipped Phases A → Q autonomously. Origin/main is at
commit `77c93cb`. Vercel will redeploy on push. The agent ecosystem is
end-to-end functional but **needs four manual setup steps before reps can
use it in production**.

## What's running on origin/main right now

| Layer | Status |
|---|---|
| `0030_rba_installs.sql` — install spine + commands + audit + vault + confirmations | ✅ on main |
| `0031_meeting_notes_and_automations.sql` — Fathom + automation_rules + agent_settings | ✅ on main |
| `0032_call_events.sql` — Twilio call event log | ✅ on main |
| `0033_appointments.sql` — first-class appointments | ✅ on main |
| Agent runtime (`agent/runtime/agent.py`) + 13 tool modules | ✅ on main |
| Auto-update (`agent/runtime/agent.py` polls `/api/agent/version` hourly) | ✅ on main |
| API: `command-claim`, `command-complete`, `confirmation-request/resolve`, `connector-exchange/list/upsert`, `post-command`, `version`, `installs`, `heartbeat`, `audit`, `revoke` | ✅ on main |
| Connector probes: `/api/connector/probe` + nightly cron `/api/cron/connector-probe` | ✅ on main |
| Webhooks (signature-verified): `twilio-app`, `twilio-inbound-sms`, `connector/fathom-webhook`, `connector/calendly-webhook`, `connector/stripe-webhook` | ✅ on main |
| Crons: appointment-reminders (15min), connector-probe (daily), rba-anomaly-scan (6h) | ✅ on main |
| UI: Settings → Agents (devices + connectors + automations + agent prefs) | ✅ on main |
| UI: Admin → Devices (anomaly banner + drawer + recent commands + audit tail + manual command tester) | ✅ on main |
| UI: Global confirmations modal (`rba-confirmations.jsx`) | ✅ on main |
| UI: Lead drawer activity pane (`rba-lead-activity.jsx`) — calls/meetings/appts realtime | ✅ on main |
| Docker image (`agent/Dockerfile`) + GHCR workflow (`.github/workflows/agent-image.yml`) | ✅ on main, image will build on next push |
| install.sh / install.ps1 — full Mac/Linux/Windows installers | ✅ on main |

## REQUIRED before going live

### 1. Apply the migrations
```bash
supabase db push  # applies 0030, 0031, 0032, 0033
```

### 2. Set Vercel env vars
Open Vercel project settings → Environment Variables, add:

| Var | Why | Required for |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | All `/api/agent/*` endpoints use service role | Everything |
| `CRON_SECRET` | Optional shared secret for cron endpoints (Vercel cron header is also accepted) | Crons |
| `TWILIO_AUTH_TOKEN` | Verify inbound webhook signatures | Twilio webhooks (twilio-app, twilio-inbound-sms) |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_CALLER_ID` | Platform-side fallback for confirmation SMS when rep hasn't connected their own Twilio | Confirmation SMS fan-out |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe-Signature | Stripe webhook |
| `STRIPE_SECRET_KEY` | Optional: lookup customer email when only customer_id present | Stripe webhook |
| `CALENDLY_WEBHOOK_SECRET` | Verify Calendly-Webhook-Signature | Calendly webhook |

If any secret is **unset**, the matching verifier currently falls through (skips check). That's intentional for dev. Set them in prod.

### 3. Configure third-party webhooks
Point each provider at the matching endpoint:

| Provider | Endpoint | Events |
|---|---|---|
| Twilio number → "A message comes in" | `https://repflow.koino.capital/api/twilio-inbound-sms` | inbound SMS |
| Twilio app → "Status callback" | `https://repflow.koino.capital/api/twilio-app` | call status |
| Twilio Programmable Voice → "Recording status callback" | `https://repflow.koino.capital/api/twilio-recording` | recording done (already shipped) |
| Calendly → Settings → Integrations → Webhooks | `https://repflow.koino.capital/api/connector/calendly-webhook` | invitee.created, invitee.canceled |
| Fathom → Settings → Webhooks | `https://repflow.koino.capital/api/connector/fathom-webhook` | meeting.completed |
| Stripe → Developers → Webhooks | `https://repflow.koino.capital/api/connector/stripe-webhook` | payment_intent.succeeded, .payment_failed, charge.succeeded, charge.failed, invoice.paid, invoice.payment_failed |

### 4. Build + push the Docker image
The `.github/workflows/agent-image.yml` workflow builds + pushes to
`ghcr.io/koinod/repflow-agent:latest` on every push to main that touches
`agent/**`. After this push, watch the Actions tab — the image needs to
appear in the GHCR packages page before Docker installs work. (Mac/Linux
bash + Windows ps1 installers don't depend on Docker.)

## Verification flow

1. **Install**: log into Repflow → Settings → Agents → "Install on a machine" → copy the bash one-liner → run it on your laptop. After ~2 min the device appears in the list with green status.
2. **Connect Twilio**: Settings → Agents → Twilio "Connect" button → paste account_sid + auth_token + your phone number(s).
3. **Test dial via manual command**: Admin → Devices → pick your device → Manual command tester → kind=`twilio_dial`, payload=`{"to_number":"+15551234567"}`. The Recent Commands pane shows the command claim → succeed within seconds.
4. **Test confirmation flow**: kind=`draft_sms`, payload=`{"lead":{"name":"Test"},"intent":"follow_up","auto_send":true}`. A confirmation appears in the global modal (top-right of any page); approve to proceed.
5. **Test automation**: Settings → Agents → Automations → Add rule "After call ends → draft_sms (intent: follow_up)". Make an outbound call via the autodialer. After hang-up, watch the device's Recent Commands pane for the auto-fired draft_sms.
6. **Test appointment reminders**: post a row to `appointments` with `starts_at = now() + interval '23 hours 50 minutes'`. Within 15min the cron fires the 24h reminder; check Recent Commands.

## What I deliberately did NOT do (queued for next session)

| Item | Why deferred |
|---|---|
| OAuth callback routes for Twilio/Gmail/Outlook/Calendly/Stripe/Meta | Manual API-key forms work today; OAuth UX is a UX-design pass |
| OS push for confirmations | Needs service worker + push subscription endpoint — full PR by itself |
| Diagnostic bundle endpoint + UI consent flow | PRD §11 #10 — operational nice-to-have, not blocking |
| pgsodium encryption on connector_vault tokens | Schema columns named `*_enc` are forward-compatible; migration is its own pass |
| Bluetooth phone routing | Native CallKit (macOS) / PhoneLink (Win) — multi-week build per OS |
| Floor / Today widget showing "agent activity for you" | Widget design coupling — better as its own iteration |
| pytest suite for `agent/runtime/*` | No test infrastructure exists yet for the agent code |
| Build-time hash manifest for `/api/agent/version` | Auto-update works via bundle_version delta; sha256 per file is the optimization |
| Probe response visibility | Already shipped — Recent Commands pane in Devices admin shows results |
| Webhook signature verification | ✅ Shipped this round (Twilio + Stripe + Calendly) |
| Anomaly auto-flags | ✅ Shipped — inline in Admin Devices + cron `/api/cron/rba-anomaly-scan` |
| SMS reply parsing | ✅ Shipped — `/api/twilio-inbound-sms` with Y/N → confirmation-resolve |

## Commit timeline (this session)

```
77c93cb feat(rba): webhook signature verification (Twilio/Stripe/Calendly)
a45a5ba Merge: Phases O-Q (SMS confirmation outbound, Stripe webhook, agent prefs)
9323c72 Merge: Phase A-M overnight build (connectors, confirmations, automations, auto-update, Docker, lead activity)
85e040e feat(rba): polished install.sh + install.ps1 + raw runtime serving
ceb5a6e feat(rba): Settings → Agents device manager + Admin Devices tab
b9f5fff feat(rba): API endpoints + extended capability ledger
ca29c9b feat(rba): agent runtime + tool framework + 11 tool modules
87f223a feat(rba): 0030 install spine, command channel, vault, confirmations
```

## Risk register

- **Webhook signature verification skips when env var is unset.** Prod must set the secrets. Dev keeps working unsignaled. Don't ship to a prod tenant before setting the four secrets.
- **`connector_vault` stores plaintext tokens** under `*_enc` column names. pgsodium is a follow-on. RLS confines reads to the user themselves + super_admin. Service role can read everything (used by `connector-exchange` to decrypt for the agent). Don't dump the table.
- **LinkedIn cookie-based send is high LI-ToS risk.** The tool always confirms before sending, which gives the user a brake. Don't auto-send.
- **`appointments` cron fires reminders only when an automation_rule for that trigger exists.** No rule = silent. Add the rule explicitly via Settings → Agents → Automations.

— Dispatch
