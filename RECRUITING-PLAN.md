# Recruiting v2 — Plan

Status: drafted 2026-06-17. Author: Claude (RepFlow session). Owner-on-record: Ian. Phases marked with ✓ already exist in code; everything else is proposed.

## Why this doc exists

The Recruiting workspace today is a self-managed Kanban. That is necessary but not sufficient — a Google Sheet does the same thing. The point of building this *into RepFlow* is to make recruiting **live, event-driven, and high-signal**:

- live: realtime inbox + funnel update
- event-driven: an applicant action, a NIPR license change, an inbound DM all trigger downstream work
- high-signal: the manager opens it and sees the **three things that need them today**, not a wall of charts

If we cannot get past "fancy spreadsheet," we should not ship this. Every feature below earns its place by reducing manager touches per producer hired, or by raising producer-hires-per-quarter.

## Strategic frame

Recruiting an insurance producer is a **6-step funnel** with massively asymmetric drop-off:

```
   sourced  →  applied  →  in_review  →  contracted  →  first_app  →  producing
   (1000)      (50)         (20)          (8)             (4)           (2)
```

Where leverage actually lives:

1. **Top-of-funnel volume × quality**: sourcing channels that produce licensed-or-licensable bodies, not warm bodies.
2. **Speed-to-first-touch**: every hour beyond minute-five halves contact rate. This is a 24/7 problem; humans can't cover it.
3. **In-review → contracted retention**: most leak is "I never got back to them." A nag system fixes 80% of this with zero new sourcing.
4. **Producing-rate of contracted**: 50% of contracted producers never write a deal. The kanban must surface them inside week 2, not month 3.

Build for those four leverage points. Everything else is wallpaper.

---

## Phase 0 — already done

- ✓ `page-recruiting.jsx` exists at its own sidebar entry (manager / owner / imo_owner / super_admin). Tabs: Invite team · Funnel · Conversations · Programs · Settings.
- ✓ Stages: `applied → in_review → contracted → first_app → producing` (+ `dropped`). Stored as `recruiting_applicants.status`.
- ✓ Tables: `recruiting_campaigns`, `recruiting_applicants`, `recruiting_messages`. Realtime subscribed in `data.jsx`.
- ✓ As of 2026-06-17, the Recruiting tab in CRM was removed — Recruiting is its own page only.

## Phase 0.5 — Settings tab + hosted sites schema (2026-06-17, shipped)

Three panels on Recruiting → Settings, owner/manager-only:

### Local agent (level-1 fallback)

- Probes `rba_installs` for this agency. "Live" = heartbeat within last 5 min.
- **No agent detected** → status pill shows `not installed`, panel renders the
  "Level 1" mode banner: manual quick-link buttons for each platform, an
  AI-editable job-description template, copyable careers-page URL. Automation
  (auto-posting, DM sending, inbox polling) is gated behind a live agent.
- Install links: `/agent/install.sh` (macOS / Linux), `/agent/install.ps1`
  (Windows) — the same daemon as the Auto-Quoter.

### Hosted sites — Vercel deployments tied to this Supabase

Migration `0096_agency_sites_and_forms` shipped:

- `agency_sites` — one row per Vercel deployment for an agency. Columns:
  `slug`, `kind` (`careers` / `quiz` / `landing` / `other`), `vercel_project_id`,
  `vercel_team_id`, `primary_domain`, `deployment_url`, `status`,
  `theme jsonb`, `notes`. Unique on `(agency_id, lower(slug))` and
  `lower(primary_domain)`.
- `agency_site_forms` — JSON-schema forms hosted on those sites. Each row has
  `fields jsonb`, `target_table` (default `recruiting_applicants`),
  `routing jsonb` (lead-score weights, default owner_rep_id), `webhook_token`,
  `status`. Unique on `(site_id, lower(slug))`.
- `agency_site_submissions` — server-only insert (service-role key). Append-only
  audit of every form submit + the routing decision. Reads are agency-scoped.

This is the data backbone for "spin up a Vercel-hosted micro-site per
client, share the same Supabase, drop submissions straight into the agency's
funnel." Operator UX is in the Hosted Sites panel: Link site → set
deployment URL + slug + kind, then add forms → JSON schema editor +
target_table picker. Anti-clutter: this is one canonical table set per
function, not a separate per-platform form schema for each integration.

### Platform credentials

