# Repflow Product V2 — PRD

**Date:** 2026-06-13 · **Author:** Dispatch (Claude) · **Status:** Phase 0 — awaiting Ian's green-light
**Live:** https://repflow.koino.capital · **Repo:** `koinod/koino-insurance-os` @ `main`
**Supabase:** `jfphwmzwteermalzwojp` · **Deploy:** Vercel auto from `main`

Three pillars gate every decision in this doc:
- **Simplicity** — rep opens the app and knows the next action without thinking.
- **Functionality** — every screen does irreversible-positive work (money moved, lead advanced, call coached), not "view a number."
- **Moat** — every feature widens the gap to AgencyZoom / HubSpot / the next AI-first competitor.

A transform that fails any one pillar doesn't ship in V2.

---

## 1. Today's state — honest, not marketing

### What's actually built (verified against source, not the vault's narrative)

Repflow is a single-page React app, **no bundler** — 48 top-level `page-*.jsx` files each transpiled to `dist/*.js` and wired by `window.*` globals (`shared.jsx` NAV, `window.RateEngine`, `window.me()`). It's a real, multi-tenant (RLS by `agency_id`) insurance-sales OS, not a prototype. The depth is genuine:

- **Telephony stack** — Twilio voice + power/parallel dialer (`services/power-dialer/`, `page-power-dialer.jsx`), live transcription via Deepgram (`page-transcriber.jsx`, `/api/transcribe`), call recording + scoring (`api/cron/score-recent-calls.js`).
- **CRM + pipeline** — `pipeline` table, kanban + dense list (`page-pipeline.jsx`), lead-vendor attribution → ROI (`page-attribution.jsx`, commit `9aa9263`).
- **Commissions + money** — `carrier_deposits` ledger, `commissions`, P&L host (`page-pnl.jsx`), deposit allocation (`page-deposits.jsx`). Manual-entry today, no auto-derive.
- **Carrier underwriting data** — `product_underwriting_rules`: **171 approved rules, 28 products, ~14 carriers, 100% with `source_url` + `source_quote`** (migrations `0058`–`0060`). This is real, citable UW depth — rare.
- **Role-Based Agent (RBA)** — local Playwright daemon (`agent/quote_agent.py`) logs into carrier portals, runs live quotes, writes `auto_quote_results`; `rba_installs` / `rba_commands` / `rba_action_confirmations` spine; saved rate-path maps so the agent replays recorded selectors (commit `82dba3f`); super_admin device diagnostics (migration `0074`).
- **AI copilot** — `ai-sidebar.jsx` right-rail: chat (`/api/copilot.js`, 21KB, route-aware + 3-turn memory), role-gated one-tap actions (`AGENT_ACTIONS`), realtime `rba_commands` job feed. Cmd+J to open.
- **Licensing module** — per-state exam prep + tutor (`page-licensing.jsx`, 51 states, 156 cited courses).

### The honest problems

1. **Surface sprawl.** 48 page surfaces. A rep's sidebar has 8 items; manager 11; owner 13. There are **redundant clusters**: `page-queue` vs `page-floor` (live mode), `page-crm` vs `page-pipeline`, four super_admin shells (`page-admin`, `page-admin-hub`, `page-platform-admin`, `page-platform`), and host-wrapper duplication (`page-book-host`, `page-vault-host`). Sprawl is the enemy of pillar 1.

2. **The AI is reactive, not proactive.** The copilot is excellent *if the rep opens it and clicks*. It never tells you what to do. The brief's whole thesis — "an AI agent that actually helps them, proactively" — is **not built**. The intelligence to power it largely *is*: `score-recent-calls`, `score-reps`, `cross-sell-sweep`, `manager-inactivity`, `rba-anomaly-scan`, `appointment-reminders`, `drip-runner` all exist as `api/cron/*` jobs. **They run, score, and detect — but their output never fuses into a single ranked "here's your #1" surface.** `page-today.jsx`'s hero is a static "Start the day with a dial." The engine exists; the dashboard for it does not.

3. **"View a number" screens.** Several surfaces show state without offering the next action (leaderboard, parts of P&L). Pillar 2 violation.

4. **Multi-tenancy was flagged broken** in `KOINO_STATE.md` (2026-05-13) and has had heavy work since — **must be re-verified before we sell seats to a second agency.** (See Decisions §8.)

