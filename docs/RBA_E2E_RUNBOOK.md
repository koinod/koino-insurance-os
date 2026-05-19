# RBA E2E Runbook

Role-Based Agent (RBA) backend test harness + Mac mini install guide + production env reference.

---

## 1. Backend E2E Test Harness

### What it tests

`scripts/rba_e2e.mjs` walks the full agent lifecycle:

| Step | What | How |
|------|------|-----|
| 1 | Find test user | Auth Admin API → email contains `rba-test` |
| 2 | Issue install token | Service-role direct INSERT into `rba_install_tokens` |
| 3 | Redeem token | `POST /api/agent/redeem` → `{device_id, agent_token}` |
| 4 | Fetch capabilities | `GET /api/agent/capabilities` → role + tool ledger |
| 5 | Heartbeat | `POST /api/agent/heartbeat` → `last_seen_at` updated in DB |
| 6 | Claim empty queue | `POST /api/agent/command-claim` → `{command: null}` |
| 7 | Insert ping command | Service-role INSERT into `rba_commands` (simulates web UI) |
| 8 | Claim ping command | `POST /api/agent/command-claim` → `{command: {kind: "ping"}}` |
| 9 | Complete command | `POST /api/agent/command-complete` → `status=succeeded` in DB |
| 10 | Audit log | `POST /api/agent/audit` → row in `rba_audit` |
| 11 | Confirmation request | `POST /api/agent/confirmation-request` (with API fallback) |
| 12 | Resolve confirmation | Service-role PATCH → `resolution=approved` in DB |
| Cleanup | Revoke install | PATCH `rba_installs.status=revoked`; verify 401 on old token |

### Prerequisites

1. **One test user in Supabase Auth** whose email contains `rba-test`:
   - Supabase dashboard → Authentication → Users → Add user
   - Example: `rba-test@repflow.dev` (any password)
2. **agency_members row** for that user (role `rep`, `active=true`) in any real agency.

### Running

```bash
# with .env in project root:
echo "SUPABASE_URL=https://jfphwmzwteermalzwojp.supabase.co" >> .env
echo "SUPABASE_SERVICE_ROLE_KEY=eyJ..." >> .env

npm run test:rba-e2e
```

Or with env vars:
```bash
SUPABASE_URL=https://jfphwmzwteermalzwojp.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/rba_e2e.mjs
```

Against a different deployment:
```bash
REPFLOW_URL=https://repflow-staging.vercel.app npm run test:rba-e2e
```

### Expected output (green run)

```
═══════════════════════════════════════════════════════════════
  RBA Backend E2E Harness
  Target : https://repflow.koino.capital
  Supa   : https://jfphwmzwteermalzwojp.supabase.co
═══════════════════════════════════════════════════════════════

── Step 1: Find test rep user ───────────────────────────────────
  ✓  auth admin reachable
  Found : rba-test@repflow.dev  (xxxxxxxx-...)
  ✓  test user has active agency membership
  Agency: xxxxxxxx-...  Role: rep

── Step 2: Issue install token ──────────────────────────────────
  ✓  install token created
  Token : 3f7a2c9d0e1b... (expires ...)

── Step 3: Redeem install token ─────────────────────────────────
  ✓  redeem → 200
  ✓  device_id in response
  ✓  agent_token in response

── Step 4: Capabilities ─────────────────────────────────────────
  ✓  capabilities → 200
  ✓  capabilities.capabilities is object
  ✓  capabilities.role = rep
  ✓  capabilities.agency_id matches

── Step 5: Heartbeat ────────────────────────────────────────────
  ✓  heartbeat → 200
  ✓  heartbeat ok=true
  ✓  heartbeat device_id matches
  ✓  install status=active
  ✓  last_seen_at set

── Step 6: Command-claim (empty queue) ──────────────────────────
  ✓  claim empty queue → 200
  ✓  no command returned when queue empty

── Step 7: Post ping command ────────────────────────────────────
  ✓  ping command inserted
  ✓  command_id returned

── Step 8: Command-claim (ping in queue) ────────────────────────
  ✓  claim → 200
  ✓  claimed command kind = ping
  ✓  claimed command id matches

── Step 9: Command-complete ─────────────────────────────────────
  ✓  complete → 200
  ✓  complete ok=true
  ✓  command status=succeeded in DB
  ✓  command result.pong=true in DB

── Step 10: Audit log ───────────────────────────────────────────
  ✓  audit → 200
  ✓  audit ok=true
  ✓  audit row in DB
  ✓  audit result=ok in DB

── Step 11: Confirmation request ────────────────────────────────
  ✓  confirmation-request → 200 via API  (or known-bug fallback)
  ✓  confirmation_id returned

── Step 12: Resolve confirmation ────────────────────────────────
  ✓  confirmation resolved via service role
  ✓  resolution=approved in DB
  ✓  action=send_real_sms in DB

── Cleanup ──────────────────────────────────────────────────────
  ✓  synthetic install revoked
  ✓  revoked token rejected (401)

═══════════════════════════════════════════════════════════════
  ✅  All 28 assertions passed
═══════════════════════════════════════════════════════════════
```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set` | Missing env vars | Add to `.env` or export before running |
| `No user with email containing "rba-test" found` | No test user | Create one in Supabase Auth dashboard |
| `test user has active agency membership` fails | No `agency_members` row | Insert row: `INSERT INTO agency_members (user_id, agency_id, role, active) VALUES (...)` |
| `redeem → 200` fails with 422 | Token expired | Token expires after 4 min; re-run immediately after harness starts |
| `claim → 200` fails (command not returned) | Race condition | Wait 1s and re-run; `rba_claim_command` uses `FOR UPDATE SKIP LOCKED` |
| `confirmation-request → 200 via API` fails (expected) | Known bug in `api/agent/confirmation-request.js` — passes `jwt=null` to `rpc()` for a `service_role`-only RPC | Fallback activates automatically; fix: change `null` to `SERVICE` in the `rpc()` call on the last line of confirmation-request.js |
| Exit code 1 but all steps ran | One or more assertions failed | Check `●` lines in summary for which assertion and why |

---

## 2. Mac Mini Agent Install (Production)

> Reference: `OVERNIGHT_RBA_HANDOFF_2026-05-15.md` for full context.

### Prerequisites on Mac mini

- macOS 12+, Node.js 18+
- Network access to `repflow.koino.capital`
- A rep user account already in the agency

### Steps

**On the web UI (as the rep user):**
1. Open Settings → Agent → Generate Install Token
2. Copy the token (valid for 5 minutes)

**On the Mac mini:**
```bash
# Download and run the install script (generated by /api/agent/install.sh.js)
curl -fsSL https://repflow.koino.capital/api/agent/install.sh | bash
```

The script will prompt for the install token. It:
- Calls `POST /api/agent/redeem` with device info
- Writes `~/.repflow/agent_token` (chmod 600)
- Writes `~/.repflow/device_id`
- Installs a launchd/systemd service that:
  - POSTs heartbeat every 60s
  - Polls `command-claim` every 10s
  - Logs to `~/.repflow/agent.log`

**Verify:**
```bash
cat ~/.repflow/device_id   # should be a UUID
curl -H "x-agent-token: $(cat ~/.repflow/agent_token)" \
     https://repflow.koino.capital/api/agent/heartbeat \
     -X POST -H "content-type: application/json" -d '{}'