Reuses the existing `connections` table + the existing `/connections` page.
The Recruiting Settings panel just surfaces a recruiting-focused subset
(instagram, linkedin, indeed, ziprecruiter, facebook, glassdoor, x, telegram)
with status pills, and deep-links to Connections for actual editing. No
schema duplication.

### Pending follow-up — Auman ↔ UEP wiring

Need to insert an `agency_sites` row for Auman's agency pointing at the UEP
deployment, then create a `recruiting_applicants` form on it. Action item is
tracked outside this plan (executed in the same session); marking here for
posterity.

---

## Phase 1 — make the existing kanban actually load-bearing (1–2 days)

These are small additions that make the workspace stop looking like a spreadsheet and start working like an operating system.

### 1.1 Stage SLA + at-risk coloring

`recruiting_applicants` gets two derived fields surfaced in the UI:

- `stage_entered_at` (timestamptz, defaults to `now()` on status change via trigger)
- per-stage SLA: applied (4h), in_review (5d), contracted (10d to first_app), first_app (30d to producing)

Card border turns amber at 80% of SLA, red at 100%. The Funnel column header shows `at-risk: 3 / total: 12`.

### 1.2 "Today's Recruiting" signal block on Today page

One panel at the top of `page-today.jsx` for manager+, structured as the three highest-signal things:

```
RECRUITING SIGNAL
┌────────────────────────────────────────────────────┐
│ 🟡 3 applicants need a reply (last touch >24h)     │
│ 🔴 1 contracted producer hasn't written in 18 days │
│ 🟢 2 new applications since yesterday              │
└────────────────────────────────────────────────────┘
```

Click → deep link into Recruiting at the right filter. Nothing more — if the manager doesn't need to act, the block is empty (collapsed strip). Anti-dashboard.

### 1.3 Telegram + Slack inbound webhook fan-out

When a new applicant or inbound message lands, fire a notification through the existing `~/.openclaw` Telegram bot (and Slack if connected) to the rep owner of the applicant. Use the same channel the dialer already uses for hot SMS — operator already trusts it.

### 1.4 Auto-advance triggers

Postgres triggers on relevant events:

- applicant inserted with `nipr_match=true` → flip to `in_review` automatically
- first `policies.rep_id = applicant.rep_id` insert → flip to `first_app`
- `policies` count ≥ 3 in 30d → flip to `producing` with audit row

The kanban becomes a *consequence of reality*, not a thing the manager has to manually move cards on.

---

## Phase 2 — Careers page + apply form (2–3 days)

### 2.1 Public careers landing per agency

URL: `https://repflow.koino.capital/careers/<agency_slug>`

Page contents (single-page React, lazy-loaded):
- Hero: agency logo, owner intro video (uploaded by owner), one-line pitch
- Comp calculator: state × tier × monthly volume → projected first-year income. Lifted from existing `lib/rate-engine.js` premium math, not made up.
- Social proof: 3 producer testimonials pulled from `recruiting_testimonials` (new table — owner adds them once)
- Apply form with smart fields:
  - name, email, phone (required)
  - licensed? → if yes, NPN + state(s)
  - if not licensed → "would you be willing to get licensed?" yes/no
  - calendly slot picker — pulled from the owner's existing calendly integration if one exists, otherwise a built-in time picker that writes to `recruiting_screening_slots`
  - source autodetected via UTM
  - one open question: "Why insurance, why now?"

### 2.2 Apply handler

`POST /api/recruiting/apply` (Vercel edge fn):

1. Validates input + spam-filters (honeypot + IP rate limit).
2. Inserts `recruiting_applicants` row with `status='applied'`, `source=<utm>`, `careers_form_payload=<full json>`.
3. Computes `lead_score`:
   - licensed in target state: +40
   - licensed elsewhere: +20
   - willing to license: +10
   - prior insurance sales experience parsed from the open question (regex): +15
   - calendly slot picked: +15
4. Routes:
   - score ≥ 70 → owner notification (Telegram + Slack + email draft)
   - score 40–69 → assigned manager
   - score < 40 → auto-nurture sequence
