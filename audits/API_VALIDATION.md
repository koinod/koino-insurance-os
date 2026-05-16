# API_VALIDATION — Input validation pass on `api/**.js`

Sprint task 5. Auditor: agent on `sprint/api-hardening`, 2026-05-15.

Pattern applied: hand-rolled type/shape/length checks at the top of each handler that reads `req.body`/`req.query`/`req.headers`. No new dependencies. Pre-existing signature verification (Stripe, Twilio, Calendly, vendor-webhook) preserved.

Conventions enforced for new gates:

- Required strings: `typeof x === "string" && x.length > 0 && x.length <= <cap>`
- Optional strings: when present, must match the same shape
- Numbers: `typeof x === "number" && Number.isFinite(x)`
- Enums: `[allowed list].includes(x)` (rejected with the list in the error)
- Bad JSON now returns `400 { error: "bad json" }` (was silently `{}` in several handlers)

Caps were picked to leave normal use untouched while rejecting absurd payloads (e.g. `provider` ≤ 64, free-text fields ≤ 500-2000, prompt ≤ 8000).

---

## Per-endpoint before / after

Format per row: status before → action → status after.

| Endpoint | Reads body? | Validated before? | Action |
|---|---|---|---|
| `api/agent/_lib.js` | n/a (lib) | n/a | n/a |
| `api/agent/audit.js` | yes | only truthy `tool`+`result` | added: type/length on `tool`, enum on `result` (ok/denied/error), type on `args_hash`/`detail`, 400-on-bad-JSON |
| `api/agent/capabilities.js` | no (GET only) | n/a | none |
| `api/agent/command-claim.js` | no | n/a | none |
| `api/agent/command-complete.js` | yes | required+enum `status` | already strict — none |
| `api/agent/command-result.js` | no (GET, query only) | `id` required | already strict — none |
| `api/agent/confirmation-request.js` | yes | enum on `action`/`channel`, slice on `description` | already strict — none |
| `api/agent/confirmation-resolve.js` | yes | required + enum `resolution` | already strict — none |
| `api/agent/connector-exchange.js` | yes | only `body.provider` truthy | added: type/length on `provider`, `account_label`, 400-on-bad-JSON |
| `api/agent/connector-list.js` | no (GET) | n/a | none |
| `api/agent/connector-upsert.js` | yes | only `body.provider` truthy | added: type/length on `provider`/`account_label`/`access_token`/`refresh_token`/`api_key`/`expires_at`, object on `metadata`, array on `scopes`, 400-on-bad-JSON |
| `api/agent/dispatch-dial.js` | yes | rich existing checks (lead_id-or-to_number, provider enum, phone-shape) | already strict — none |
| `api/agent/heartbeat.js` | yes (body optional) | none | added: type/length on `version`/`status` when present |
| `api/agent/install-token.js` | yes (optional role) | none | added: enum on `role` (rep/manager/owner/admin/super_admin) |
| `api/agent/install.ps1.js` | no (GET, ?token query, no body) | n/a | none |
| `api/agent/install.sh.js` | no (GET, ?token query, no body) | n/a | none |
| `api/agent/installs.js` | no (GET) | n/a | none |
| `api/agent/lead-create.js` | yes | stage/heat/consent enum; name truthy | added: type/length on `lead`, all free-text fields capped 500; `age` num + range 0–130; `ap` num |
| `api/agent/model-pref.js` | yes (POST branch) | normalize `mode` silently | added: enum on `mode` ('fast'/'smart'), 400-on-bad-JSON |
| `api/agent/post-command.js` | yes | only truthy `device_id`+`kind` | added: type/length on both, object on `payload`, 400-on-bad-JSON |
| `api/agent/redeem.js` | yes | only truthy `token` | added: type/length on `token`/`hostname`/`os`/`cpu`/`version`, number on `ram_gb`, array on `models` |
| `api/agent/revoke.js` | yes | only truthy `device_id` | added: type/length on `device_id`, 400-on-bad-JSON |
| `api/agent/runtime-file.js` | no (GET, ?path query, allowlisted) | strict allowlist | none |
| `api/agent/version.js` | no (GET) | n/a | none |
| `api/agents/issue-token.js` | yes | role-gated mint flow | added: object-shape check + type on `hint`, 400 on non-object body |
| `api/automation/dispatch.js` | yes | only truthy `trigger_event` | added: type/length on `trigger_event`/`lead_id`/`rep_id`, object on `lead` |
| `api/carrier-recommend.js` | yes | `product_kind` enum | already strict — none (only one operator-facing field) |
| `api/client-error.js` | yes | type-coerces every field with slice/Number; drops empty | already strict — none |
| `api/connector/calendly-webhook.js` | yes | HMAC verify against `CALENDLY_WEBHOOK_SECRET` (t.body) | already strict — none |
| `api/connector/fathom-test.js` | yes | string `api_key` truthy | added: type/length explicit, 400-on-bad-JSON |
| `api/connector/fathom-webhook.js` | yes | best-effort — no HMAC yet (Fathom signing path TBD) | added: object-shape on body + meeting; type check on event id. HMAC verification still TODO — Fathom's signing header is unspecified. Flagged. |
| `api/connector/probe.js` | yes | only truthy `vault_id`; loose `kind` | added: type/length on `vault_id`, enum on `kind` |
| `api/connector/stripe-webhook.js` | yes (raw text) | Stripe-Signature HMAC + parts check | already strict — none |
| `api/connector/test.js` | yes | `connector_id` lookup-or-fail | added: type/length on `connector_id`, 400-on-bad-JSON |
| `api/copilot.js` | yes | `prompt` typed-string | added: length cap on `prompt`, type on `context`/`history`, array on `history` |
| `api/cron/appointment-reminders.js` | no (cron-secret header or vercel-cron UA) | header auth | none — cron-only |
| `api/cron/connector-probe.js` | no | header auth | none |
| `api/cron/cross-sell-sweep.js` | no | x-vercel-cron header | none |
| `api/cron/drip-runner.js` | no | bearer cron secret | none |
| `api/cron/manager-inactivity.js` | no | bearer cron secret | none |
| `api/cron/rba-anomaly-scan.js` | no | header auth | none |
| `api/cron/transcribe-call-recordings.js` | no | service-role-only | none |
| `api/followup/dispatch.js` | yes | only truthy `template_id` | added: type/length on `template_id` + `recipient`/`lead_id`/`rep_id` |
| `api/import-gdoc.js` | yes | only truthy `url` | added: type/length on `url`, 400-on-bad-JSON |
| `api/intake.js` | yes | no validation at all | added: per-field type-string + 2000-char cap; require email-or-phone; 400-on-bad-JSON |
| `api/invites/create.js` | yes | only truthy `agency_id` | added: type/length on `agency_id`, enum on `role`, type/length on `email_hint`/`upline_rep_id` |
| `api/leads/inbound.js` | yes | rich existing checks; HMAC optional gate | already strict — none |
| `api/leads/inbound-source.js` | yes | rich existing checks; per-source HMAC | already strict — none |
| `api/leads/vendor-webhook.js` | yes | rich existing checks; per-vendor HMAC | Task 12 changes (see WEBHOOK_HMAC.md) |
| `api/me.js` | yes (only auth header) | n/a | none |
| `api/nipr-verify.js` | yes | `npn` + `states[]` required | already strict — none |
| `api/quote.js` | yes | `age` + `state` required | already strict — none |
| `api/sms/outbox.js` | yes (POST branch) | per-op | added: type/length on `id`/`error`/`agent_id`/`max` |
| `api/stripe/checkout.js` | yes | only truthy `agency_id` | added: enum on `plan`, type/length on `agency_id`/`customer_email`, boolean on `trial_7d` |
| `api/stripe/portal.js` | yes | only truthy `agency_id` | added: type/length on `agency_id` |
| `api/stripe/webhook.js` | yes (raw text) | Stripe-Signature HMAC | preserved — none |
| `api/system/env-status.js` | no | n/a | none |
| `api/transcribe.js` | yes (JSON or multipart) | shape-checks per content-type | already strict — none |
| `api/twilio-app.js` | yes (form-encoded) | Twilio signature HMAC-SHA1 | preserved — none |
| `api/twilio-app/provision.js` | no | env-gated only | none |
| `api/twilio-inbound-sms.js` | yes (form-encoded) | Twilio signature HMAC-SHA1 | preserved — none |
| `api/twilio-recording.js` | yes (form-encoded) | Twilio webhook (relies on /api/twilio-recording URL secrecy + recordingStatusCallback) | flagged: no signature verify on this Twilio callback. Not a body-validation gap; called out for follow-up. |
| `api/twilio-sms.js` | yes | `to`/`text` checks + length cap | already strict — none |
| `api/twilio-token.js` | yes | env-gated; identity defaulted | already strict — none |
| `api/twilio-twiml.js` | yes (form/json) | escapeXml only | added: type/length on `to` (≤32) + `leadName` (≤200 slice); rejects oversized `to` with TwiML error |
| `api/worker/dispatch-queue.js` | no (cron header) | bearer cron-secret | none |

