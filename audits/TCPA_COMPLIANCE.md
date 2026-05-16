# TCPA Compliance Audit — Lead Drip Phase 2 Pre-Flight

**Date:** 2026-05-14
**Branch:** `sprint/tcpa-audit`
**Scope:** Every SMS-sending code path in `koino-insurance-os`.
**Status:** READ-ONLY sweep. No code changes. Hard cap 60 min.
**Why now:** RepFlow is moving from a state where ~zero SMS has fired to a state where the in-parallel `api/cron/sms-flush.js` could fire thousands. TCPA statutory damages are $500–$1500 per non-compliant text. Auditing first.

---

## Methodology

Searched the repo for every code path that:
- Inserts into `sms_outbox` with `status='pending'` (or any send-eligible status)
- Calls Twilio directly (`messages.create`, `Messages.json`)
- Calls `window.smsCompose` / `window.repflowSms`
- Composes copy that will eventually go through any of the above

Greps used: `sms_outbox`, `messages.create`, `smsCompose`, `repflowSms`, `Twilio`, `to_number`, `outbox.insert`, plus full sweep of `api/cron/*`, `api/sms/*`, `api/twilio-*`, `agent/runtime/tools/*sms*`, `repflow-agent/`.

Each site is classified against six gates and given a verdict.

### Gate definitions

- **Consent check** — does the path verify `pipeline.consent IS NOT NULL` (or equivalent) BEFORE inserting/sending? Note: `pipeline.consent` column has `default 'verified'` (migration 0001 line 78) — meaning any lead inserted without an explicit consent value is auto-flagged as consented. That is **not** TCPA consent under the FCC's 2024 one-to-one rule, but it is what the schema asserts.
- **STOP language in copy** — message body contains "Reply STOP to opt out" or equivalent.
- **Quiet-hours gate** — recipient local time 8am–9pm per 47 CFR §64.1200(c)(1).
- **`sms_optouts` check** — query against the opt-out registry before sending. Table is being authored in parallel as migration 0032.
- **Identity in opening** — 47 CFR §64.1200(b)(1): identify the business at the start of the message.
- **Verdict** — `SAFE_TO_SEND` / `NEEDS_FIX` / `BLOCKED_UNTIL_PHASE2`.

---

## Audit Table

