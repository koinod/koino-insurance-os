# RBA Gap Audit — 2026-05-18

**RBA** = Repflow Background Agent. Local daemon on each insurance rep's laptop. Talks to `repflow.koino.capital` (this Vercel app). Polls jobs, executes tools, posts results.

Audit triggered by failed reinstall attempt that exposed a 2½-day silent outage on the device installed 2026-05-15.

---

## 1. The Point (What RBA Is FOR)

### For Reps
The rep's agentic productivity layer. Rep approves; agent does the mechanical work.
- Pulls leads in (Fathom call notes, FB lead forms, IG/LinkedIn inbox)
- Drafts outbound (SMS, email, iMessage via SendBlue)
- Dials (Twilio + MS Phone Link UIA automation)
- Runs carrier quotes (Playwright on carrier portals, headed for capture, headless for quoting)

### For Managers
Visibility + control over downline reps' agents.
- See which reps have agents installed, last-seen, model version (`/api/agent/installs`)
- Approve queued jobs flagged `pending_approval` (sensitive actions: send_real_sms, charge_card, delete_policy, submit_eapp, bulk action ≥10)
- Same dial/draft/browse tools at 2× rep rate limits

### For Owners
Everything managers see + can do, plus:
- Mint install tokens for new devices
- Revoke devices
- Agency-level capability toggles (turn whole tool categories on/off)
- Write to commissions, invites, agency settings

### Security model
- No passwords on agent disk. `agent_token` (chmod 600) is the only secret.
- Connector creds (Twilio, Fathom, LinkedIn cookies, etc.) fetched per-request via `/api/agent/connector-exchange`, never cached.
- No arbitrary shell, no fs writes outside `workspace/`.
- 4-ring gate enforced server-side, repeated client-side: Agency capability → Role permission → Approval policy → Local tool allowlist.

---

## 2. What Capability It Needs to Function as Intended

| Layer | Component | Spec |
|---|---|---|
| **Transport** | Heartbeat | POST `/api/agent/heartbeat` every 60s |
| | Capabilities refresh | GET `/api/agent/capabilities` every 3600s |
| | Job claim | POST `/api/agent/jobs/next` (or `command-claim`) every 3s |
| | Job result | POST `/api/agent/jobs/result` (or `command-complete`) |
| | Audit | POST `/api/agent/audit` (tool, args_hash, result, duration) |
| **Identity** | Install token redeem | One-shot, exchanges for long-lived agent_token + device_id |
| | Token rotation | Web UI button when agent gets 401 — **NOT YET BUILT** |
| | Revoke | POST `/api/agent/revoke` (owner-only) |
| **Roles** | rep / manager / owner / admin | Defined in `api/agent/_lib.js:105-150` |
| **Job lifecycle** | queued → running → succeeded/failed | + `pending_approval` → `queued` (after approve) or `denied` |
| **Tools (17 declared)** | Comms, composition, integration, automation, db | See gap table §4 |
| **Scrapers (14 carriers)** | UHC, Humana, Aetna, Cigna, MoO, Lumico, AIG, FG, Transamerica, Ethos, AmericanAmicable, InstaBrain, Foresters, SBLI | See gap table §5 |
| **Manager UI** | Devices list, approval queue, audit log | Partially shipped — needs verification |
| **Self-heal** | Scheduled task must restart on DNS/network failure | **MISSING — see §6** |

---

## 3. Current State (This Device, 2026-05-18)

- Device `190f7faf-d456-46a1-ab27-89d4126e4763`, agency_id `a073f1cc-f4b4-44e9-8471-173455391e2f`, role `owner`
- Installed 2026-05-15, all 17 tools register on boot
- **Was silently dead 2026-05-16 → 2026-05-18 20:30** because Windows scheduled task is "At logon only" + DNS resolution failed within ~20s of cold-boot wake (WiFi not up). Agent crashed, no restart trigger fired until next login. Logs show same death pattern across May 16/17/18 logins.
- Manually restarted 2026-05-19 02:14 UTC. Heartbeating now. 17 tools loaded. Owner capabilities active.

---

## 4. Tool Implementation Gaps

| Tool | Status | Gap |
|---|---|---|
| `auto_quote` | REAL | depends on scrapers — see §5 |
| `draft_sms` | REAL | — |
| `fathom_pull_notes` | REAL | — |
| `ig_dm_reply` | REAL | — |
| `linkedin_send` | REAL | LinkedIn cookies expire — needs refresh UX |
| `meta_dm_send` | REAL | — |
| `phone_link_dial` | REAL | Windows-only (MS Phone Link UIA), 326 LOC |
| `phone_link_inspect` | REAL | debug-only |
| `sendblue_send` | REAL | — |
| `twilio_dial` | REAL | — |
| `browser_run` | **STUB** | Connector-exchange wired; needs Playwright dispatch logic |
| `create_lead` | **STUB** | Returns `not_implemented`. Should POST to `/api/create-lead`. Critical for lead intake. |
| `draft_email` | **STUB** | Ollama prompt present, never posts. Needs send-via-connector path or queue-for-review. |
| `fb_pull_lead_forms` | **STUB** | No Meta Conversions API call wired. |
| `file_review` | **STUB** | Workspace read + Ollama summarize template only. |
| `linkedin_inbox_scan` | **STUB** | Would need unsanctioned Voyager API (cookie scraping). De-prioritize. |
| `script_review` | **STUB** | Tone/compliance QA placeholder. Low effort to wire — Ollama prompt + post result. |

**7 of 17 tools (41%) are stubs.** The 4 highest-leverage to finish: `create_lead`, `draft_email`, `browser_run`, `script_review`.

