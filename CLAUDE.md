# RepFlow / Koino Insurance OS — Agent Instructions

Auto-loaded into every Claude session that cd's into this repo. Read it
before touching anything in `lib/`, `supabase/migrations/`, `api/`, or any
top-level `*.jsx`. The full session primer (architecture, deploy, demo
vs prod, Supabase rules) is `~/Desktop/repflow-session-primer.md` — read
both if you haven't seen this repo before.

---

## Guiding principles for wider-view coding

These exist because granular "MUST NOT BREAK" entries below catch
*known* regressions; this section is for the *class* of mistakes that
produce *next* session's bugs. Read it before doing anything that
touches more than one file. Quotable, memorable, non-negotiable.

### 1. Read the consumers before changing the producer
Every grep hit is a consumer. Missing one is a silent production
regression. The 2026-05-19 JSON removal nearly killed the "Best pick ·
per official underwriting" panel because three call sites consumed
those fields. Trace every reference (`grep -rn`) and read each hit
BEFORE declaring a rewrite complete.

### 2. Surgical means *complete within scope*, not *minimal diff*
A fix that touches three files to keep callers working beats a
one-file fix that breaks them. "Smallest correct shape" is small in
surface area but complete in semantics. If a change leaves a
downstream caller broken, it's not done — it's deferred.

### 3. Ship verification, not commits
A push that hasn't been `curl`-verified against the live URL is hope,
not engineering. Every change ends with a verification step that
proves the new behavior is live. The MIME-type bug on `install.ps1`
returned HTTP 200 for months — the status code lied. Test the
behavior; never trust the absence of errors.

### 4. Documentation is the forcing function for understanding
If you can't explain what's load-bearing about a change in two
paragraphs (LEARNINGS.md / CLAUDE.md / commit body), you don't
understand it well enough to ship it. Write the doc BEFORE declaring
done. The act of articulating exposes the assumption you didn't
realize you were making.

### 5. No data without a source. No rule without a citation.
For anything that drives a decision — eligibility, premium,
recommendation, ranking, ad copy targeting, anything regulated —
every value must trace to a citable source. "I think it's like this,"
"the comment says X," and "ChatGPT told me" are not sources. Code
comments lie. Tests pass on stale assumptions. Verify against the
live system, the producer guide, the carrier's actual page.

### 6. Trust-but-verify sub-agents — especially their confidence
Agents return crisp summaries that sound authoritative; their evidence
is partial and lossy. For load-bearing claims, verify directly before
acting. Spot-check at least two facts per sub-agent return via the
underlying source. An agent saying "X is correct" is one data point,
not a proof.

### 7. List three things that could be wrong
Before any "this is done" claim, articulate three plausible failure
modes. If you can't name three, you haven't looked hard enough. The
category of mistakes you don't notice is larger than the category you
do. This is a discipline, not a vibe.

### 8. Concurrent writers exist. `git fetch` is free.
This is not a solo workspace. Other sessions, agents, and humans
write to the same repo. Cache-buster collisions, conflicting nav
restructures, parallel migration numbers — all observed in real
sessions. Run `git fetch origin main` immediately before every
commit; resolve drift early; pick cache-buster bumps higher than
`origin/main`'s current number.

### 9. Plan for partial failure in multi-step changes
Migrations split into A/B/C/D will have a part that fails. Each part
must be idempotent (re-runnable), carry a verify block (`DO $$ …
RAISE EXCEPTION IF cnt <> N $$`) that fails loudly, and have an
articulated recovery plan. The recovery plan IS part of the change,
not an afterthought when something breaks at 2am.

### 10. Defer the redesign that isn't blocking today
The operator wants the thing today. Ship the smallest correct shape
that closes the loop. Mark elegant-but-not-blocking rebuilds as TODOs
with location + acceptance criteria in LEARNINGS.md so a future
session can pick them up. Today closes deals; perfection ships
nothing.

### 11. The operator's mental model drifts from reality
Recalibrate it explicitly: "you think X but actually Y is the state."
Don't let the operator ship decisions on stale beliefs about the
codebase. When they describe the system, paraphrase it back AGAINST
what you've just observed — diverge if needed.

### 12. Act like an autonomous agent — that's what the operator hired
Don't ask permission to read files, install packages, run smoke
tests, or fix obvious typos. Ask before: fiat spend, destructive ops,
first-touch human contact, production schema changes that touch
sensitive data. "Could you check…" / "Would you like me to…" /
"I could do X if you want" — all wrong defaults. Decide and act,
then report the outcome.