5. Fires welcome email (mailto: handoff *or* Twilio SMS template, owner's choice in settings).
6. If a Calendly slot was picked, server-side calls Calendly API to confirm.

### 2.3 NIPR cross-check (best-effort, async)

A daily 13:00 UTC cron walks new applicants and looks up NPN on NIPR (where we already have a session via the agent). Failure is OK — sets `nipr_checked_at` regardless so we don't loop. Hits write to `recruiting_applicants.nipr_*` columns.

---

## Phase 3 — Multi-platform job-spec fan-out (3–5 days)

This is the "I don't want to post the same job 9 times" part. The leverage is enormous: one good job spec, one click, listed everywhere relevant simultaneously, all funneling back to `/careers/<slug>`.

### 3.1 Data model

```
recruiting_jobs            — one canonical spec (title, body_md, comp_summary, requirements, locations[])
recruiting_job_postings    — (job_id, platform, external_id, posted_at, status, applicants_count, url)
```

### 3.2 Platforms (tiered by ROI)

**Tier A — high-ROI insurance-specific (build first):**
- Indeed (open API + RSS for state-licensed roles)
- ZipRecruiter (paid API; also Playwright fallback)
- LinkedIn Jobs (Playwright via local agent — auth profile already exists)
- Google for Jobs (via schema.org/JobPosting embedded on `/careers/<slug>` — no platform API needed)

**Tier B — free / sales-friendly:**
- Facebook Marketplace Jobs (Playwright)
- Craigslist Sales/jobs in target metros (Playwright + email-relay)
- Reddit job posts to subs that allow them (r/insurance, r/sales — manual approval gate, agent posts on green)

**Tier C — content-as-job-ad (the outside-the-box bucket):**
- Auto-generate an Instagram Reel script + caption for the job, queue into the existing `~/koino-content/maranatha/drops/` style pipeline → owner approves → publishes via the same poster the brands use.
- Auto-generate an X thread (one tweet per: hook / pain / offer / proof / CTA).
- Post to LinkedIn personal feed of the owner (different from LinkedIn Jobs — personal post = 100x organic reach).

### 3.3 Execution path (where the local agent matters)

For Tier A LinkedIn + ZR Playwright path, Tier B everywhere, Tier C posting:

```
UI "Publish job to N platforms"
   → INSERT recruiting_job_postings (status=queued) × N
   → enqueue agent_jobs.kind = 'recruit_jobpost_publish' with platform routing
   → local RepFlow Agent polls /api/agent/poll-jobs
   → Playwright session opens, signs in, posts, captures external_id + URL
   → writes back via /api/agent/result → flips status=posted
   → UI shows live status per platform with per-platform applicant counters
```

This piggybacks on the same auth + daemon model as the Auto-Quoter (`agent/quote_agent.py`). No new infra. Same install, same trust ring.

### 3.4 De-dupe + applicant attribution

UTM tags per platform are mandatory on all posted URLs. Inbound applicant rows store `utm_source / utm_medium / utm_campaign / utm_content`. Per-platform cost-per-applicant becomes a real number in the Programs tab.

---

## Phase 4 — Inbound normalization + actual sending (2–3 days)

The user is right: if RepFlow can't actually send, this is theater.

### 4.1 Local-agent-mediated outbound (today's reality)

A new queue table `recruiting_outbound_queue` shaped like `agent_jobs`:

```
id uuid pk
applicant_id uuid fk
channel text  -- 'instagram_dm' | 'linkedin_dm' | 'sms' | 'email' | 'whatsapp'
payload jsonb -- { body, attachments, threading_hint }
status text   -- queued | running | sent | failed
attempts int
created_at, sent_at
```

Composer in the Conversations tab inserts a row. The local agent handles:

- `instagram_dm` / `linkedin_dm` → Playwright via the existing `~/.openclaw/browser/openclaw/user-data` profile (same one OCI's posters use — auth is preserved).
- `sms` → existing `/api/twilio-sms` edge fn (already wired).
- `email` → mailto: handoff (today; per repo `CLAUDE.md` this is a deliberate v1 choice).
- `whatsapp` → Playwright on WhatsApp Web; lower priority, ride along when convenient.

**Why through the local agent, not server-side**: there is no server-side IG/LinkedIn send path that doesn't get accounts banned. The local agent uses the human's real browser session — indistinguishable from the human.

### 4.2 Inbound webhooks → unified inbox

New table `recruiting_inbound_inbox`:

```
id, applicant_id (nullable, resolved by phone/email/handle match), channel,
external_thread_id, body, received_at, attachments_jsonb, raw_payload_jsonb
```

Endpoints (Vercel edge):
- `/api/recruiting/inbound/twilio` — SMS replies (Twilio webhook signed)
- `/api/recruiting/inbound/instagram` — IG Graph webhook (when business account connected)
- `/api/recruiting/inbound/gmail` — Gmail watch webhook (when Gmail MCP / OAuth on file)
- `/api/recruiting/inbound/linkedin` — local agent polls LI inbox every 60s and POSTs new threads

On insert: resolve applicant by phone/email/handle. If matched, append to thread + reset SLA + fire realtime + Telegram ping. If unmatched, drop in an "Unknown sender" tray for the manager to triage.

### 4.3 AI replies — local-agent-mediated until BYOK

Until BYOK ships:

- A "Draft reply" button on every inbound message enqueues `agent_jobs.kind = 'recruit_draft_reply'`.
- Local agent runs a local LLM (Ollama / `llama3.1:8b-instruct` on the operator's box — feasible on M1+) and posts the draft into the composer as a suggestion.
- Manager hits send or edits first. Nothing auto-sends without manager click in v1.

After BYOK:

- The same job kind runs server-side via the agency's `openai_api_key` / `anthropic_api_key` from `agency_secrets`.
- Optional auto-reply mode: for warm/lukewarm applicants only, auto-reply on the first acknowledgment ("Got it, scheduling a call this week — what time works?") with a strict tone-locked template.

---

## Phase 4.5 — GHL bridge for landing-quiz funnel leads (deferred)

When an agency runs a consumer quiz funnel (the `kind='quiz'` entries in
`agency_sites`) and they ALSO operate a GoHighLevel pipeline, we should
mirror form submissions into their GHL on top of writing to `pipeline` /
`leads` in this Supabase. Two paths:

1. **GHL inbound webhook** — agency pastes their GHL webhook URL into
   `agency_sites.theme.ghl_webhook` or as a row in `connections`; the
   `/api/site-forms/submit` edge fn forwards a normalized payload after
   it routes locally. Best for agencies that want GHL as the source of
   truth.
2. **GHL OAuth + Custom Objects API** — full bidirectional sync. Reserves
   `connections.id = 'ghl'` with refresh tokens. Significantly more wiring;
   defer until at least one agency asks for it.

Not on the critical path for the producer funnel. Documented here so a
future session has the design without having to rediscover it.

## Phase 5 — Outside-the-box sourcing (the real moat) (parallelizable, 1–2 weeks)

A licensed agent is way easier to *find* than to *recruit*. RepFlow should hand the manager a *list* of names they should contact this week, not require them to source.

### 5.1 Freshly licensed in last 30 days

Most state DOIs publish weekly license lists (CSV or HTML). A daily cron walks target states, diffs against last week, surfaces:

```
new_licensed_agents
  id, npn, name, state, line_of_authority, license_date_eff,
  contact_phone (if public), contact_email (if public), discovered_at
```

Manager sees a "Fresh licenses · TX (8) · GA (3)" widget. Click → list view → "Add to recruiting" (creates applicant row with `source=fresh_license`, lead_score=high). Best-in-class signal: these are *just-qualified* humans who haven't been onboarded anywhere yet.

### 5.2 Cancelled appointments (competitors losing producers)

NIPR publishes appointment cancellation records (paid feed, but worth it for top tier). When an agent terminates at a competitor, they're up for grabs for the next 30–90 days. Surface to manager: "12 agents in your states had appointments terminated last week. Reach out before someone else does."

### 5.3 "Open to work" LinkedIn scrape

Local agent (LinkedIn auth profile present) runs a saved search nightly:
- title contains "Insurance Sales Agent" OR "Life Insurance Producer"
- location matches `agency.target_states`
- open-to-work badge present

Drops into a "Sourced · LinkedIn" tray. Manager taps into mass-DM template (per applicant, personalized via two known fields: their last role + their state).

### 5.4 Referral program built-in

A `recruiting_referrals` table + a per-rep referral page (`/r/<rep_handle>`) the rep can share. Successful hires pay out via existing commission tracking + `commission_adjustments` ledger. The producing rep gets a notification when their referral hits each milestone — built-in viral loop.

### 5.5 Reverse-recruit alumni rosters

Agency owner uploads a CSV of their college business school alumni or prior MLM/sales team. RepFlow runs them against NIPR (licensed-or-not), enriches with phone/email via Apollo or PDL if BYOK key present, drops the licensed ones at high score + the unlicensed-but-sales-experienced at medium score.

---

## Phase 6 — Monetization (BYOK + credits) (1 week)

Two SKUs running in parallel:

### 6.1 BYOK

Agency settings → "AI keys" tab. Operator pastes:
- `openai_api_key` (or `anthropic_api_key` or `xai_api_key`)
- `apollo_api_key` (optional, sourcing enrichment)
- `pdl_api_key` (optional, alt enrichment)
- `nipr_api_key` (optional, cancellation feed)

Stored encrypted in `agency_secrets` (Supabase Vault). Server-side LLM calls go through their key. They pay their own LLM bill, we charge $0 for the AI layer.

### 6.2 Credits (Stripe metered)

For agencies that don't want to deal with API keys:

```
recruiting_credits_balance       (agency_id, balance_credits)
recruiting_credits_transactions  (agency_id, delta, kind, ref_id, created_at)
```

Pricing draft (tunable):
- 1 outbound DM via local agent: 1 credit
- 1 AI-drafted reply: 5 credits
- 1 NIPR lookup: 2 credits
- 1 LinkedIn nightly scrape entry returned: 1 credit
- 1 job posting to a Tier A platform: 20 credits

Credit packs via Stripe Payment Links: 1k credits = $10, 10k = $80, 100k = $600 (tunable). Stripe webhook crediting `recruiting_credits_balance` is the only new infra.

Manager sees a credit meter in Recruiting header. Out of credits → graceful degradation: queue stays paused, manager prompted to top up.

### 6.3 What stays free forever

- Manual kanban + conversations + applicant CRUD
- Careers page + apply form + Calendly hand-off
- Telegram alerts
- Inbound webhooks

Free tier is genuinely useful; paid tier is *automation* and *volume*.

---

## Architecture summary

```
                  ┌─────────────────────────────────────────────┐
                  │     Browser (RepFlow UI · React no-bundle)   │
                  │     page-recruiting.jsx · page-today.jsx     │
                  └────────┬─────────────────────┬──────────────┘
                           │ realtime + RPC      │
                           ▼                     ▼
                  ┌──────────────────┐    ┌───────────────────┐
                  │  Vercel edges    │    │   Supabase        │
                  │  api/recruiting/ │◄──►│   pg + RLS +      │
                  │  apply,publish,  │    │   realtime +      │
                  │  inbound/*       │    │   recruiting_*    │
                  └─────────┬────────┘    └───────────────────┘
                            │
                ┌───────────┴──────────────┐
                ▼                          ▼
   ┌─────────────────────────┐   ┌────────────────────────┐
   │  Local RepFlow Agent    │   │  External webhooks     │
   │  (Playwright daemon)    │   │  Twilio · IG Graph ·   │
   │  · DM send IG/LI        │   │  Gmail · Calendly      │
   │  · job posting          │   └────────────────────────┘
   │  · inbox polling LI     │
   │  · local LLM (Ollama)   │
   │  · NIPR session reuse   │
   └─────────────────────────┘
```

The local agent is the same daemon as the auto-quoter — single install, single trust ring. This is the only way IG/LinkedIn outbound is realistic without account bans, and it's the bridge that lets RepFlow do real work *today* without anyone holding an API key.

---

## Sequencing decision

Phase 1 + 2 in week 1 — they make the existing surface load-bearing and add the careers page (which itself shrinks the "where do applicants even come from" problem to "send the link"). Phase 3 in week 2 — job fan-out compounds Phase 2. Phase 4 in week 3 — once the funnel produces volume, sending becomes the bottleneck. Phase 5 is parallelizable from week 2 onward, since DOI scraping and LinkedIn nightly are independent jobs. Phase 6 ships once Phases 1–4 work for Ian's agency at least one full week and we have real usage data to price against.

## What I deliberately did NOT include

- A custom video-interview tool. Loom + Calendly already solve this. Don't reinvent.
- An applicant-tracking system competitive with Workable/Greenhouse. We are not hiring engineers; insurance recruiting is a different shape.
- LLM agents that auto-close applicants without manager review. We do not have the trust budget to ship that, and one hallucinated commitment ("yes, $250k first-year") nukes the agency.
- A Chrome extension. The local agent does what an extension would do, with more capability and one fewer install surface.
