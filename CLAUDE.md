# RepFlow / Koino Insurance OS — Agent Instructions

Auto-loaded into every Claude session that cd's into this repo. Read it
before touching anything in `lib/`, `supabase/migrations/`, `api/`, or any
top-level `*.jsx`. The full session primer (architecture, deploy, demo
vs prod, Supabase rules) is `~/Desktop/repflow-session-primer.md` — read
both if you haven't seen this repo before.

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

- **Quote tool:** `page-quote.jsx` + `lib/rate-engine.js` +
  `lib/carrier-underwriting.json` + `public.product_underwriting_rules`.
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
