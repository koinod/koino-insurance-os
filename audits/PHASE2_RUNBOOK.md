# Lead Drip Phase 2 — Twilio Sender Runbook

Phase 1 (commit `f995220`) queues `sms_outbox` rows. Phase 2 (this branch,
`sprint/leaddrip-phase2-sender`) is the cron that picks them up and sends them
via Twilio with compliance gates.

## How to enable

1. **Verify Twilio env vars** are set in the Vercel project:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` (E.164, e.g. `+18885551212`; falls back to
     `TWILIO_CALLER_ID` for legacy compat)

   Quick check from a deployed environment:
   ```bash
   curl -sH "authorization: Bearer $CRON_SECRET" \
        https://<project>.vercel.app/api/cron/sms-flush?limit=1
   ```
   If you get `{"ok":false,"error":"twilio_unconfigured"}` the env vars are
   missing or empty. Fix that first.

2. **Apply migration `0032_sms_optouts.sql`** to the Supabase project. Adds:
   - `public.sms_optouts` (STOP-list, anon-writable for the Twilio webhook)
   - Widened `sms_outbox.status` CHECK constraint (accepts the new skip values)
   - `sms_outbox.twilio_sid` column

3. **Flip the send-enabled flag** so `drip-runner` starts queueing
   `status='pending'` instead of `status='dry_run'`:
   ```sql
   update public.org_settings
      set value = 'true'::jsonb, updated_at = now()
    where key = 'drip.send_enabled' and agency_id is null;
   ```
   Optionally also flip per-agency rows. The default (NULL agency_id) applies
   to all agencies unless overridden.

4. **(Optional, Pro plan)** Bump the cron cadence. The Hobby plan caps cron
   at 1/day. Once Pro is enabled, edit `vercel.json` and change the
   `sms-flush` entry from `"0 16 * * *"` to `"*/15 * * * *"` for the original
   "send within 15 minutes of queue" SLA.

## How to inspect

```sql
-- 1. What's in the outbox right now, by status:
select status, count(*) from public.sms_outbox
 where created_at > now() - interval '24 hours'
 group by status order by 2 desc;

-- 2. Most recent flush activity (per-row audit):
select occurred_at, channel, status, to_number, left(body, 60) as body_head, error_text
  from public.drip_log
 where occurred_at > now() - interval '24 hours'
 order by occurred_at desc limit 50;

-- 3. STOP-list growth:
select agency_id, reason, count(*) from public.sms_optouts
 group by agency_id, reason order by 3 desc;

-- 4. Twilio SIDs of sent messages (correlate with Twilio dashboard):
select id, to_number, twilio_sid, sent_at
  from public.sms_outbox
 where status = 'sent' and sent_at > now() - interval '24 hours'
 order by sent_at desc;
```

Compliance-skip rows leave a `drip_log` entry with `status` set to one of:
- `skipped_no_consent` (related pipeline lead has no `consent`)
- `skipped_opted_out`  (recipient on `sms_optouts`)
- `skipped_quiet_hours` (outside 9am–8pm at recipient's local time; retries
  on the next cron run — outbox row stays `pending`)
- `failed` with `error_text='missing_stop_language'` (body lacked the
  mandatory "Reply STOP to opt out" tail)
- `failed` with `error_text='bad_phone: ...'` (number not E.164-normalizable)

## How to disable

Flip the flag back:
```sql
update public.org_settings
   set value = 'false'::jsonb, updated_at = now()
 where key = 'drip.send_enabled' and agency_id is null;
```

Effect: from the next `drip-runner` tick onward, new sms_outbox rows are
queued with `status='dry_run'` again (Phase 1 behavior). In-flight rows
already at `status='pending'` will still be picked up by the next
`sms-flush` run; if you want a hard halt, also drop the `sms-flush` entry
from `vercel.json` or rotate `CRON_SECRET`.

To selectively block one agency without affecting others, insert a
per-agency override:
```sql
insert into public.org_settings (key, value, agency_id, updated_by)
values ('drip.send_enabled', 'false'::jsonb, '<agency-uuid>', 'manual-disable');
```

## What's NOT in this PR

- A Twilio inbound-SMS webhook that auto-writes to `sms_optouts` on
  "STOP"/"UNSUBSCRIBE" replies. The table is ready; the writer is the next
  step. Until that exists, opt-outs come via manual inserts from agency
  admins (the `sms_optouts_auth_insert` policy allows this).
- Twilio delivery-status webhooks. We store the `twilio_sid` so we can
  correlate later, but `status='sent'` here means "Twilio accepted the
  request", not "the carrier delivered it". A future webhook can update
  the row to `delivered` / `undelivered` / `failed-downstream`.
- A Pro-plan cron schedule change. The 16:00 UTC daily run is Hobby-plan
  compatible; bump to `*/15 * * * *` post-upgrade.