---

## Recent work that future changes MUST NOT BREAK

These are load-bearing fixes from 2026-05-17 / 2026-05-18. They look
small in diff form but each closed a silent regression that was live in
production for days.

### Commit `d732233` — Quote tool JSON narrative survives DB hydrate
`lib/rate-engine.js::hydrateFromSupabase()` merges DB rules **per-product
with a spread**, not by overwriting carriers wholesale. JSON narrative
fields (`sweet_spot`, `sources`, `discounts`, `tobacco_notes`,
`build_notes`, `uw_classes_notes`, `confidence`) MUST survive the merge.
`recommendReasons()` in the same file consumes them for the "Best pick ·
per official underwriting" panel.

**Do not** revert to `UW_GUIDES = { ...UW_GUIDES, ...fromDb }`. The
per-product spread is intentional.

**Do not** unconditionally assign `body.confidence = p.features?.confidence`
in `rulesToGuide()` — `undefined` writes obliterate the JSON value. Only
assign when DB has an opinion (`if (... != null)`).

### Migration `0056_restore_redeem_invite_rep_creation`
`public.redeem_invite(token)` MUST create a `public.reps` row (with
`upline_id` stamped from `agency_invites.upline_rep_id`), link
`agency_members.rep_id` to it, seed `public.onboarding_progress`, and
return the new `rep_id`. Earlier work (`redeem_invite_no_placeholder_rep`,
2026-05-14) deleted this block; the result was 8 reps with 0 `upline_id`
and 1 active manager with no rep row at all.

**Do not** rewrite `redeem_invite` to return `null` or skip rep creation.
The Tree page, `downline_of()`, the Recruiting UI, and
`onboarding_progress` all assume every active rep/manager member has a
rep row.

### Migration `0057_invite_flow_hardening`
Three load-bearing pieces:

1. **`public.invite_events` audit table** — `mint_invite` and
   `redeem_invite` insert success rows (`event IN ('mint','redeem_ok',
   'redeem_idempotent','rep_autocreated','health_alert')`). Failure paths
   use `RAISE LOG` because `RAISE EXCEPTION` rolls back the function's tx
   (any INSERT-then-RAISE in the same block is futile — verified
   empirically before writing the migration).
2. **`public.tg_agency_members_ensure_rep` trigger** on
   `agency_members BEFORE INSERT OR UPDATE`. If `role IN ('rep','manager')`
   and `rep_id IS NULL` and the user has no rep row in this agency, the
   trigger synthesizes `rep-<uid12>` and creates the reps +
   onboarding_progress rows + audit event. Last line of defense if a
   future migration breaks `redeem_invite` again. **Don't drop it.**
3. **`public.invite_health_snapshot()` RPC** — consumed by
   `api/cron/invite-health.js` daily at 13:00 UTC. Returns per-agency
   counts of orphans / dangling uplines / cross-agency uplines / expired
   unredeemed invites / pending invites. The cron inserts
   `agency_notifications` rows to owners/admins/imo_owners/super_admins
   on any non-zero count, idempotent within 22h.

### Migration `0058_db_only_underwriting_narrative` — DB is the SOLE UW source

The earlier "JSON narrative survives DB hydrate" merge from commit
`d732233` (above) was a stepping stone. After 0058, **there is no
JSON merge.** `lib/rate-engine.js::loadGuides()` and the `fetch(
"/lib/carrier-underwriting.json")` call are **deleted.** `UW_GUIDES`
starts empty and is populated solely by `hydrateFromSupabase()`.
`lib/carrier-underwriting.json` is renamed to `.deprecated.json` so
no future fetch can find it.

`rule_type='narrative'` is the new vocabulary entry — added to the
CHECK constraint in 0058 via DROP+ADD (there's no `ALTER CONSTRAINT`
for CHECK lists). Narrative rows carry `sweet_spot`, `discounts`,
`uw_classes_notes`, `tobacco_notes`, `build_notes`, `confidence`,
`graded_period_months`, etc. in `payload`. `rulesToGuide()` merges
those keys into the product body.

`window.UW_GROUNDING = { source, status, carriers, products, rules,
loadedAt, error }` is the public signal. UI listens for
`carrier-uw:loaded`.

**Do not** revive the JSON fetch. **Do not** treat `CARRIER_NICHES.
underwriting` blobs as authoritative for eligibility — they are
roster + `fit()` scoring hints only.

### Migration `0059a–d` — 7 new carriers + Corebridge IUL/MYGA + source backfill