5. **Hobby-plan cron ceiling.** Vercel Hobby allows only once-daily crons. The proactive engine can't poll sub-daily via Vercel cron — it must compute on page-load + Supabase realtime, or move to an external poller (the RBA local agents already poll). This is an architecture constraint, not a blocker.

---

## 2. Customer journey — today vs target

### Solo rep → first team lead

| | **Today** | **Target V2** |
|---|---|---|
| **Week 1** | Onboards, NIPR verify, stares at a 47-lead queue, dials. App shows a static "start dialing" hero. | Opens app → **Daily Brief** names the single highest-EV lead to call first and why (fresh + in-state + product fit). One tap → dialing. |
| **Week 12** | Has a pipeline. Manually remembers who to follow up. Forgets stalling deals. No coaching unless a manager listens to calls. | Agent surfaces 3 stalling deals + a revive script each morning; auto-drafts follow-ups; post-call coaching card appears within minutes of hang-up (objection missed, next best line). |
| **Week 26** | If they recruit, they're back to spreadsheets to manage downline. No leverage. | Agent runs the recruiting playbook: surfaces which recruit needs attention, drafts the check-in, shows the new rep's first-week scorecard. Rep becomes a manager **inside Repflow**, not despite it. |

### Agency owner $100K/mo → $1M–5M/mo

| | **Today** | **Target V2** |
|---|---|---|
| **Week 1** | Owns the agency, drowns in operational drag: chasing reps, reconciling commissions by hand, no early warning on stalling reps. | Daily Brief leads with the **commission leak** ($X in deposits unallocated / under-paid) and the **one rep going cold** — each with a one-tap fix. |
| **Week 12** | Lead spend is a guess. ROAS unclear per vendor. AI does ~0% of ops. | Agentic ad-ops + lead routing: agent flags which lead vendor is burning money (attribution already tracks this) and routes fresh leads to the rep most likely to close them. ~60% of ops drag (follow-up drafting, call review, compliance pre-check, reconciliation prompts) handled by the agent. |
| **Week 26** | Growth = hire more people + hope. | The OS *is* the scaling system: every new rep onboards into the same playbook, the agent enforces it, the owner sees one ranked action list instead of 11 dashboards. $1M/mo is an operations problem the software solves, not a hiring gamble. |

---

## 3. Proactive AI agent — surface design

**Not a chatbot. A morning command surface + ambient nudges.** Build it on what exists: the `api/cron/*` scorers feed it; the `ai-sidebar` copilot + `rba_commands` queue execute its one-tap actions; `/api/copilot` drafts its language.

### The surface: "Daily Brief" (replaces the static `page-today` hero)

A single ranked stack of **signal cards**. Each card is one decision with one primary action. Persona-filtered:

- **Rep:** ① call this lead first (highest EV) · ② these 2 deals are stalling → revive script (one tap to send) · ③ your last call — you missed the price objection, here's the line · ④ 3 follow-ups drafted, approve to send.
- **Owner/manager:** ① $X commission unallocated (one tap → deposits) · ② Rep Y hasn't dialed in 2 days · ③ Vendor Z's ROAS is negative this month → pause? · ④ compliance: 2 apps pending SOA before submit.
- **Ian / super_admin:** system health ping — RBA device offline, anomaly scan hit, deploy/webhook failing.

### Data flow (build on existing wiring)

```
api/cron/*  ──writes──▶  agent_signals (new table: type, persona, entity_ref,
(scorers)                 score, title, action_kind, payload, dedupe_key, expires_at)
                              │
                   /api/brief (edge fn) ──ranks + persona-filters + caps──▶ Daily Brief UI
                              │                                                    │
                   one-tap action ──enqueue──▶ rba_commands / drip / /api/copilot draft
```

Schema is shape-only (per house rule: no business data in migrations). Ranking logic lives in the edge fn, not the table. `agent_signals` writes are idempotent on `dedupe_key`.

### Anti-notification-spam (hard requirements)

