# OCI Cron Migration Plan

**Status:** Plan only — not executed yet.
**Why:** Repflow on Vercel Hobby blocks sub-daily crons (`0 */4 * * *`, `*/30 * * * *`, etc.). OpenClaw on OCI is 24/7 and can hit `/api/cron/*` endpoints with no frequency cap. Stripe-grade reliability without the $20/mo Vercel Pro upgrade.

## Current Vercel cron entries (target for migration)

| Job | Frequency | Endpoint | Blocked on Hobby? |
|---|---|---|---|
| reset-demo | `0 */4 * * *` (every 4h) | `/api/cron/reset-demo` | **YES** — pulled from vercel.json, currently routed via pg_cron |
| score-recent-calls | `*/30 * * * *` (every 30m) | `/api/cron/score-recent-calls` | **YES** — pulled from vercel.json, no replacement scheduler |
| appointment-reminders | `*/15 * * * *` (every 15m) | `/api/cron/appointment-reminders` | **YES** — likely still in vercel.json, will fail Hobby check |
| rba-anomaly-scan | `0 */6 * * *` (every 6h) | `/api/cron/rba-anomaly-scan` | **YES** — sub-daily |
| drip-runner | TBD (likely `*/5 * * * *`) | `/api/cron/drip-runner` | **YES** if sub-daily |
| connector-probe | daily | `/api/cron/connector-probe` | Allowed on Hobby — low priority to move |
| invite-health | daily | `/api/cron/invite-health` | Allowed on Hobby — low priority to move |

## OpenClaw scheduler config (proposed)

For each cron, OpenClaw fires a curl with the bearer token:

```bash
# Generic shape
curl -fsS -X GET \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "User-Agent: openclaw-scheduler/1.0" \
  --max-time 60 \
  https://repflow.koino.capital/api/cron/<job>
```

OpenClaw scheduler.yaml entries (matches existing OpenClaw config format):

```yaml
schedules:
  - name: repflow_reset_demo
    cron: "0 */4 * * *"           # every 4h
    command: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://repflow.koino.capital/api/cron/reset-demo
    timeout_sec: 30
    retry: 1
    log: /var/log/openclaw/repflow_reset_demo.log

  - name: repflow_score_recent_calls
    cron: "*/30 * * * *"          # every 30m
    command: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://repflow.koino.capital/api/cron/score-recent-calls
    timeout_sec: 120
    retry: 1
    log: /var/log/openclaw/repflow_score_calls.log

  - name: repflow_appointment_reminders
    cron: "*/15 * * * *"          # every 15m
    command: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://repflow.koino.capital/api/cron/appointment-reminders
    timeout_sec: 30
    retry: 1
    log: /var/log/openclaw/repflow_appt_reminders.log

  - name: repflow_rba_anomaly_scan
    cron: "0 */6 * * *"           # every 6h
    command: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://repflow.koino.capital/api/cron/rba-anomaly-scan
    timeout_sec: 60
    retry: 1
    log: /var/log/openclaw/repflow_rba_anomaly.log

  - name: repflow_drip_runner
    cron: "*/5 * * * *"           # every 5m
    command: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://repflow.koino.capital/api/cron/drip-runner
    timeout_sec: 60
    retry: 1
    log: /var/log/openclaw/repflow_drip.log
```

`$CRON_SECRET` lives in OpenClaw's secrets store and matches the value set in Vercel project env.

## Migration steps

1. **Verify each `/api/cron/*` endpoint accepts a Bearer `CRON_SECRET`** (most already do — confirm by grepping `api/cron/*.js` for `CRON_SECRET`).
2. Add the 5 sub-daily entries to OpenClaw's `scheduler.yaml`.
3. Hit each endpoint manually with the bearer token to smoke-test before scheduling.
4. **Drop sub-daily entries from `vercel.json` `crons` array.** Keep only `connector-probe` (daily) and `invite-health` (daily).
5. Commit + push. Vercel deploy will succeed because no Hobby violations remain.
6. Reload OpenClaw scheduler on OCI: `systemctl restart openclaw-scheduler` or whatever the OpenClaw equivalent is.
7. Watch logs for 24h to confirm all 5 jobs fire on schedule.

## Failure modes to watch

- **OCI loses network connectivity** → all Repflow crons stall. Vercel cron would have kept firing. Tradeoff for free vs $20/mo.
- **`CRON_SECRET` mismatch** between OpenClaw and Vercel → endpoints return 401. Watch initial run logs.
- **OpenClaw scheduler crashes** without retry → silent miss. Configure systemd `Restart=on-failure` on the OpenClaw scheduler service.
- **Endpoints take too long** → curl `--max-time` should be tuned per job. `score-recent-calls` can take longer because of the LLM call.

## Cost comparison

| Approach | Monthly cost | Reliability |
|---|---|---|
| Vercel Pro (unlocks sub-daily crons) | $20/mo | High — Vercel-managed |
| OpenClaw on OCI hitting endpoints | $0 | Medium — depends on OCI uptime |
| pg_cron inside Supabase | $0 | High — DB-internal |

**Recommended hybrid:**
- `reset-demo` → pg_cron (already done, DB-internal)
- `appointment-reminders`, `drip-runner`, `score-recent-calls`, `rba-anomaly-scan` → OpenClaw
- `connector-probe`, `invite-health` → Vercel cron (daily, allowed on Hobby)

Best of all three worlds. $0/mo.

## To-do for execution

- [ ] Audit each `/api/cron/*` for `CRON_SECRET` bearer support
- [ ] Add the 5 entries to OpenClaw scheduler
- [ ] Verify `CRON_SECRET` env value matches between OpenClaw and Vercel
- [ ] Smoke-test each endpoint manually with the bearer
- [ ] Drop sub-daily entries from vercel.json
- [ ] Push, verify Vercel build succeeds
- [ ] Reload OpenClaw scheduler
- [ ] Watch 24h of logs
- [ ] Document any failures in `audits/OCI_CRON_OBSERVED_2026-05-XX.md`

---

*Status: 2026-05-24. Ready to execute once Ian greenlights the migration.*
