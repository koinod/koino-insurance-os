# PRD — Role-Based Agents (RBA)

> Local agents that run on each Koino user's machine, scoped by their
> role (rep / manager / owner / admin / super_admin), one-click installed,
> centrally observable, instantly revocable.

Owner: Ian · Status: draft · Last updated: 2026-05-14

---

## 1 · Why this exists

Reps, managers, and owners all need software that does work on their behalf
locally — drive carrier portals (Auto Quoter), draft outbound, dial Twilio,
record calls, read clipboards into the right field, run small models offline.
The web app can't do any of that — it's sandboxed. A locally-installed agent
can, but only if it's:

1. **Trivial to install** — copy-paste one curl command, no Python knowledge.
2. **Role-scoped** — a rep's agent can do less than a manager's, less than
   an owner's. Capabilities live server-side; pulled fresh every hour;
   revoking a tool from a role takes effect on the next refresh, no redeploy.
3. **Centrally observable** — every install + every tool call is visible in
   the Admin panel. Every install can be revoked from the same panel.
4. **Self-cleaning when revoked** — a revoked agent's next heartbeat returns
   401, agent wipes its config and exits.

Today we have most of the surface area built (`api/agent/*`, `agent/quote_agent.py`,
`api/agent/install.sh.js`) but the pieces don't yet line up: there are **two
parallel `rba_installs` schemas** in flight (one in `api/agent/_lib.js`, one in
`page-extras.jsx`), there's **no migration** creating either, and the autoquoter
agent uses its own poll-based job spine that doesn't share the RBA token model.
This PRD reconciles them.

## 2 · Roles → capabilities

The capability ledger already lives at `api/agent/_lib.js → CAPABILITIES`.
This PRD makes it the source of truth and extends it.

| Capability domain | rep | manager | owner | admin (IMO) | super_admin |
| --- | --- | --- | --- | --- | --- |
| **DB · own pipeline** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **DB · downline pipeline** | — | downline only | full agency | cross-agency within IMO | all agencies |
| **DB · write commissions** | — | — | ✓ | ✓ | ✓ |
| **DB · write invites / settings** | — | — | ✓ | ✓ | ✓ |
| **Local · Twilio dial (own number)** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Local · draft email/SMS** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Local · browser carrier portal** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Local · browser any URL** | — | ✓ | ✓ | ✓ | ✓ |
| **Local · record system audio** | calls only | calls only | ✓ | ✓ | ✓ |
| **Local · read clipboard** | with prompt | ✓ | ✓ | ✓ | ✓ |
| **Local · open URL** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Local · arbitrary shell** | — | — | — | — | — *(never; see §10)* |
| **Local · fs outside `~/.repflow/agent/workspace`** | — | — | — | — | — |
| **Rate · dials/hr** | 120 | 240 | 600 | 1,200 | unlimited |
| **Rate · drafts/hr** | 60 | 120 | 600 | 1,200 | unlimited |
| **Rate · browser runs/hr** | 30 | 60 | 240 | 600 | unlimited |
| **Confirm-required actions** | — | — | real SMS, charge card, delete policy, bulk≥10 | + switch into agency | all owner+admin items |