- **One #1.** Exactly one hero card. Everything else is a short ranked list, default-collapsed past 4.
- **No card without an action.** If there's nothing to *do*, there's no card.
- **Decay + dedupe.** `expires_at` + `dedupe_key` so the same stalling deal doesn't re-nag daily; it escalates tone, doesn't multiply.
- **Push is rare.** In-app brief is default. Out-of-app push (SMS/email/Telegram) only for owner/super_admin on a money or system-down threshold — never for routine rep nudges.
- **Dismiss = signal.** Dismissing trains the rank (store the dismissal; down-rank that type for that user).

---

## 4. Moat thesis — what V2 must deepen by EOQ

**(a) Agentic ad-ops + lead routing.** Today attribution *measures* vendor ROI after the fact (`page-attribution.jsx`). The moat is closing the loop: the agent reads attribution + rep close-rates and *acts* — pauses a negative-ROAS vendor, routes the next fresh lead to the rep most likely to close that product in that state. AgencyZoom routes leads on static round-robin; HubSpot doesn't know insurance close-rates at all. V2 needs: a routing edge fn fed by the existing attribution + `score-reps` data, owner-approvable. By EOQ: live routing on inbound leads for ≥1 agency.

**(b) RBA — the agent doing real work on the rep's behalf.** This is the deepest moat and the hardest to copy. `quote_agent.py` already logs into carrier portals and pulls live rates; saved rate-path maps let it replay. No CRM competitor has a local agent that *operates the rep's own carrier logins*. V2 deepens it from quoting → full pre-submit: pull the real rate, pre-fill the app, flag NIGO risk before submit. By EOQ: ≥3 carriers with full record-and-replay rate paths in production, used in live deals.

**(c) Data depth — telephony + CRM + commissions + UW in one stack.** Every competitor is one slice. Repflow has the dial, the transcript, the pipeline stage, the commission, AND the carrier UW rule — for the same lead, in one row-joinable schema. That join is the moat: "this lead, this objection on the recorded call, this carrier's actual UW rule, this commission." Nobody else can compute it. V2 must *expose* the join (the coaching card that cites the UW rule against the transcript). By EOQ: post-call coaching that references both the transcript and the live UW rule set.

**(d) Carrier UW via headless browser.** 171 sourced rules + a headless quoter is a data asset that compounds: every quote run can verify/refresh a rule. The moat widens automatically as usage grows — a data flywheel competitors can't backfill. V2: wire quote runs to flag rule drift (live portal rate ≠ stored rule) into the UW scrape queue. By EOQ: drift-detection writing review candidates.

**(e) Proactive coach surface (§3).** The fusion of (a)–(d) into one ranked daily action list IS the product's face. The moat isn't any single signal — it's that Repflow is the only place where dialing, closing, getting paid, and getting coached are one proactive loop. By EOQ: Daily Brief live for both personas with ≥4 live signal types.

---

## 5. Top 10 product transforms — ranked

Score = Simplicity × Functionality × Moat (each 1–5; product is the rank key). Complexity 1–5 (5 = hardest). Rev-unblock = does it directly let us close/keep a paying agency.

| # | Transform | Current → Target | S×F×M | Cx | Rev? | ETA |
|---|---|---|---|---|---|---|
| 1 | **Daily Brief proactive surface** | static `page-today` hero → ranked persona signal cards fed by existing crons | 5·5·5 = **125** | 4 | Y | 6–8 d |
| 2 | **Post-call coaching card** | call scored in a cron, never surfaced → coaching card minutes after hang-up, cites transcript + UW rule | 5·5·5 = **125** | 3 | Y | 3–4 d |
| 3 | **Commission-leak detector (owner)** | manual deposit reconciliation → agent flags unallocated/under-paid $ with one-tap fix | 4·5·4 = **80** | 2 | Y | 2–3 d |
| 4 | **Stalling-deal revive + drafted follow-up** | reps forget follow-ups → agent surfaces stalling deals + one-tap revive script | 5·4·4 = **80** | 2 | Y | 2–3 d |
| 5 | **Surface consolidation / nav cleanup** | 48 surfaces, redundant clusters → retire/merge legacy (`queue`↔`floor`, 4 admin shells, host wrappers) | 5·3·4 = **60** | 3 | N | 3–4 d |
| 6 | **Agentic lead routing** | static/no routing → route fresh lead to highest-close-prob rep (moat a) | 3·4·5 = **60** | 4 | Y | 5–7 d |
| 7 | **RBA full pre-submit** | live quote only → pull rate + pre-fill app + NIGO pre-flag (moat b/d) | 3·4·5 = **60** | 5 | Y | 7–10 d |
| 8 | **Compliance pre-submit gate** | SOA/disclosure checked by memory → agent blocks submit until SOA + state rules pass | 4·4·3 = **48** | 3 | partial | 3–4 d |
| 9 | **UW rule drift detection** | rules static post-seed → quote runs flag portal≠stored, queue for review (moat d) | 3·3·4 = **36** | 3 | N | 3–4 d |
| 10 | **Owner "agency on one screen"** | 13 nav items → one ranked ops view (Brief + money + team cold-list) | 4·3·3 = **36** | 2 | N | 2–3 d |

