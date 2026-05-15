# RBA real install + product workflow E2E test — 2026-05-15 v3

This is the test you actually asked for. v1 (PowerShell-as-agent) was
theater. This run installed the real Python agent on PLATINUM, watched
it claim and execute commands posted into the queue, and verified the
results both in the database AND visually in the production Repflow UI.

## ✅ Verified in production

| Layer | Evidence |
|---|---|
| Real install (Python venv + Scheduled Task auto-restart) | PID 23936 running from `C:\Users\PLATINUM\.repflow\agent\venv\Scripts\python.exe`, Scheduled Task `RepflowAgent` registered |
| Agent token spine | device_id `190f7faf-d456-46a1-ab27-89d4126e4763`, role owner, agency KOINO IMO |
| Capability ledger fetch | `caps_refresh` succeeded, returned full owner-tier capabilities |
| Heartbeat | `/api/agent/heartbeat` returns 200, last_seen_at updates |
| Command claim/complete loop | All 6 commands posted via SQL got claimed within 3-5s, completed with results in rba_commands.result |
| Audit | rba_audit table has rows for every tool call |
| Auto-update | bumped BUNDLE_VERSION 0.2.0 → 0.2.1, agent re-loaded tool registry on restart (now sees `create_lead`) |
| Real LLM tool — `draft_sms` | llama3.2:1b generated: *"Hi Sarah, hope you're doing well. I wanted to follow up on your interest in term life insurance. Can we disc..."* (11.6s) |
| Real LLM tool — `script_review` | llama3.2:1b critique: *"* The script starts with an informal greeting and introduction, which may not be suitable for a professional sales setting. * There is..."* (46s) |
| Real DB write — `create_lead` | Real row in `public.pipeline`: id `05703aa5-1726-46d8-9b6e-ee5d4d1e4513`, "Maria Reyes — Agent E2E v2", TX, age 42, whole_life, $2,400 AP, source `agent_e2e`, owner Ian, agency KOINO IMO. **Visible in CRM page.** |
| Real confirmation flow — `draft_sms` w/ `auto_send=true` | Confirmation row landed (id `a13fbbb0-d533-4813-b181-5db872a18fd8`), description: *"Send SMS to Test User: Hi again, we're following up on your interest in a whole life insurance policy for $500k. Can you please confirm if this is something you'd like to move forward"*, channel=any, expires in 5 min. **Global ConfirmationsModal visible in browser top-right** with Approve/Deny buttons. |
| Realtime subscription | The confirmation modal appeared via Supabase realtime subscription (no page refresh) |

## ⚠️ Verified but with caveat

| Layer | What works | What doesn't |
|---|---|---|
| SMS confirmation outbound to +19312522222 | `agent_settings.config.confirm_sms_number` set; `fanoutSmsConfirmation` function executes | **No SMS arrived at +19312522222** because Vercel has no `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_CALLER_ID` env vars set. Confirmed via `vercel env ls`. The function silently no-ops when both rep-vault Twilio AND platform Twilio creds are absent. To get SMS working: either connect Twilio via Settings → Connectors UI, or set the three env vars in Vercel and redeploy. |
| Phone Link routing | Not wired tonight | The Bluetooth/Phone Link tool was never built — `bluetooth_phone` is in connector_vault provider list but the routing code is a follow-on. For now SMS goes via Twilio path only. |
| `auto_quote` tool | Tool loaded in registry, agent ready | Not tested tonight — needs at least one carrier session captured (would require running headed Playwright capture per carrier on this machine). Pure agent-runtime path is verified by the other tools that completed. |
| `twilio_dial`, `sendblue_send`, `linkedin_send`, `meta_dm_send`, `fb_pull_lead_forms`, `ig_dm_reply`, `fathom_pull_notes`, `browser_run`, `file_review`, `draft_email` | All in tool registry, capability-gated, ready to run | Not exercised tonight — each requires its connector configured (Twilio/SendBlue/Fathom/etc.). The `connector-exchange` endpoint is wired and would return creds the moment you Connect each one. |

## The five failure modes I hit (and now codified in `verify-before-acting` skill)

1. **Schema-by-imagination** — wrote `0030` assuming greenfield; existing rba_audit had `occurred_at` not `created_at`. Adapted by querying `information_schema` first.
2. **Push ≠ deploy** — pushed twice while Vercel was failing on a backtick parse error, no new deploy fired. Caught only by `vercel ls`.
3. **Cron limit** — Hobby plan rejected `*/15` and `0 */6` schedules. Collapsed to daily.
4. **PowerShell venv pip** — `pip.exe` in a Windows venv refuses self-upgrade; needed `python -m pip`.
5. **Hardcoded localhost port** — agent tools hardcoded `127.0.0.1:11434` but the user's Ollama runs on `11435`. Fixed by reading `ctx.cfg.ollama_url`.

These are now in `~/.claude/skills/verify-before-acting/SKILL.md` (and a copy on Desktop). The skill is registered and visible in the skill list as `verify-before-acting`. It documents the 5 patterns + the pre-action probe checklist + the fidelity audit rubric.

## Commits this session

```
3dd7c9d Merge: lead-create consent fix
a309a15 fix(rba): map consent values to pipeline CHECK (verbal→pending)
15c8773 Merge: create_lead + ollama_url config
604167a fix(install.ps1): use 'python -m pip' + ErrorAction Continue
e50a870 Merge: E2E test handoff doc
```

## DB-side changes applied via Supabase MCP

1. `rba_commands_vault_rpcs_v4` migration — created the 5 missing RBA tables + 7 missing RPCs. The earlier May 11 partial install (3 tables only) is now complete.
2. `agent_settings` table created + Ian's row inserted with `confirm_sms_number = +19312522222`, `high_risk_channel = sms`.
3. `rba_commands_kind_check` constraint extended with `create_lead`, `update_lead`, `create_appointment`.
4. `rba_audit` and `rba_installs` added to `supabase_realtime` publication.

## What you can do when you wake up

1. **Open Repflow → CRM**. The Maria Reyes lead the agent created is the first row.
2. **Click any page**. The pending SMS confirmation modal appears top-right (until it expires — 5 min from creation; will be expired by morning, but you can fire a fresh one).
3. **Open Settings → Agents** to see the device. Heartbeat will be live (Scheduled Task auto-restarts the agent at every logon).
4. **Manual command tester** at the bottom of Admin → Devices. Try kind=`script_review` with payload `{"script_text":"<your real script>","focus":"all"}`. Real critique back in 30-60s.
5. **To get SMS confirmations actually sending** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CALLER_ID` in Vercel → Settings → Environment Variables, then redeploy. OR go to Settings → Agents → Twilio → Connect, paste your account_sid + auth_token + phone numbers.
6. **Revoke the test device** when you don't want it heartbeating: Admin → Devices → `190f7faf...` → Revoke. Or stop the Scheduled Task: `Stop-ScheduledTask -TaskName RepflowAgent; Disable-ScheduledTask -TaskName RepflowAgent`.

— Dispatch