7 carriers added: `transamerica`, `ethos`, `americanamicable`,
`foresters`, `sbli`, `instabrain` (aggregator — Fidelity Life paper),
`americo`. Plus two new products under existing `aig` carrier:
Corebridge QoL Max Accumulator+ III IUL and Corebridge American
Pathway Fixed 5/7 MYGA.

Each new (carrier, product) carries eligibility rules + a narrative
row, all citing producer-guide form numbers or carrier-published
pages. **Every rule has `source_url` + `source_quote`** — research
agents were instructed to omit rather than invent.

0059b also backfilled `source_url` on the 55 prior approved rules
that lacked citations. Prod state: 171 approved rules, 100% with
sources, 28 products / 100% with a narrative.

**Do not** insert an approved rule without `source_url` +
`source_quote`. Add a `RAISE EXCEPTION` verify block in any migration
that adds eligibility rules.

### Migration `0060_state_rate_sheets_medsupp` — `rate_table.plans.{G,N}` shape

State-specific Med Supp premiums seeded into `products.rate_table`
for 5 carriers × Plan G + Plan N. The shape:

```json
{
  "plans": {
    "G": { "base_monthly_cents": 19100, "state_factors": {"TX": 1.0, "FL": 1.84, ...}, "tobacco_uplift_pct": 10, "age_factor_per_year": 300 },
    "N": { ... }
  },
  "confidence": "medium|low",
  "sources": [...],
  "captured_at": "..."
}
```

`base_monthly_cents` anchors at the lowest-rate state; other states
are multiplicative factors. Plan G and Plan N share the same product
row (1 product per carrier in DB) — hence the `plans` wrapper.

**TODO**: `/api/quote` currently reads `rate_table.base_monthly_cents`
flat. To honor variant pricing it needs to read
`rate_table.plans[<variant>]`. Same for `lib/rate-engine.js` if we
want the manual Quote tool to use these DB-sourced state rates.

### `page-quote.jsx::sendQuote()` — wired to real endpoints

No longer a localStorage stub. SMS goes through `/api/twilio-sms`
(existing edge fn with two-tier delivery: Twilio primary →
`sms_outbox` fallback for the rep's local Repflow Agent). Email opens
`mailto:<addr>?subject=...&body=...` in the rep's default client —
no SMTP creds, no server endpoint needed, works on every device.

`composeQuoteMessage()` generates a 320-char SMS body summarising the
best pick. Optimistic UI: `draft → sending → sent` with
`deliveryDetail` tracking the path (`twilio` / `local_agent` /
`mailto_handoff`). Reverts to `draft` on network failure.

**Do not** delete the mailto: branch in favour of an SMTP endpoint
without first adding sender-domain + DKIM + reply-tracking. The
mailto handoff is a deliberate v1 choice.

### `vercel.json` — install routes need explicit Content-Type

Static files in `/agent/` that aren't `.py` (i.e. `install.ps1`,
`install.sh`) are served with the wrong MIME unless explicit headers
are declared. PowerShell's `iwr -useb ... | iex` install one-liner
silently breaks on wrong content-type — and the 200 status hides it
from monitoring.

The `headers` block has explicit entries for `/agent/install\\.ps1`
(`text/plain`) and `/agent/install\\.sh` (`text/x-sh`). **Do not
remove these** unless you've moved the installers under `public/agent/`
or otherwise verified `curl -I` returns the correct Content-Type.

### Quote tool + Auto-Quoter unification

Quote tool (`page-quote.jsx`) is the single rep-facing surface for
both engine estimates AND live carrier-portal quoting. The
`/auto-quoter` route stays alive for Admin (carrier creds + session
capture + Playwright install screens), but it has no sidebar entry.

The "Get live carrier rates" button in Quote tool inserts into
`auto_quote_requests`; the local Playwright daemon (`agent/quote_agent.py`)
picks it up and writes results to `auto_quote_results`. Realtime sub
in `page-quote.jsx` streams them into the carrier rows as `live $X/mo`
badges. A "Recent live runs" strip below the CTA shows the last 5
RBA sessions for this rep with click-to-load profile re-population.

**Do not** re-add Auto-Quoter to any sidebar (rep, manager). Reps
manage everything from the Quote tab; admin manages creds from
Admin → Auto-Quoter.

---

## Repo architecture (the non-obvious parts)

- **No bundler.** Each top-level `*.jsx` transpiles individually to
  `dist/*.js` via `scripts/build-jsx.mjs` (esbuild). Each file is its own
  `<script>` tag in `index.html`. `const { useState } = React;`
  redeclarations across files are intentional — per-script scope. Do
  not refactor toward modules/bundling.