---

## 6. Phase 1 plan — next 14 days (top 3)

**Transform #2 (Post-call coaching card) ships first** — smallest blast radius, highest "wow," proves the proactive thesis on data that already exists (`score-recent-calls` already writes scores). Then #1 (the surface that hosts it), then #3 (owner money signal). Rationale: build the *card* and its data contract before the *dashboard*, so the Brief in #1 has a real card to render on day one.

| Order | Transform | Verify-before-shipping |
|---|---|---|
| 1 | **#2 Post-call coaching card** | SHA on `main`; Vercel READY; trigger a scored call (or seed a `call_scores` row in Ian's test agency `a073f1cc…`); walk the card in Chrome MCP + screenshot to `audits/screenshots/`. Backend proof if Chrome blocked: SQL roundtrip showing card payload from `/api/brief`. |
| 2 | **#1 Daily Brief surface** | Migration `agent_signals` with `RAISE EXCEPTION` verify block; `/api/brief` returns ranked cards for rep + owner test users (curl proof); Chrome walk of both personas + screenshots. |
| 3 | **#3 Commission-leak detector** | `cross-sell-sweep`-style cron writes leak signals; owner Brief shows the $ card; one-tap routes to `page-deposits`; SQL proof the flagged amount matches a hand-computed unallocated total. |

Each ships independently (no big-bang). If a proof is blocked (Chrome MCP not connected this session), I name the blocker and fall back to SQL/curl proof — never fake it.

---

## 7. Anti-roadmap — what we are NOT building

- **Not** a general-purpose chatbot or "ask me anything" assistant beyond the existing copilot. The agent earns trust by being *right about the next action*, not chatty.
- **Not** a new mobile native app. `page-mobile.jsx` + PWA shell is enough for V2.
- **Not** more `page-*` surfaces. V2 *removes* surfaces. Any new feature lands inside Floor, Brief, or an existing host.
- **Not** sub-daily Vercel crons (Hobby ceiling). Realtime + page-load compute + local-agent polling instead.
- **Not** auto-sending anything irreversible (real SMS/email, app submit, money moves) without one-tap human approval. The agent drafts and proposes; the human commits. Keeps `rba_action_confirmations` in the loop.
- **Not** ripping out the no-bundler architecture. It works; the cache-buster discipline is known.
- **Not** seeding business data into migrations (house rule). Signals/config are runtime.

---

## 8. Decisions Ian needs to make (these gate Phase 1)

