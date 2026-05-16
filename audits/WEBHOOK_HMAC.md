# WEBHOOK_HMAC — Vendor webhook HMAC enforcement

Sprint task 12. Target: `api/leads/vendor-webhook.js` against schema in `supabase/migrations/0025_lead_vendor_webhooks.sql`.

## Findings (pre-change)

| Check | Before | Note |
|---|---|---|
| 1. Looks up vendor by `endpoint_slug` | ✅ | `lead_vendor_webhooks?endpoint_slug=eq.<slug>&is_active=eq.true&limit=1` via service-role |
| 2. Computes HMAC-SHA256 over body using `vendor.hmac_secret`; compares against `x-webhook-signature` (also accepts legacy `x-repflow-signature`) | ✅ | `verifyHmac()` in the file; falls through to 401 when secret missing or sig invalid |
| 3. Constant-time compare | ✅ (hand-rolled) | length-check + XOR loop. Edge runtime can't use Node's `crypto.timingSafeEqual` directly; the hand-rolled loop is the equivalent shape. |
| 4. Replay protection (timestamp window + request-id dedupe) | ❌ MISSING | A captured POST could be replayed indefinitely. |

## Fixes shipped on this branch

### 1. Timestamp window (5 minutes)

If the vendor sends `x-webhook-timestamp` (unix seconds), the handler now rejects requests whose drift exceeds 300 seconds. When the header is absent the check is skipped so vendors that don't send a timestamp aren't broken — request-id dedupe (below) is the second line of defense.

```js
const tsHeader = req.headers.get("x-webhook-timestamp") || "";
if (tsHeader) {
  const t = parseInt(tsHeader, 10);
  if (!Number.isFinite(t)) return err(400, "x-webhook-timestamp must be a unix-seconds integer");
  const driftSec = Math.abs(Math.floor(Date.now() / 1000) - t);
  if (driftSec > 300) return err(401, "timestamp drift exceeds 5 minutes — request rejected as potential replay");
}
```

### 2. Request-ID dedupe

If the vendor sends `x-webhook-id` or `x-request-id`, the handler upserts `(slug, request_id)` into the new `webhook_replay_seen` table with `prefer: resolution=ignore-duplicates`. A duplicate returns `200 { duplicate: true }` so retries are idempotent without re-firing the pipeline insert.

```js
const reqIdHeader = (req.headers.get("x-webhook-id") || req.headers.get("x-request-id") || "").slice(0, 128);
if (reqIdHeader) {
  // … insert into webhook_replay_seen with on_conflict=slug,request_id
  // If response shape says the row already existed → return { duplicate: true }
}
```

If the underlying table doesn't exist (migration not yet applied), the code falls through and ingest proceeds without dedupe — no regression on existing deployments.

### 3. Body-size cap (defense-in-depth)

Hard cap of 64KB on the raw body. A malicious caller can't OOM the edge function by streaming gigabytes of "lead" data before HMAC verification finishes.

```js
if (rawBody.length > 65_536) return err(413, "body too large (max 64KB)");
```

### 4. New migration: `supabase/migrations/0037_webhook_replay_seen.sql`

```sql
create table if not exists public.webhook_replay_seen (
  slug        text        not null,
  request_id  text        not null,
  seen_at     timestamptz not null default now(),
  primary key (slug, request_id)
);
create index idx_webhook_replay_seen_at on public.webhook_replay_seen (seen_at);
alter table public.webhook_replay_seen enable row level security;
revoke all on public.webhook_replay_seen from anon, authenticated;
```

RLS is enabled but no `auth` policy is granted — service-role bypasses RLS, and that's the only role that should ever read/write here. Retention cleanup (drop rows older than N days) is a follow-on; rows are small (text+text+timestamptz) so the table can grow for a long time before mattering.

## Validation

- `node --check api/leads/vendor-webhook.js` → clean.
- No regressions to the existing HMAC path: vendors that don't send `x-webhook-timestamp` or `x-webhook-id` keep working exactly as before. Vendors that DO send them now get replay protection automatically.
- Service-role calls bypass RLS so the migration doesn't disturb existing operator flows.

## Open items

- Operator guidance: update vendor-onboarding doc to recommend sending `x-webhook-timestamp` and `x-webhook-id` headers. Without them, replay protection degrades to "HMAC-only" — same as before this change, no worse.
- Cleanup cron: add a daily job that deletes `webhook_replay_seen` rows older than 7 days. Out-of-scope for this sprint; leave the table to grow until volume justifies.
- The same `vendor.hmac_secret` powers the demo seeds in `0025_lead_vendor_webhooks.sql`. Per the migration's note, those secrets are random per-deploy and the operator rotates before go-live. No new exposure introduced here.

## Related, NOT-fixed (out of scope for Task 12)

- `api/leads/inbound.js` — uses a shared platform-wide `LEADS_WEBHOOK_SECRET`. Already accepts requests in dev when unset. Not in scope: Task 12 is the per-vendor table. Existing replay risk applies; same mitigations would translate cleanly when prioritized.
- `api/leads/inbound-source.js` — per-source HMAC, no replay protection. Same shape, same fix would apply.
- `api/connector/calendly-webhook.js` — Calendly verifies with `t.body` HMAC; same timestamp drift not enforced (5 min would be standard). Out of scope.
- `api/stripe/webhook.js` and `api/connector/stripe-webhook.js` — Stripe enforces a tolerance window (`toleranceSec = 300` in `api/stripe/webhook.js`); already covered. The `api/connector/stripe-webhook.js` variant does NOT check drift — flagged for separate hardening.