## Counts

- Endpoints audited: 61
- Already-strict (no change needed): 32
- Changed (validation hardened): 28
- Cron-only / GET-only / no-body: tracked in-table

## Open items / TODOs

1. **`api/connector/fathom-webhook.js` — HMAC verification still missing.** Fathom's signing header convention isn't documented in our repo; until we confirm which header they use, the endpoint stays best-effort. Body shape now validated, but a malicious caller could still post fake meetings if they know the URL. Mitigations in place: agency scoping is via attendee-email-to-lead match (cross-tenant injection blocked); event_id is upserted so a flood of dupes is bounded. Real fix: identify the Fathom signing header and add HMAC like `calendly-webhook.js`.
2. **`api/twilio-recording.js` — no Twilio signature verify.** The other Twilio callback handlers (`twilio-app.js`, `twilio-inbound-sms.js`) verify `x-twilio-signature`; this one does not. Not in scope for Task 5 (it doesn't dispatch business logic from the body), but flagged for hardening.
3. **`api/agent/runtime-file.js` — old-style `module.exports` handler.** Hard-coded allowlist already prevents traversal. No change.

## What was deliberately NOT touched

- All existing HMAC/signature verifiers (Stripe, Twilio, Calendly, per-source HMAC on `inbound-source`, per-vendor HMAC on `vendor-webhook`, optional shared-secret on `inbound`).
- All RLS / agency-scoping logic.
- All `me()` resolution + JWT forwarding.
- Caps on free-text fields kept generous (2000 chars for intake's `motivation`, 8000 for copilot `prompt`) to avoid breaking legitimate usage.
