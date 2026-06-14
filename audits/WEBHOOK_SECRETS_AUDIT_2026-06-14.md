# Webhook Secrets Audit — 2026-06-14

**Operator:** Ian (bigbacon61)
**Repo:** `koinod/koino-insurance-os`
**Vercel project:** `koinocapital-7163s-projects/koino-insurance-os`

## TL;DR

Two inbound webhook endpoints — **Calendly** and **Fathom** — currently
**accept unsigned / forged requests in production** because their signing
secrets are not set in Vercel and the handlers **fail open** (`if (!secret)
return true`). Stripe and the leads ingest are protected. Fix = set
`CALENDLY_WEBHOOK_SECRET` and `FATHOM_WEBHOOK_SECRET` via `vercel env add`.

## Methodology

```bash
grep -rn "WEBHOOK_SECRET|verifySignature|verify_signature|constructEvent|createHmac|signature" api/
vercel env ls production
# cross-reference code env refs vs Vercel env list
```

Then read each handler's `verify*()` function to determine its
**missing-secret behavior** (fail-open vs fail-closed).

## Fail-open vs fail-closed behavior (the load-bearing detail)

| Handler | File | Missing-secret behavior |
|---|---|---|
| Calendly | `api/connector/calendly-webhook.js:15` | `if (!secret) return true;` → **FAIL OPEN** (accepts unsigned) |
| Fathom | `api/connector/fathom-webhook.js:24` | `if (!secret) return true;` → **FAIL OPEN** (accepts unsigned) |
| Stripe (connector) | `api/connector/stripe-webhook.js:15` | `if (!secret) return true;` → **FAIL OPEN** (but secret IS set) |
| Stripe (billing) | `api/stripe/webhook.js:48–51` | returns **503 `webhook_secret_missing`** → **FAIL CLOSED** ✓ |
| Leads inbound | `api/leads/inbound.js:28,41` | rejects 401 without valid sig → **FAIL CLOSED** ✓ |

## Audit table

| Webhook | Code references | Env var | Set in Vercel (prod)? | Risk |
|---|---|---|---|---|
| Stripe (billing) | `api/stripe/webhook.js:48` | `STRIPE_WEBHOOK_SECRET` | **Yes** (Prod+Preview+Dev, 41d) | None — fail-closed + secret present |
| Stripe (connector/automations) | `api/connector/stripe-webhook.js:60` | `STRIPE_WEBHOOK_SECRET` | **Yes** (same var) | None — secret present, sig enforced |
| Calendly | `api/connector/calendly-webhook.js:35` | `CALENDLY_WEBHOOK_SECRET` | **NO** | **HIGH** — forged `invitee.created`/`invitee.canceled` accepted; injects/cancels `appointments` rows + fires `automation_fire(appointment_booked)` for any agency with a matching lead email |
| Fathom | `api/connector/fathom-webhook.js:53` | `FATHOM_WEBHOOK_SECRET` | **NO** | **HIGH** — forged meeting payloads accepted; writes `meeting_notes`, can append to `pipeline.notes`, and fans out `post_call_followup` RBA commands to rep devices |
| Leads (shared) | `api/leads/inbound.js:28` | `LEADS_WEBHOOK_SECRET` | **Yes** (Prod, 20d) | None — fail-closed |
| Leads (vendor) | `api/leads/vendor-webhook.js:125` | per-row `inbound_hmac_secret` (DB) | n/a (DB-scoped) | None — fail-closed, rejects 401 |

## Missing secrets — remediation (operator action)

> **Do NOT paste secret values into this file, commit messages, or chat.**
> Add them directly: `vercel env add <VAR> production` (paste when prompted),
> then redeploy so the edge functions pick up the new env.

### 1. `CALENDLY_WEBHOOK_SECRET`
- **Where Ian gets it:** Calendly's webhook **signing key** is returned by the
  Calendly Webhook Subscriptions API when the subscription is created
  (`POST https://api.calendly.com/webhook_subscriptions` → `resource.signing_key`).
  It is **not** shown again in the normal Calendly web UI, so capture it at
  creation time (Calendly Developer portal → personal access token → create
  subscription). If the existing subscription's key was lost, delete and
  recreate the subscription to get a fresh `signing_key`.
- **Header verified:** `Calendly-Webhook-Signature` (`t=<unix>,v1=<hmac-sha256>`).
- **Command:**
  ```bash
  vercel env add CALENDLY_WEBHOOK_SECRET production
  ```

### 2. `FATHOM_WEBHOOK_SECRET`
- **Where Ian gets it:** Fathom dashboard → **Settings → Webhooks** (or the
  developer portal at developers.fathom.ai). The secret is a Standard-Webhooks
  (Svix) `whsec_...` value shown when you create/view the webhook endpoint.
- **Header verified:** `webhook-id` / `webhook-timestamp` / `webhook-signature`
  (Standard Webhooks; handler also enforces a 5-min replay window).
- **Command:**
  ```bash
  vercel env add FATHOM_WEBHOOK_SECRET production
  ```

After adding both, trigger a redeploy (push or `vercel --prod`) and verify a
**forged** POST (no/invalid signature) now returns **401 `bad signature`**
instead of 200.

## Notes / follow-ups (not in this lane — no code changes made here)

- The fail-open default is deliberate ("keeps the integration working until the
  operator sets it") but means a missing env silently disables auth. Consider
  flipping Calendly + Fathom to **fail-closed** (503 like `api/stripe/webhook.js`)
  once secrets are set, so a future env wipe can't silently re-open them. Logged
  here as a TODO; no handler code was changed in this audit.
- `api/system/health.js:108` exposes `leads_webhook_secured`; consider adding
  `calendly_webhook_secured` / `fathom_webhook_secured` flags for monitoring.