**Carrier-recommend integration (new):** every role's agent gets
`auto_quoter` capability when `rba_installs.role IN ('rep','manager','owner')`,
which means the agent calls `/api/carrier-recommend` first and quotes the
returned shortlist. Admin/super_admin agents do NOT auto-quote on behalf of
others (they observe; they don't impersonate).

## 3 · Local architecture

```
~/.repflow/agent/                    (chmod 700)
├── config.yaml                      (chmod 600 — agent_token, role, urls)
├── install.log                      (last install run, debug)
├── ollama.log                       (local LLM stdout)
├── heartbeat.sh                     (60s cron; calls /api/agent/heartbeat)
├── workspace/                       (only path the agent may write outside config)
│   ├── drafts/                      (email/SMS drafts before send)
│   ├── recordings/                  (call audio if recording enabled)
│   └── browser-state/<carrier>/     (Playwright storage_state per carrier)
├── tools/                           (shipped tool implementations)
│   ├── twilio_dial.py
│   ├── draft_email.py
│   ├── draft_sms.py
│   ├── browser_run.py               (wraps Playwright + carrier scrapers)
│   ├── carrier_recommend.py         (calls /api/carrier-recommend)
│   ├── record_audio.py
│   └── clipboard_read.py
├── scrapers/                        (per-carrier Playwright modules; today
│   │                                 already at `agent/scrapers/`)
│   └── ...
└── runtime/
    ├── agent.py                     (main loop — one process per role)
    ├── capability_cache.json        (last /api/agent/capabilities response)
    └── rate_limits.json             (rolling-window counters)
```

**Why this layout:**
- `config.yaml` is the only root-level secret. Single chmod 600 file means
  one rule to remember when reviewing what to back up vs. exclude from sync.
- `workspace/` is the only writable path outside config. Tools that try to
  write elsewhere are denied at the wrapper layer (defense in depth — the
  capability ledger's `fs_outside_workspace: false` is enforced by
  `runtime/agent.py` not by the OS).
- `tools/` separated from `scrapers/` because tools are role-gated (a rep's
  agent has no `record_audio.py` symlinked); scrapers are universal.
- `runtime/capability_cache.json` is what the agent reads on every tool
  call. Refreshed hourly via `/api/agent/capabilities`. If refresh fails for
  >24h the agent enters degraded mode (read-only) and posts a `degraded`
  status to heartbeat.

**Process model:**
- One persistent Python process per install (managed by launchd / systemd-user / Windows scheduled task).
- Process owns the Ollama connection, the cached capability ledger, and a
  Playwright browser pool reused across calls.
- Heartbeat cron is a separate one-shot script — it works even if the main
  process is wedged. The web UI shows "agent process is up" only when both
  heartbeat AND a recent tool call land in `rba_audit`.

**Local LLM tier (per device RAM probe):**
- ≥8GB RAM → pull `qwen2.5:1.5b` (fast) + `qwen2.5:3b` (smart).
- <8GB RAM → fast only; smart routes to cloud via Vercel-side router using
  the rep's user JWT (subject to per-role rate limits).
- Per-user fast/smart preference stored on `agency_members.config_json.agent_mode`
  (already implemented at `api/agent/model-pref.js`).

**OS coverage:**
- macOS — launchd plist (working today).
- Linux — systemd-user timer (working today).
- Windows — scheduled task via `install.ps1` (TODO — see §9 ship-list).

## 4 · Connection points

The agent makes HTTP calls; nothing inbound, no open ports.

| Direction | Endpoint | Auth | Cadence |
|---|---|---|---|
| ↑ install | `POST /api/agent/redeem` | one-shot install token | once at install |
| ↑ heartbeat | `POST /api/agent/heartbeat` | x-agent-token | every 60s |
| ↑ refresh caps | `GET /api/agent/capabilities` | x-agent-token | every 1h + at startup |
| ↑ tool audit | `POST /api/agent/audit` | x-agent-token | per tool call |
| ↑ carrier rec | `POST /api/carrier-recommend` | x-agent-token (NEW — accept token) | per quote |
| ↑ poll quote jobs | `GET /rest/v1/auto_quote_requests?...` | supabase anon (today) → x-agent-token (planned) | every 3s when active |
| ↓ Ollama | `http://127.0.0.1:11434` | local | per inference |

**Token flow:**
1. User clicks **Install agent** in web UI.
2. Web UI calls `POST /api/agent/install-token` with their JWT → returns
   one-shot token (5-min TTL, single-use), bound to the user's highest-priority
   active membership and the role they selected.
3. UI shows a copyable curl one-liner with the token templated in.
4. User pastes into terminal. `install.sh` redeems the token at
   `POST /api/agent/redeem` with hostname/os/cpu/ram/version/models →
   gets back long-lived `agent_token` + `device_id` + role + agency_id.
5. From then on, every agent → server call sends `x-agent-token: …`.
6. Agent never holds the user's JWT. Agent token is opaque, scoped to one
   device, revocable independently.

## 5 · Database schema (consolidation)

There are **two** in-flight schemas for `rba_installs`. This PRD picks one
and writes the migration that creates it.

**Source of truth (matches `api/agent/_lib.js`):**

```sql
create table public.rba_installs (
  device_id        uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  agency_id        uuid not null references public.agencies(id) on delete cascade,
  role             text not null check (role in ('rep','manager','owner','admin','super_admin')),
  hostname         text,
  os               text,
  cpu              text,
  ram_gb           int,
  version          text,
  models_local     text[] default '{}',
  agent_token      text not null unique,         -- opaque, 32 bytes hex
  status           text not null default 'active'
                   check (status in ('active','revoked','degraded')),
  installed_at     timestamptz not null default now(),
  last_seen_at     timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references auth.users(id),
  notes            text
);

create index rba_installs_user_idx    on public.rba_installs (user_id);
create index rba_installs_agency_idx  on public.rba_installs (agency_id, status);
create index rba_installs_lastseen_idx on public.rba_installs (last_seen_at desc);

create table public.rba_install_tokens (
  token        text primary key,                  -- 32 bytes hex, single use
  user_id      uuid not null references auth.users(id) on delete cascade,
  agency_id    uuid not null references public.agencies(id) on delete cascade,
  role         text not null,
  expires_at   timestamptz not null,              -- now() + 5min
  redeemed_at  timestamptz,
  redeemed_device_id uuid references public.rba_installs(device_id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.rba_audit (
  id          bigserial primary key,
  device_id   uuid not null references public.rba_installs(device_id) on delete cascade,
  user_id     uuid not null,
  agency_id   uuid not null,
  tool        text not null,
  args_hash   text,                                -- sha256(canonicalized args), no PII
  result      text not null check (result in ('ok','denied','error')),
  detail      text,                                -- ≤ 1000 chars; sanitized
  created_at  timestamptz not null default now()
);
create index rba_audit_device_time_idx on public.rba_audit (device_id, created_at desc);
create index rba_audit_agency_time_idx on public.rba_audit (agency_id, created_at desc);
```

**RPCs (SECURITY DEFINER):**
- `rba_issue_install_token(p_role) → (token, expires_at, role, agency_id)`
  — caller's JWT determines user_id; `p_role` must be ≤ caller's effective
  role; inserts `rba_install_tokens` row.
- `rba_redeem_install_token(p_token, p_hostname, p_os, p_cpu, p_ram_gb, p_version, p_models)
  → (device_id, agent_token, agency_id, role)` — anon-callable; validates
  unredeemed + unexpired; generates `agent_token`; inserts `rba_installs`;
  marks token redeemed.
- `rba_revoke_install(p_device_id) → bool` — caller's JWT must be owner/admin
  of the device's agency OR super_admin OR the device's own user_id; sets
  `status = 'revoked'`.

**RLS:**
- `rba_installs` — rep sees own; manager sees downline; owner sees agency;
  admin sees IMO; super_admin sees all.
- `rba_install_tokens` — only `rba_redeem_install_token` reads it
  (SECURITY DEFINER); no direct SELECT policy.
- `rba_audit` — same scoping as `rba_installs`. Insert restricted to
  service_role (only `/api/agent/audit` writes).

**The competing schema in `page-extras.jsx`** (`agency_id, agent_key,
status, installed_at` keyed by `(agency_id, agent_key)`) was an earlier
sketch. Migrate the page-extras code to the schema above; remove the
upsert-by-(agency_id, agent_key) path.

## 6 · One-click install

Three install commands; user picks based on their OS. UI generates the
correct command after they click **Install agent**.

```bash
# macOS / Linux
curl -fsSL https://os.koino.capital/api/agent/install.sh?token=XXXX | bash

# Windows (PowerShell)
iwr -useb https://os.koino.capital/api/agent/install.ps1?token=XXXX | iex

# Docker (any OS — for shared agents on a single workstation)
docker run -d --name repflow-agent \
  -e RBA_TOKEN=XXXX \
  -v ~/.repflow/agent:/agent \
  ghcr.io/koinod/repflow-agent:latest
```

The token in the URL is short-lived (5 min) — if the user copies the curl
later it errors and tells them to click Install again. **Never email** the
URL: short TTL means it's safe to expose in the UI but unsafe to persist.

`install.sh` (already shipped at `api/agent/install.sh.js`) does:
1. Probe OS, CPU, RAM.
2. Install Ollama if missing; start it.
3. Pull `qwen2.5:1.5b` (always) + `qwen2.5:3b` (if RAM ≥ 8GB).
4. Redeem token → write `~/.repflow/agent/config.yaml` (chmod 600).
5. Write `heartbeat.sh` + register systemd timer / launchd plist / scheduled task.
6. Send first heartbeat. Print device_id + workspace path + revoke instructions.

**Idempotency:** running install.sh twice on the same machine should detect
the existing config, hit `/api/agent/heartbeat` to confirm token is still
valid, and skip the redeem step. If the prior token is revoked, it should
prompt the user to issue a fresh install token from the web UI.

**To-do (not yet shipped):**
- `api/agent/install.ps1.js` — Windows PowerShell mirror.
- `Dockerfile` + GHCR publish — for the shared-workstation case.
- `agent.py` runtime (the missing piece — today only `quote_agent.py` exists,
  which is a single-purpose subset).

## 7 · Admin observability + control

A new tab **Devices** in the super-admin Admin panel (`page-admin.jsx`).
Owners + admins see the same view scoped to their tenancy.

**Devices list (top panel):**

| Column | Source |
|---|---|
| User · email | `auth.users.email` join |
| Role | `rba_installs.role` |
| Hostname · OS · RAM | `rba_installs.hostname/os/ram_gb` |
| Models | `rba_installs.models_local[]` |
| Version | `rba_installs.version` |
| Status | `active` (green) · `degraded` (yellow) · `revoked` (gray) |
| Heartbeat | relative time of `last_seen_at` ("12s ago" / "2h ago" / "stale 4d") |
| Calls (24h) | count of `rba_audit` rows in last 24h, badge color by error rate |
| Actions | **Revoke** · **View tools** · **Tail audit** |

**Per-device drawer:**
- **Capabilities** — read-only render of the role's CAPABILITIES ledger
  with the timestamp from the agent's last `/api/agent/capabilities` fetch.
  Shows what was actually shipped to the device, not what the role currently
  says (so you can detect drift if the role got tightened but the agent
  hasn't refreshed yet).
- **Live audit tail** — Supabase realtime subscription on `rba_audit` filtered
  by `device_id`. Shows tool, result (ok/denied/error), detail (truncated),
  duration. Real-time toggle on/off so it doesn't burn quota when you walk away.
- **Heartbeat history** — sparkline of `last_seen_at` deltas over 24h.
- **Action buttons:**
  - **Revoke** (owner+) — sets `status='revoked'`. Agent self-wipes on next heartbeat.
  - **Force capability refresh** — bumps a `version` counter; agent picks it up next call.
  - **Switch to fast/smart model** (super_admin) — overrides user's
    `agent_mode` for one device.
  - **Quarantine** (super_admin) — special status that lets agent post
    audit + heartbeat but denies every tool call. For incident response.

**Audit-wide search (separate panel):**
- Filter by user / agency / device / tool / result / time range.
- Surfaced anomalies (auto-flagged, no LLM cost):
  - Same agent calling `dial_twilio` >2× the role's rate limit.
  - Spike in `result='denied'` on one device (suggests agent drift).
  - `record_system_audio` outside an active call window (rep role only).
  - Heartbeat stale >24h on an `active` install.

**Realtime architecture:**
- Supabase Realtime publication includes `rba_installs` and `rba_audit`.
- Admin page subscribes only when the Devices tab is open.
- Audit drawer subscribes only when expanded — collapse = unsubscribe.

## 8 · Debugging from admin

Three primitives, in order of escalation:

1. **Tail audit (read-only).** Already covered above. Resolves "is the
   agent calling things at all?" and "are calls being denied?"
2. **Run-as-this-device synthetic probe (super_admin only).** Admin clicks
   **Probe** on a device → server calls `POST /api/agent/probe` which
   issues a one-shot synthetic command (`tool: "ping"`, `args: {echo: "...uuid..."}`).
   The agent receives it via a small websocket-ish channel (Supabase realtime
   on `rba_commands`), executes, posts an audit row + a probe-response row.
   Admin sees latency + result. This is the only inbound primitive — it never
   sends arbitrary shell, only a fixed allowlist (`ping`, `caps_refresh`,
   `models_list`, `clear_workspace`). All probes audited just like tool calls.
3. **Pull diagnostic bundle (super_admin only, requires user re-consent).**
   Admin opens drawer → **Request diagnostics**. User sees a system notification
   on their device, clicks Allow. Agent uploads (over multipart to
   `POST /api/agent/diagnostics`) the last 1MB of `install.log`,
   `capability_cache.json`, `rate_limits.json`, sanitized recent audit. NEVER
   ships `config.yaml` (contains the agent_token) or workspace contents.
   Bundle stored in `rba_diagnostics` (jsonb), retention 14 days.

## 9 · Ship-list (engineering debrief)

Ordered. Each has a clear definition of done.

| # | Task | DoD |
|---|---|---|
| 1 | Migration `0030_rba_installs.sql` | tables + RPCs + RLS land; `api/agent/*` works against real schema |
| 2 | Refactor `page-extras.jsx` device UI to new schema | upsert-by-`(agency_id, agent_key)` removed; uses `device_id` |
| 3 | Build `agent/runtime/agent.py` (the missing main loop) | starts, heartbeats, fetches caps, dispatches one tool, audits |
| 4 | Tool wrappers (`tools/*.py`) | each enforces capability ledger, posts `rba_audit`, respects rate limits |
| 5 | Carrier-recommend integration | `tools/carrier_recommend.py` calls API with x-agent-token; quote_agent reuses it |
| 6 | Windows installer `api/agent/install.ps1.js` | one-line iwr command works; scheduled task registered |
| 7 | Docker image + GHCR publish | `ghcr.io/koinod/repflow-agent:latest` ships, `docker run` works |
| 8 | Admin Devices tab | list + drawer + revoke + audit tail + capability snapshot |
| 9 | Probe channel (`rba_commands` table + realtime) | super_admin Probe button returns latency + result |
| 10 | Diagnostic bundle endpoint + UI consent flow | OS-native consent prompt; bundle uploads; super_admin can download |
| 11 | Anomaly auto-flags | rate spikes, deny spikes, stale heartbeats, off-call recording surface in admin |
| 12 | Auto-update | agent checks `/api/agent/version`; pulls new tools/* without re-install if signature matches |

## 10 · Hard rules + red lines

- **No arbitrary shell from any role, ever.** If the agent needs to do
  something we don't already have a tool for, we ship a new tool — we do
  not expose `bash`. This is the single most-important rule; everything
  downstream depends on it.
- **No filesystem writes outside `~/.repflow/agent/workspace/`** unless
  they're the install logs in the agent root. Reads outside workspace are
  also denied except for OS metadata (`uname`, `sysctl hw.memsize`,
  `/proc/meminfo`).
- **No agent-side storage of user passwords or carrier credentials.** The
  Auto Quoter precedent stands: producer credentials live in the rep's
  workspace at `browser-state/<carrier>/storage.json`, never in the DB,
  never echoed in audit detail.
- **`config.yaml` is the only file that holds the `agent_token`.** chmod
  600. Diagnostic bundles never ship it.
- **Revocation is one-way.** A revoked device cannot be un-revoked; the
  user re-runs install.sh to get a new device_id + agent_token.
- **Per-role confirm-required actions are enforced server-side**, not just
  client-side. The web app's "Are you sure?" modal is UX; the API endpoint
  for `delete_policy` independently checks that the request includes a
  user-confirmed nonce. Agents never bypass this — the agent calls the
  same API the human would.
- **The agent process never opens an inbound port.** All comms are HTTPS
  outbound. The probe channel is a Supabase realtime subscription, which
  the agent initiates.

## 11 · Verification (how we'll know it works end-to-end)

1. Brand-new MacBook with no Ollama, no Python: copy-paste the curl
   one-liner from web UI, watch install finish in <2 min, see device
   appear in admin Devices tab with all metadata, heartbeat green, capability
   ledger snapshot rendered.
2. From a manager account, run a Twilio dial via the agent — see audit row
   appear in admin in <1s.
3. Tighten the `rep` capability ledger to remove `dial_twilio`. Within ≤1h,
   that rep's agent attempts a dial → result `denied` shows up in audit.
4. From super_admin, click **Revoke** on the rep's device. Within 60s, the
   agent's heartbeat returns 401, agent self-wipes config, status flips to
   `revoked` in admin.
5. Stop the agent process for >24h. Admin's anomaly flag fires; the device
   row chips red.
6. From super_admin, click **Probe → ping** on a device. Latency + result
   land in <2s.
7. Issue a diagnostic-bundle request → user gets OS notification → clicks
   Allow → bundle visible in admin within 30s. Confirm `config.yaml` and
   `workspace/` are NOT in the bundle.

## 12 · Open questions (answer before shipping)

1. **Probe channel transport** — Supabase realtime is fine for the read
   path (admin watches audit). For inbound probe commands, do we want
   realtime (cheap, but agent must keep WS open) or short-poll (simpler,
   higher latency)? Default: realtime since the agent already polls
   `auto_quote_requests` and we'd consolidate the spine.
2. **Auto-update signing** — pull tool updates without re-install (#12 in
   ship list) requires a signing model. Sign tools with our existing
   Vercel deploy key? Separate keypair? Decide before #12.
3. **Diagnostic-bundle retention** — 14d default; some compliance regimes
   require longer for IMO admins. Add a `org_settings.rba_diagnostic_retention_days`
   knob.
4. **Rate-limit enforcement layer** — local `rate_limits.json` is the fast
   path but trustless. Add server-side rolling-window check in
   `/api/agent/audit` so a tampered local agent gets denied at the API
   boundary too. Cost: one extra read per audit write. Worth it.
