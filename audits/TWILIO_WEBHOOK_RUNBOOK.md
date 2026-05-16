# Twilio Inbound SMS Webhook — Runbook

Owner: RepFlow ops. Scope: the agency-number → lead-reply path. **Not** the
RBA confirmation flow (Y/N replies from a rep's personal cell to approve an
agent action — that's `/api/twilio-inbound-sms`, untouched).

## What this is
When the agency SMSes a lead and the lead replies, Twilio POSTs the reply
to our webhook. The webhook either captures the opt-out (STOP) or threads
the reply into the rep's Messages page.

Endpoint: `POST https://repflow.koino.capital/api/twilio-sms-inbound`

Implementation: `/api/twilio-sms-inbound.js` (edge runtime).

## Required env
| Var | Used for |
|---|---|
| `TWILIO_AUTH_TOKEN` | Verifying Twilio's `X-Twilio-Signature`. **Required** in prod. Without it the route logs a warning and skips signature check (dev only). |
| `SUPABASE_SERVICE_ROLE_KEY` | Insert into `sms_outbox`, `sms_optouts`. Required. |
| `NEXT_PUBLIC_SUPABASE_URL` | Defaults to the koino project URL. Override per environment. |
| `DEFAULT_AGENCY_ID` | Fallback agency UUID when the To-number can't be resolved via `agency_phone_numbers`. Set this in single-tenant deployments. |

## Twilio console setup
1. Go to **Phone Numbers → Manage → Active Numbers** and pick the agency's
   sending number.
2. Under **Messaging Configuration** find **A MESSAGE COMES IN**.
3. Set:
   - **URL**: `https://repflow.koino.capital/api/twilio-sms-inbound`
   - **HTTP**: `POST`
4. (Optional) Under **Primary handler fails** set the same URL as the
   fallback so a transient error retries through the same handler. Twilio
   will dedupe on `MessageSid` thanks to the `uq_sms_outbox_twilio_sid`
   unique index.
5. Save.

Repeat per agency number. Each number should be present in
`public.agency_phone_numbers (phone_number, agency_id)` once that table is
seeded (currently the route falls back to `DEFAULT_AGENCY_ID`).

## How it routes a reply

```
Twilio POST  ──►  /api/twilio-sms-inbound
                       │
                       ├─ verify X-Twilio-Signature (HMAC-SHA1 over URL+sorted params)
                       │     401 if invalid (skipped in dev when env missing)
                       │
                       ├─ resolve agency_id  from agency_phone_numbers[To]  OR DEFAULT_AGENCY_ID
                       ├─ resolve related_lead_id  from pipeline.phone=From (newest)
                       │
                       ├─ STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT/OPTOUT (case-insensitive, first word)
                       │     → INSERT public.sms_optouts (phone, agency_id, reason='inbound_stop')
                       │     → also log to sms_outbox (audit)
                       │     → TwiML "You're opted out. Reply START to re-subscribe."
                       │
                       ├─ START/UNSTOP/RESUME/SUBSCRIBE/OPTIN/YES
                       │     → DELETE public.sms_optouts where phone=From
                       │     → also log to sms_outbox (audit)
                       │     → TwiML "You're re-subscribed."
                       │
                       └─ else
                             → INSERT public.sms_outbox
                                  direction='inbound', status='received',
                                  to_number=To, from_number=From, body=Body,
                                  twilio_sid=MessageSid, related_lead_id=<id|null>
                             → emit data:realtime event (best-effort, soft-fails)
                             → TwiML <Response/>  (empty — Twilio won't auto-reply)
```

## Testing

### A. Twilio CLI message simulator (no signature)
With dev mode (`TWILIO_AUTH_TOKEN` unset locally), you can drive the route
without computing a signature:

```bash
curl -i -X POST https://repflow.koino.capital/api/twilio-sms-inbound \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'From=+15551234567' \
  --data-urlencode 'To=+15559876543' \
  --data-urlencode 'Body=stop' \
  --data-urlencode 'MessageSid=SMtest1234567890'
```

Expected: 200 with `<Response><Message>You're opted out. Reply START to re-subscribe.</Message></Response>`.

### B. Signed request (prod parity)
Use the official Twilio CLI:

```bash
twilio api:core:messages:create \
  --from "+15551234567" \
  --to   "+15559876543" \
  --body "test reply from lead"
```

Then point a real Twilio number at the webhook and reply from your own
phone. Verify the row appears:

```bash
psql "$DATABASE_URL" -c "
  select id, direction, status, from_number, to_number, body, related_lead_id, created_at
    from public.sms_outbox
   where direction='inbound'
   order by created_at desc
   limit 5;"
```

### C. Inspect opt-outs
```bash
psql "$DATABASE_URL" -c "
  select phone, agency_id, reason, opted_out_at
    from public.sms_optouts
   order by opted_out_at desc
   limit 20;"
```

## Edge cases

| Situation | Behaviour |
|---|---|
| Lead has multiple `pipeline` rows with the same phone | `related_lead_id` is the most-recently-created row. The dedupe is intentional — reply threads always attach to the latest deal. |
| Phone matches `pipeline` rows across agencies | Filter is applied first by `agency_id` (from To-number lookup); falls back to a global lookup only if the agency filter returned nothing. Cross-tenant bleed is prevented at insert because `agency_id` on the row comes from the To-number resolution, not the lead. |
| Lead has no `pipeline` row | `related_lead_id` stays NULL. The row still lands so the Messages page can show "Unknown sender" — rep can manually link to a lead. |
| Twilio retries the same `MessageSid` | The `uq_sms_outbox_twilio_sid` index drops the second insert via 409 — handler catches and proceeds. (Twilio gets 200 either way so it stops retrying.) |
| `agency_phone_numbers` table doesn't exist yet | Lookup soft-fails; falls back to `DEFAULT_AGENCY_ID`. Safe to ship without that table seeded. |
| `data_events` table doesn't exist | Realtime emit silently no-ops. The persisted row is the source of truth; the event is a UI hint. |
| Compound STOP message ("stop emailing me") | First word is `STOP` → counts as opt-out. This matches Twilio + CTIA defaults. To narrow further, change the check to exact-equality only (the code path is one line). |
| `SUPABASE_SERVICE_ROLE_KEY` missing | Route 500s on insert. Twilio retries 3x by default — fix the env var and the messages reach the DB on retry. |

## Compliance note
Per CTIA + Twilio TCR rules, a confirmed STOP must remain opt-out across
every campaign on the number. The `sms_optouts.phone` PK enforces this at
the table level. `/api/twilio-sms` (outbound) **must** check
`sms_optouts` before sending; that gate is the responsibility of the
sender pipeline, not this webhook. See `0032_sms_optouts.sql` for the table
definition and any associated gating.

## Operational signals to watch
- `sms_outbox` rows where `direction='inbound'` and `related_lead_id is null`
  for >1h → either lead-import is stale or the rep needs to manually thread.
- `sms_optouts` insert rate > 1% of outbound send rate → outbound voice/
  cadence is annoying recipients; throttle.
- 401 responses from the route in Vercel runtime logs → either Twilio
  rotated its auth token or `TWILIO_AUTH_TOKEN` is wrong in env.