1. **Phase-1 order — confirm or reorder.** I'm proposing coaching card (#2) → Brief (#1) → commission leak (#3). If you'd rather lead with the owner money signal (#3) because it's the clearest demo for a paying agency owner, say so — I'll flip #1 and #3.

2. **Multi-tenancy re-verification gate.** `KOINO_STATE` flagged tenancy "broken" (5/13); much has shipped since. Before V2 sells a *second* agency seat, do we (a) run a full RLS/tenant smoke now as a prerequisite, or (b) proceed on Ian's single agency (`a073f1cc…`) and defer the multi-tenant audit? This changes whether Phase 1 includes a tenancy audit.

3. **Push channel for the proactive agent.** In-app Brief is default. For owner/super_admin money + system-down alerts, which out-of-app channel — SMS (Twilio, already wired), email, or Telegram? Pick one for V2; I'll stub the others.

4. **Lead routing autonomy (moat a).** When the agent decides "route this lead to Rep B," is that **auto** (agent assigns, owner can override) or **approve-first** (agent proposes, owner taps)? Auto is a bigger moat and a bigger trust ask. Default I'll build: approve-first, with an owner toggle to go auto.

5. **Who's the V2 design-proof tenant?** Ian's own agency, or is there a paying agency (UEP / a Zay-bridged book) we should build the Brief against so the first demo is real data, not Ian's test rows?

---

*End of Phase 0. Per the brief: committing this to `main`, then waiting for green-light or amendments before any code. The 14-day plan and §8 decisions are the fastest path from this doc to transform #1 live on https://repflow.koino.capital.*

---

## 9. Phase 0.1 — Ian's decisions, LOCKED 2026-06-14

Ian green-lit with amendments. These override the proposals above where they conflict.

### Reshaped Phase 1 order
1. **Call recording — make it actually work, standalone.** "Record the audio at minimum," separate from the deactivated Floor, so any rep/manager can record a dialing session. This is now transform #1.
2. **AI coaching review of recorded calls** — the agent reviews recordings and helps reps *actually learn to be better* (transform #2, unchanged but explicitly tied to #1's output).
3. **Home screen = daily-goals logbook + motivation engine** (new, elevated). Reps/managers set daily goals (dials, etc.), log against them, hit goals → rewards. "Not a video game, but motivation" — simple, straight, the operator mindset: set goals → reach → hit → get rewarded ("some sort of game / vacation"). This replaces the generic Daily Brief framing for the rep home screen; the proactive cards become part of it.

### Moat — re-pointed (overrides §4)
Lead routing is **out** as the moat. The agent's job is to **help reps build their business**: log spend + new clients, help managers recruit, get the right quotes while listening to recorded calls. The real moat is the **culmination**:
- **AI Quoter v1** (exists — `quote_agent.py` RBA) — gets the quotes.
- **AI Application-filler v2** (the moat) — maps and fills out carrier applications with banking info, socials, etc. This is the deep, hard-to-copy asset. V2 builds toward it.

### Other locked calls
- **Out-of-app push channel: Email.**
- **Demo data: Zay's book.**
- Lead-routing autonomy question: **moot** (routing dropped from scope).

### Root-cause finding that reshapes transform #1 (discovered 2026-06-14, verified in source)
"Call recordings don't actually work" has a concrete cause: **two disconnected recording data models.**
- `api/twilio-recording.js` + `PostCallTranscript` UI write/read **`vault_artifacts`** (kind=Recording).
- The coaching engine — `api/cron/transcribe-call-recordings.js` + `api/cron/score-recent-calls.js` → `call_coaching_scores` — reads a **different table, `call_recordings`** (`audio_path` in the `call-recordings` storage bucket; schema in migration `0015`).

Nothing in the app writes `call_recordings`, so the scoring cron starves and coaching never appears. **The fix is the standalone recorder writing `call_recordings` + uploading to the `call-recordings` bucket.** It's the exact missing link: the scoring cron already exists and is waiting for input. So transform #1 directly unblocks transform #2 with zero new backend scoring work.

**Transform #1 build (locked):**
- New standalone surface `page-recorder.jsx` + its own nav entry (rep + manager), NOT inside Floor. Big Record button → reuses `LiveTranscriber`'s mic+system/Twilio stream mixing → `MediaRecorder` accumulates the full blob → on Stop, uploads to the `call-recordings` bucket and inserts a `call_recordings` row (`source='recorder'`, `transcript_url` null, rep_id/agency_id from `me()`).
- Recordings list on the same page: the rep's recent recordings + transcript (when the cron fills it) + coaching score (from `call_coaching_scores`) when ready.
- Existing crons (`transcribe-call-recordings`, `score-recent-calls`) require no change — they already consume `call_recordings`.

**Verification reality (named, not faked):** the upload→`call_recordings`→cron path is curl/SQL-verifiable with a synthetic blob. The *mic-capture* flow (getUserMedia + MediaRecorder) fundamentally needs a real browser with a mic-permission grant and a human gesture — it cannot be exercised headlessly. **Chrome MCP is not connected this session**, so the on-screen walkthrough proof from the brief is blocked. Final proof of the capture flow is either (a) Ian connecting the Chrome extension, or (b) Ian's ~60-second click-test (open Recorder → grant mic → record 10s → see the row + transcript). Everything up to the mic grant is verified deterministically.