- **Cross-file IPC is `window.*`.** `window.RateEngine`, `window.AppData`,
  `window.CARRIER_NICHES`, `window.me()`, `window.toast()`,
  `window.gotoPage()`. Don't import. Grep call sites.
- **Script load order matters.** `index.html` `<script>` tags are
  sequential. e.g. `page-queue.js` defines `CARRIER_NICHES`, consumed by
  `page-quote.js` later. Bugs surface as silent empty arrays.
- **`lib/*.js` is shipped as-is, not in `dist/`.**

## The cache-buster trap (production poison if missed)

`vercel.json` sets `immutable, max-age=1yr` on `/dist/*.js`. **Every edit
to `lib/*.js` or top-level `*.jsx` requires bumping `?v=N`** in
`index.html` AND every sibling HTML (`quoter.html`, `landing.html`,
`login.html`, `mobile.html`). Without the bump, deploy succeeds but
browsers never refetch. Find all refs:
```
grep -rn "<filename>\.js?v=" --include="*.html"
```

## Deploy + verify

- Push to `main` → Vercel auto-builds (~60–90s).
- Vercel MCP returns 403 on this team. Don't try `list_deployments`.
  Verify by curl + grep:
  ```
  curl -s "https://repflow.koino.capital/<path>?v=<new>" | grep "<change>"
  ```
- Crons in `vercel.json` `"crons"`. Edge fns under `api/**`. Static
  everything else from repo root (`outputDirectory: "."`).

## Supabase rules

- DDL: `mcp__claude_ai_Supabase__apply_migration`. **Never
  `supabase db push`** (migration-tracker drift). Local migration files
  in `supabase/migrations/` may lag prod by several numbers — check
  `supabase_migrations.schema_migrations` for ground truth.
- Project ID: `jfphwmzwteermalzwojp`. (`zybndnqnbxarpkhqpcxq` in
  `SITREP.md` is stale, ignore.)
- All tables RLS-scoped by `agency_id`. `public.me()` resolves
  caller→rep_id+role.

## Demo vs prod (don't confuse)

`/?demo=1` skips auth and seeds Atlas sandbox **client-side from JS**.
Atlas reps (`marc/dani/remy/alex/jada/...`) exist ONLY in client memory
— NOT in `public.reps`. Atlas UUID
`e0a68c9f-cf48-47b0-bef7-dba3f27db0b9` references almost nothing in the
DB. For DB-grounded smokes use real agencies:
- `d548e8ea-9fab-4c7e-a700-c3b10976f1d8` — Isaiah's agency
- `a073f1cc-f4b4-44e9-8471-173455391e2f` — Ian's agency

---

## Useful entry points

- **Quote tool (manual estimates):** `page-quote.jsx` +
  `lib/rate-engine.js` + `public.product_underwriting_rules` +
  `page-queue.jsx` (`CARRIER_NICHES` roster).
- **Quote tool (live carrier rates / RBA):** "Get live carrier rates"
  button → `auto_quote_requests` row → `agent/quote_agent.py`
  (local Playwright daemon) picks it up → writes `auto_quote_results`
  → realtime sub in `page-quote.jsx:449-469` streams them back. Admin
  surface for creds + install + session capture: `page-auto-quoter.jsx`
  reachable from Admin nav (no sidebar entry). Delivery plan:
  `RBA-DELIVERY-PLAN-2026-05-20.md`.
- **Send quote:** `page-quote.jsx::sendQuote()` → `/api/twilio-sms`
  for SMS (existing edge fn, two-tier delivery) or `mailto:` handoff
  for email.
- **Invites:** `page-invite-team.jsx` → `api/invites/create.js` →
  `mint_invite` RPC → `?invite=<token>` → `redeem_invite` RPC →
  `page-auth.jsx` handles redemption on first auth event.
- **Downline:** `page-tree.jsx` + `public.downline_of(rep_id)`.
- **Health cron:** `api/cron/invite-health.js` ↔
  `public.invite_health_snapshot()`.

## Operator preferences (Ian / bigbacon61)

- Alpha-locked. Direct. "Obv fix it" = fix and deploy.
- Sovereign execution — decide and act on routine ops. Ask only for
  fiat spend, prod schema changes that touch live data, first-touch
  human contact, destructive ops.
- Anti-hallucination: every metric needs a backing `grep`/`wc`/`file
  mtime`. Failed tool call ≠ success.