---

## 5. Carrier Scraper Gaps

| Carrier | LOC | Status | Gap |
|---|---|---|---|
| UHC | 117 | REAL | public quoter, no login needed |
| Humana | 105 | REAL | producer portal, full form mapping |
| Aetna | 36 | SEMI | login + capture work; quote selectors not mapped |
| Ethos | 28 | SEMI | regex extraction stubbed |
| Cigna, AIG, AmericanAmicable, FG, Foresters, Lumico, SBLI, Transamerica, MoO, InstaBrain | ~30 each | SCAFFOLD | template only, no real selectors |

**10 of 14 carriers (71%) are scaffolds.** Each requires live portal access + headed-inspect run (`python quote_agent.py inspect <carrier>`) + selector mapping. **Cannot be done remotely — requires Ian/rep with carrier credentials in front of the laptop.**

---

## 6. Operational / Reliability Gaps

| Gap | Impact | Fix |
|---|---|---|
| **Scheduled task "At logon only" + no restart-on-failure** | Silent multi-day outages on any DNS/network hiccup at login | Add restart-on-failure (5×, 1 min); add repeating trigger every 5 min (runner.lock prevents double-start). **FIXING IN THIS SESSION.** |
| **Token rotation UI missing** | When agent gets 401, no path back without full reinstall (which burns one-shot install token) | Add "Rotate agent token" button in Settings → Devices |
| **Install token re-use returns 400 with empty body** | Reinstall failures are opaque (today's symptom) | Have `/api/agent/redeem` return explicit `{ error: "token already redeemed" \| "token expired" \| "token not found" }` |
| **Custom SMTP for Supabase auth** | Magic-link rate limit ~3-4/hr — onboarding bottleneck | Wire SendGrid/Resend SMTP in Supabase auth |
| **Cross-sell sweep cron not verified** | Unknown if firing | One-time `vercel logs --filter=/api/cron/cross-sell-sweep` |
| **Bundle self-update path** | `/api/agent/version` poll exists but bundle update untested in prod | Smoke test version bump |

---

## 7. Manager/Owner UI Gaps (Need Verification)

- [ ] Devices page — does it list all agency devices with last_seen + status? Path: `app.koino.capital/settings/devices`
- [ ] Approval queue UI — does manager see pending_approval jobs and can they approve/deny with reason?
- [ ] Audit log viewer — `agent_audit` table populated; UI to read?
- [ ] Capability toggle UI — owner can flip `agency_capabilities.enabled` per kind?
- [ ] Install-token mint button — owner can create a token for a new rep's device?

These need a 30-min web-app walkthrough to confirm. If missing, build order:
1. Devices list (visibility = trust)
2. Approval queue (unblocks sensitive automation)
3. Install-token mint (unblocks onboarding new reps)
4. Audit log viewer
5. Capability toggle UI

---

## 8. Path From Here → There

### Tier 1 — Reliability (this session, <1 hr)
1. ✅ **DONE** — Harden scheduled task: added TimeTrigger every 5 min (in addition to existing AtLogon + RestartOnFailure 999×1min + IgnoreNew). `runner.lock` prevents double-start. Verified via `schtasks /Query`.
2. ✅ **DONE** — Fixed Windows `cp1252` encoding bug in agent.py (loop error every 3s spammed agent.log because `print()` to log file couldn't encode `→`). Added `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` at top of agent.py. Agent now runs clean.
3. Verify cross-sell-sweep cron is firing — **NEXT**
4. Improve `/api/agent/redeem` error messages (return `{ error: "token already redeemed" | "expired" | "not found" }` instead of generic 400) — **NEXT**

### Session log (2026-05-18 → 2026-05-19 04:00 UTC)
- Diagnosed 400 on `/api/agent/redeem` — install token was one-shot, already burned by 2026-05-15 install
- Diagnosed 2½-day silent outage — AtLogon-only trigger + DNS failure within 20s of cold-wake login = unrecovered death
- Restarted agent manually; surfaced second bug (charmap codec) hidden by previous DNS failure mode
- Both reliability bugs fixed. Agent is heartbeating cleanly with 17 tools loaded under role=owner.

### Tier 2 — Tool completion (1-2 days)
4. Implement `create_lead` (POST `/api/create-lead`, payload schema from migration)
5. Implement `draft_email` send path (route via Resend/SES connector OR queue-for-review)
6. Implement `browser_run` dispatch (Playwright via connector-exchange)
7. Implement `script_review` Ollama → post result

### Tier 3 — Carrier scraper mapping (1-2 weeks, requires live portal access)
8. Aetna quote selectors (finish the 80% done)
9. Ethos selectors
10. Top-priority remaining 10 carriers in order of Ian's actual book (TBD — need rep input)

### Tier 4 — Manager UX (3-5 days)
11. Confirm + build Devices page
12. Confirm + build Approval queue
13. Token rotation UI
14. Install-token mint UI
15. Audit log viewer

### Tier 5 — Infrastructure (1 day)
16. Custom SMTP for Supabase auth (kill 3/hr magic-link cap)
17. Receipt upload vault integration
18. Revenue events stream (event table + endpoints)

---

## Key References

- Server: `/mnt/c/Users/PLATINUM/KOINO/projects/koino-insurance-os/`
- Local agent: `/mnt/c/Users/PLATINUM/.repflow/agent/`
- Role matrix: `api/agent/_lib.js:105-150`
- Job lifecycle: `api/agent/jobs/{next,result,approve,enqueue}.js`
- Migrations: `supabase/migrations/0026_agent_platform_capabilities.sql`
- LEARNINGS doc (related): `koino-insurance-os/LEARNINGS.md`