| # | Site (file:line) | Trigger | Consent check? | STOP in copy? | Quiet-hours gate? | `sms_optouts` check? | Identity in opening? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | `api/twilio-sms.js:31` (Tier 2 outbox insert) | manual / API caller | FAIL — no read of `pipeline.consent` before `enqueueToOutbox` | FAIL — passes `body` through verbatim; no STOP injection | FAIL — no time check | FAIL — no `sms_optouts` query | DEFERRED — caller controls copy | NEEDS_FIX |
| 2 | `api/twilio-sms.js:111` (Tier 1 Twilio direct send via `Messages.json`) | manual / API caller | FAIL — no consent read; sends regardless | FAIL — body passed verbatim | FAIL — sends immediately | FAIL — no `sms_optouts` query | DEFERRED — caller controls copy | NEEDS_FIX |
| 3 | `api/twilio-sms.js:126` (Tier 1→Tier 2 fallback re-enqueue after Twilio error) | manual / API caller | FAIL — re-enqueues without any gate | FAIL — body passed verbatim | FAIL | FAIL | DEFERRED | NEEDS_FIX |
| 4 | `api/cron/drip-runner.js:157` (drip sequence sms_outbox insert) | auto / drip cron | FAIL — `select=id,lead_pipeline_id,...,phone,...,agency_id` at line 124 does not pull `consent`; no gate before insert | PASS — seeded templates in migration 0031 all end with "Reply STOP to opt out" (lines 99–168) | FAIL — fires at `now()` regardless of recipient TZ | FAIL — no `sms_optouts` query | PASS — opening uses `{{rep.name}} at {{agency.name}}` or "Welcome to {{agency.name}}" (migration 0031 line 99, 147) | BLOCKED_UNTIL_PHASE2 |
| 5 | `api/cron/drip-runner.js:157` (drip with `rep` audience) | auto / drip cron | N/A — rep-to-rep is not a TCPA prospect | PASS — rep onboarding/license-nudge templates also include "Reply STOP" (migration 0031 lines 147, 165–167) | FAIL — same `now()` fire-time issue | FAIL — but TCPA optout still applies to reps texted at personal #s | PASS — "Welcome to {{agency.name}}" | NEEDS_FIX |
| 6 | `page-leaddrip.jsx:772` (MessagingTab reply composer, direct `sms_outbox.insert`) | manual / rep typing | FAIL — composer never reads `pipeline.consent` | FAIL — `composer.trim()` written by rep, no enforced STOP suffix | FAIL — no time check | FAIL | FAIL — composer is free-form; no identity prefix injected | NEEDS_FIX |
| 7 | `page-floor-actions.jsx:98` (`SmsComposeModal` send, POSTs `/api/twilio-sms`) | manual / rep | FAIL — no `pipeline.consent` read before POST | FAIL — see SMS_TEMPLATES at lines 77–82, none contain "Reply STOP" | FAIL — sends on rep click | FAIL | PARTIAL — opens with "this is your Repflow producer" (line 78) but not all templates name the business; "Thanks for the time today, ${n}!" (line 81) has no identity at start | NEEDS_FIX |
| 8 | `page-crm.jsx:1326` (CRM SMS button → `window.smsCompose`) | manual / rep | FAIL — opens compose modal without consent gate | FAIL — depends on copy chosen in modal (#7) | FAIL | FAIL | FAIL (inherits from #7) | NEEDS_FIX |
| 9 | `page-pipeline.jsx:616` (Pipeline SMS button → `window.smsCompose`) | manual / rep | FAIL — same as #8 | FAIL — inherits #7 | FAIL | FAIL | FAIL (inherits from #7) | NEEDS_FIX |
| 10 | `page-queue.jsx:152` (Queue row SMS icon → `window.smsCompose`) | manual / rep | FAIL — same as #8 | FAIL — inherits #7 | FAIL | FAIL | FAIL (inherits from #7) | NEEDS_FIX |
| 11 | `page-queue.jsx:1792` (in-call panel `onSendSMS` → `window.smsCompose`) | manual / rep | FAIL — same as #8 | FAIL — inherits #7 | FAIL | FAIL | FAIL (inherits from #7) | NEEDS_FIX |
| 12 | `page-platform.jsx:305` (`testSms`, dev-test button) | manual / Ian-only | N/A — fires to operator's own phone with body "Repflow test SMS · ignore" | FAIL — no STOP, but operator self-test | N/A | N/A | FAIL — body doesn't name business but it's a self-test | SAFE_TO_SEND (operator-only diagnostic; gated by `prompt()` for recipient) |
| 13 | `api/twilio-inbound-sms.js:93` (TwiML `<Message>` reply to confirmation Y/N) | auto / Twilio webhook | N/A — replies only to incoming SMS from a number that previously messaged in (implied two-way consent) | FAIL — "Approved." / "Denied." / "No pending confirmation found." has no STOP | FAIL — fires immediately on inbound | FAIL — no `sms_optouts` query (but recipient is the same person who just texted in, so the optout question is inverted: they're already engaging) | FAIL — bare verb, no business name | NEEDS_FIX (low risk — implied consent + transactional, but still TCPA-adjacent) |
| 14 | `api/sms/outbox.js:97` (`/api/sms/outbox?op=claim`) | auto / Repflow Agent poll | N/A — claim endpoint does not compose copy; it surfaces existing `sms_outbox` rows to the local agent | N/A — passes `body` through to the agent which then dispatches via macOS iMessage / adb (`repflow-agent/local_sms_agent.py:187`) | FAIL — no quiet-hours gate; agent sends whenever it claims | FAIL — does not query `sms_optouts`; will dispatch any row whose status flips to `pending` | PASS — downstream from insert; identity is whatever the upstream inserter wrote | BLOCKED_UNTIL_PHASE2 (consolidation point) |
| 15 | `repflow-agent/local_sms_agent.py:187` (local agent dispatch via osascript / adb) | auto / agent poll | N/A — agent is dumb pipe | N/A — body is whatever was inserted | FAIL — fires the moment claim succeeds | FAIL — agent does not check optouts | PASS — inherited | BLOCKED_UNTIL_PHASE2 (this is where actual carrier dispatch happens — must be gated upstream) |
| 16 | `agent/runtime/tools/draft_sms.py:run()` | auto / RBA agent | N/A — drafts only; "send_real_sms" requires confirmation per `api/agent/confirmation-request.js:13` and `confirm_required` policy in `api/agent/_lib.js:118` | N/A — drafts file to `~/.repflow/agent/workspace/drafts` only; no send path | N/A | N/A | N/A | SAFE_TO_SEND (draft-only; confirmation flow is the actual send) |

### Sites NOT found

Searched, zero hits:
- **Rep-to-rep manual SMS** outside drip (no `smsCompose` path that fires to rep phones, only drip rep-audience cron handles that). Audit row #5 covers the only rep-audience SMS path.
- **Mass-blast / bulk SMS** UI. No "send to all" button found.
- **`/api/sms/send`**, `/api/sms/blast`, or any other `api/sms/*` endpoint beyond `outbox.js`.
- **Marketing-list SMS** distinct from drip.
- **`api/cron/sms-flush.js`** does not yet exist — it is the in-parallel Phase 2 work that will become the consolidation choke point.

---

## 1. Critical blockers — send-eligible TODAY with no consent gate AND/OR no STOP

These are SMS sites that, if fired today (i.e., if `org_settings.drip.send_enabled = true` were flipped OR if Twilio creds were configured and a rep clicked Send), would create immediate per-message TCPA exposure.

### Block 1 — Manual rep-side SMS compose lacks STOP language
**Sites:** `page-floor-actions.jsx:77-82` (SMS_TEMPLATES) → flows to `page-floor-actions.jsx:98` (POST `/api/twilio-sms`) → flows to `api/twilio-sms.js:111` or `api/twilio-sms.js:31`.

**Specific fix needed:**
- Every SMS_TEMPLATES body in `page-floor-actions.jsx:77-82` must end with " Reply STOP to opt out." appended.
- The composer textarea at `page-floor-actions.jsx:142-150` should enforce STOP suffix or block send when missing (server-side enforcement preferable — see §4).
- The `/api/twilio-sms` handler must reject any body that does not match `/reply stop|text stop|opt out/i` (defense in depth).

### Block 2 — Manual rep-side compose lacks consent check
**Sites:** All `window.smsCompose` entrypoints — `page-crm.jsx:1326`, `page-pipeline.jsx:616`, `page-queue.jsx:152`, `page-queue.jsx:1792`, plus the `SmsComposeModal` itself.

**Specific fix needed:**
- Before opening `SmsComposeModal`, callers must read `lead.consent` and refuse to open (or display a blocking warning + Ian-only override) when `lead.consent === 'pending'` or `'none'`.
- Server-side: `/api/twilio-sms` should `SELECT consent FROM pipeline WHERE id = $lead_id` and 403 when consent is not `'verified'`. Note: schema's `default 'verified'` (migration 0001 line 78) is itself a TCPA problem — leads imported without an affirmative consent record will silently appear consented. Recommend changing default to `'pending'` and audit-trailing the original consent capture.

### Block 3 — Manual MessagingTab reply composer in Lead Drip has zero gates
**Site:** `page-leaddrip.jsx:764-790`.

**Specific fix needed:**
- Direct `sb.from("sms_outbox").insert(...)` from the browser is the most exposed path because it bypasses `/api/twilio-sms` entirely. RLS allows any authenticated agency member to write. Either:
  - Route this through `/api/twilio-sms` and rely on the server-side `sendSms` helper (§4), OR
  - Tighten the RLS write policy on `sms_outbox` (currently `with check (agency_id in (select public.viewer_agency_ids()))` at `supabase/migrations/0016_sms_outbox.sql:53-54`) to deny direct insert from authenticated role and only allow service_role.

### Block 4 — `pipeline.consent` defaults to 'verified'
**Site:** `supabase/migrations/0001_repflow_v2_init.sql:78`.

**Specific fix needed:**
- Change default to `'pending'`. Add migration that backfills any rows whose `consent='verified'` lacks a corresponding row in a (to-be-built) `lead_consent_records` audit table — flip those back to `'pending'` until consent is re-verified.
- Failing that change, **the entire consent gate above is theatrical** — every imported lead would pass it.

---

## 2. Phase 2 dependencies — sites that become compliant once `api/cron/sms-flush.js` adds the gates

The Phase 2 author should know which audit rows resolve when the flush job lands. These all carry `BLOCKED_UNTIL_PHASE2` (or upgrade from `NEEDS_FIX` to `SAFE_TO_SEND` post-Phase-2):

| Audit row | Site | What sms-flush.js must do to unblock |
|---|---|---|
| #4 | `api/cron/drip-runner.js:157` | drip-runner queues to `sms_outbox` with `status='dry_run'` or `'pending'`. sms-flush must (a) consume only `'pending'`, (b) join to `pipeline` and verify `consent='verified'`, (c) check `sms_optouts` for `to_number`, (d) check `quiet_hours_ok(to_number, agency_tz)` before dispatching to Twilio, (e) re-verify body contains STOP. Drip seeded copy already has STOP, so (e) is the cheap one. |
| #5 | drip-runner rep audience | Same gates as #4 minus consent (rep audience). `sms_optouts` still applies (a rep who replied STOP from their personal # is still TCPA-protected). |
| #14 | `api/sms/outbox.js:97` (claim) | If sms-flush moves the Twilio dispatch into the cloud, the local-agent path becomes secondary. Either deprecate the claim endpoint, OR have sms-flush.js stamp `compliance_checked_at` on `sms_outbox` rows before they're claimable; reject claim of rows missing that stamp. |
| #15 | `repflow-agent/local_sms_agent.py:187` | Inherited — local agent only claims rows sms-flush has cleared. |

**Phase 2 author checklist** (lift this into `api/cron/sms-flush.js`):
1. `SELECT * FROM sms_outbox WHERE status='pending' AND compliance_checked_at IS NULL LIMIT 100`
2. For each row, in order:
   - `related_lead_id IS NOT NULL` → join to `pipeline.consent`. Skip + mark `status='blocked', error_text='no consent'` if not `'verified'`.
   - `to_number` exists in `sms_optouts` (per agency_id) → skip + mark `status='blocked', error_text='opted out'`.
   - Recipient state/TZ → quiet-hours check. If 9pm–8am recipient local, set `status='deferred', defer_until=<next 8am local>`.
   - Body contains `/reply stop|text stop|opt out/i` → if not, skip + mark `status='blocked', error_text='missing stop language'`.
   - State-specific: see §3.
3. Survivors: stamp `compliance_checked_at=now()`, dispatch to Twilio, set `status='sent'` on success.
4. Audit-trail every blocked row in a `sms_compliance_skips` table (or reuse `drip_log` with `status='blocked'`).

---

## 3. State-specific gotchas

Recipient state must be checked. These are notes for the Phase 2 author; not implementing here.

- **Florida — FTSA (Fla. Stat. §501.059, amended 2023):** Stricter than federal. Quiet hours 8am–8pm recipient local (not 9pm). Caps at 3 commercial texts per 24h per recipient. Express written consent required before first commercial text. Private right of action with $500/text statutory minimum. Verdict: FL recipients should pause and require additional opt-in scaffolding before sms-flush dispatches.
- **Washington — CEMA (RCW 19.190):** Misrepresented sender identity → $500/text. Identity prefix (the §64.1200(b) "business name at start" check) is enforced more aggressively. Make sure templates render `{{agency.name}}` not the literal token.
- **Oklahoma — TCPA-MTA (24 O.S. §15–810, eff. 2024):** Quiet hours 8am–8pm recipient local. $500–$1500/text statutory. Recently weaponized — assume OK plaintiffs' bar is active.

At minimum, sms-flush.js should branch on `pipeline.state IN ('FL','WA','OK')` and apply tightened defaults (8pm cutoff, identity-prefix sanity check). A `state_sms_rules` reference table would be cleaner than hardcoding.

---

## 4. Recommended canonical send helper

Every SMS send site in this codebase should route through ONE helper. Sketch:

### Signature

```
sendSms({
  to:               string,   // E.164 phone (required)
  body:             string,   // message text (required)
  agency_id:        uuid,     // for tenant isolation + agency tz (required)
  related_lead_id:  uuid|null,// for consent join (required when send is to a prospect)
  related_thread_id:uuid|null,// for inbound-reply continuity
  rep_id:           text|null,// for from-identity injection
  source:           string,   // 'manual' | 'drip-sequence' | 'soa-reminder' | etc.
  audience:         'lead'|'rep', // skip consent join when 'rep'
  override:         {         // ONLY Ian / super_admin can set
    skip_consent?: boolean,
    skip_quiet_hours?: boolean,
    reason: string,           // audit-required when any skip is true
  }|null,
})
  → { ok: boolean, outbox_id?: string, blocked_reason?: string, deferred_until?: string }
```

### Embedded gates (in this order)

1. **Body sanity** — non-empty, ≤1600 chars, no leaked `{{token}}` placeholders.
2. **Identity prefix** — body must start with a recognizable identity token (`{{agency.name}}`, `{{rep.name}} at {{agency.name}}`, or a literal that resolves to either). Reject if absent.
3. **STOP suffix** — body must contain `/reply stop|text stop|opt out/i`. Reject if absent. (Defense in depth: also auto-append " Reply STOP to opt out." if missing AND length budget allows; log a warning either way.)
4. **Consent gate** — if `audience='lead'` AND `related_lead_id`: `SELECT consent FROM pipeline WHERE id=$1` → must be `'verified'`. Reject otherwise (with `blocked_reason='consent_not_verified'`).
5. **`sms_optouts` check** — `SELECT 1 FROM sms_optouts WHERE phone=$to AND (agency_id=$agency_id OR agency_id IS NULL)`. Reject if hit.
6. **Quiet-hours gate** — resolve recipient TZ from `pipeline.state` (or default to agency TZ when state missing). Federal: 8am–9pm. FL/OK: 8am–8pm. Return `deferred_until` instead of rejecting.
7. **State-specific** — FL: ≤3 commercial texts/24h to same recipient; check `sms_outbox` for prior 24h count. WA: identity-prefix double-check. OK: same quiet-hours tightening.
8. **Rate limit** — per-agency send budget (e.g., 1 SMS per recipient per 60 min unless transactional). Prevents accidental spam from a misconfigured drip.
9. **Audit** — on every reject, write to `sms_compliance_skips` (or `drip_log` with new status). Every send, mark `compliance_checked_at` on the resulting `sms_outbox` row.
10. **Dispatch** — only after 1–9 pass, insert into `sms_outbox` with `status='pending'` AND `compliance_checked_at=now()`. The Twilio dispatcher (sms-flush.js) trusts only rows with this stamp.

### Where it lives

- Server module: `lib/sms/send.js` (or `api/sms/_send.js`).
- Every existing send site (audit rows #1, #2, #3, #4, #6, #7) refactored to call this helper.
- RLS on `sms_outbox` write tightened to `service_role` only (closes the `page-leaddrip.jsx:772` direct-insert hole).
- Browser-side compose modal becomes a `fetch('/api/sms/send', {...})` call that runs the gates on the server. No direct Supabase writes from the client.

### Migration order

1. Land `lib/sms/send.js` + `/api/sms/send` route.
2. Migration: tighten `sms_outbox` RLS, change `pipeline.consent` default to `'pending'`, create `sms_optouts`, create `sms_compliance_skips`, create `state_sms_rules` reference.
3. Refactor existing call sites (drip-runner, twilio-sms, page-leaddrip messaging tab, page-floor-actions modal) to route through the helper.
4. Land `api/cron/sms-flush.js` — the Twilio dispatcher — that consumes only `compliance_checked_at IS NOT NULL` rows.
5. Smoke test: set `drip.send_enabled=true` against a test agency with one consented lead + STOP-compliant template. Verify (a) send works, (b) flipping `consent='pending'` blocks, (c) inserting `to_number` into `sms_optouts` blocks, (d) 10pm local recipient defers, (e) Florida recipient with 3 prior 24h sends is blocked.

---

## Honest scope notes

- This audit looked at the **code paths**. It did NOT verify:
  - Twilio A2P 10DLC registration status (operational, not codebase).
  - Whether the actual `pipeline.consent='verified'` rows in production have a real audit trail behind them. If they don't, this audit's gates pass theatrically.
  - Whether any past sends already created liability. Assume some risk exists for any historical sends that lack records.
- The audit covered: `/Users/macmini/repos/koino-insurance-os/.claude/worktrees/agent-a32d2db3d4955fe7b/` worktree on branch `sprint/tcpa-audit`.
- No code changes shipped. One new file: this one.