# → {"ok":true,"device_id":"...","role":"rep"}
```

**Revoke a device** (from web UI): Settings → Agent → Devices → Revoke

---

## 3. Production Env Vars

All vars are set in Vercel → repflow project → Environment Variables.

### Required

| Var | What | Where |
|-----|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase REST URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (secret) | Supabase → Settings → API |
| `CRON_SECRET` | Bearer token for Vercel cron endpoints | Generate: `openssl rand -hex 32` |

### Optional

| Var | Default | What |
|-----|---------|------|
| `REPFLOW_URL` | `https://repflow.koino.capital` | Override for staging |

### Vercel Cron Jobs (from vercel.json)

| Path | Schedule | What |
|------|----------|------|
| `/api/cron/reset-demo` | `0 */4 * * *` | Wipe + re-seed atlas demo agency |
| `/api/worker/dispatch-queue` | `0 9 * * *` | Process outbound queue |
| `/api/cron/appointment-reminders` | `0 14 * * *` | Pre-appointment SMS |
| `/api/cron/drip-runner` | `0 15 * * *` | Drip sequence step dispatch |
| `/api/cron/connector-probe` | `0 6 * * *` | Nightly connector health check |

---

## 4. Troubleshooting Matrix

### Agent can't connect

1. Check `~/.repflow/agent.log` for errors
2. Verify token not revoked: Settings → Agent → Devices
3. Re-issue token and re-run install script

### `rba_issue_install_token` "no active membership"

- The user calling the endpoint has no active `agency_members` row
- Fix: add them to the agency (Settings → Team → Invite)

### `rba_claim_command` permission denied

- The `/api/agent/command-claim` route passes `SERVICE` when calling the RPC (correct)
- If you see this error via direct Supabase REST: add `Authorization: Bearer {SERVICE_ROLE_KEY}`

### Confirmation never resolves

- Default expiry is 5 minutes (`expires_at = now() + interval '5 minutes'`)
- If the web modal wasn't seen, check `rba_action_confirmations` in Supabase for `resolution=null`
- Manually resolve: `UPDATE rba_action_confirmations SET resolution='denied', resolved_at=now() WHERE id='...'`

### Audit rows missing

- Check `rba_audit` table; filter by `device_id`
- If empty, the agent's `POST /api/agent/audit` calls may be failing silently (check agent.log)

### Demo reset fails

- Verify `reset_demo_agency` function exists: `SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name='reset_demo_agency'`
- Check atlas agency has `is_demo=true`: `SELECT id, slug, is_demo FROM agencies WHERE slug='atlas'`
- Manual reset: `SELECT reset_demo_agency('atlas')` in Supabase SQL editor
