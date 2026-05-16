# Repflow / Koino Insurance OS — Architectural Learnings

Captured from the multi-tenant onboarding rebuild (May 5–7, 2026). Intended audience: future Dispatch sessions touching this repo.

---

## 1. Multi-tenant identity chain (works end-to-end)

```
auth.users (Supabase auth)
   ↓ user_id
agency_members (role=owner|manager|rep|admin, active=bool)
   ↓ rep_id
reps (id text, agency_id, user_id, upline_id)
   ↓
public.me() RPC returns the joined row
   ↓
/api/me edge fn forwards JWT, returns me + downline_ids
   ↓
window.me() (lib/me.js) caches in sessionStorage, returns sync
```

**Three RPCs are the spine — DO NOT rebuild these from scratch:**
- `create_agency_for_owner(payload jsonb)` — first-run wizard calls this. Creates `agencies` + `reps` + `agency_members` (role='owner') in one txn.
- `mint_invite(p_agency_id, p_role, p_email_hint, p_upline_rep_id)` — owner/manager mints invite. Manager calls are scoped to their downline by the function body.
- `redeem_invite(p_token)` — first time the new user signs in, page-auth.jsx fires this. Inserts `reps` row with `upline_id = invite.upline_rep_id` and `agency_members` row.

**Onboarding flow (verified live):**
1. New user → `repflow.koino.capital` → magic link → click email → land back on same domain.
2. `loadTenant` checks for `agency_members` row → if none, `<FirstRun>` shows.
3. FirstRun has 3 branches: Start agency / Join via invite / Solo producer.
4. After completion, `repflow.firstRunDone` flag set, page reloads, app boots normally.

---

## 2. RLS pattern — `viewer_agency_ids()` helper

Migration `0015_tenant_isolation.sql`. Every tenant-scoped table uses:

```sql
create policy "tenant read X" on public.X
  for select to authenticated
  using (agency_id in (select public.viewer_agency_ids()));
```

The helper is `stable security definer` and joins `agency_members` filtered by `auth.uid() AND active=true`. **One line of policy SQL per new table.** 0017 (expenses) and 0016 (sms_outbox) both use this pattern.

**Demo carve-out** — anonymous viewers can read Atlas IMO (`e0a68c9f-cf48-47b0-bef7-dba3f27db0b9`) for the public demo at `?demo=1`:

```sql
create policy "anon atlas read X" on public.X
  for select to anon
  using (agency_id::text = 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9');
```

**Tables that previously leaked across tenants — fixed in 0015:**
- `commissions` — had blanket `using(true)`. Now scoped via parent `policies.agency_id`.
- `policies` — same. Added `agency_id` column + backfilled from `pipeline.agency_id`.
- `pipeline`, `queue`, `reps` — had `auth read using(true)`. Now scoped.

**If you add a new table with `agency_id`:** the sweep loop in 0015 auto-creates a tenant-read policy. Drop blanket `using(true)` if any pre-existed.

---

## 3. Magic link gotchas (the 3-layer fix)

Magic links break in three places at once. All must be aligned:

1. **Supabase project Auth → URL Configuration → Site URL.** Falls back here when `emailRedirectTo` isn't allowlisted. Default is `localhost:3000` — silent fail. **Fix via mgmt API:**
   ```bash
   curl -X PATCH https://api.supabase.com/v1/projects/<ref>/config/auth \
     -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
     -d '{"site_url": "https://repflow.koino.capital"}'
   ```

2. **Auth → URL Configuration → Additional Redirect URLs.** Empty by default → every `emailRedirectTo` rejected.
   ```bash
   ... -d '{"uri_allow_list": "https://repflow.koino.capital,https://repflow.koino.capital/**,..."}'
   ```

3. **Client `emailRedirectTo`.** Must match (or be in) the allowlist. `page-auth.jsx` uses an `ALLOWED_ORIGINS` array — prefers current origin if it's in the list, otherwise falls through to canonical prod.

**Custom SMTP**: not configured. Default Supabase mailer is rate-limited to ~3-4 emails/hour. For real agency onboarding, plug in Resend / Postmark / SES.

---

## 4. Lead routing pattern (UEP → Repflow)

`/api/leads/inbound` accepts a generic webhook payload and **branches on `kind` or source name:**

- `kind: "recruit"` OR source contains `careers|recruit|applicant` → inserts into `recruiting_applicants` + journals to `recruiting_messages`.
- Anything else → `pipeline` + `touchpoints`.

**External marketing site** (united-equity-partners) sends `kind: "recruit"` from careers form, `kind: "lead"` from book-a-call form. Single endpoint, two destinations.

**`AGENCY_ID` constant** in the marketing site's app.js is currently the demo agency UUID — swap to the real agency ID once it's created. Or set `window.UEP_AGENCY_ID` before `app.js` loads.

---

## 5. SMS local-agent fallback (Twilio not required)

Pattern: `/api/twilio-sms` is two-tier.
- **Tier 1**: Twilio if `TWILIO_*` env vars set.
- **Tier 2**: insert into `sms_outbox` (migration 0016) → return 202.

**Local agent** (`repflow-agent/local_sms_agent.py`) runs on rep's laptop:
- macOS + iPhone (Continuity): AppleScript drives Messages.app — sends iMessage, falls back to SMS.
- Linux/Windows + Android: `adb shell service call isms` (needs Developer Mode + USB or wireless ADB).
- Polls `/api/sms/outbox?op=claim` every 10s, atomically claims rows, reports `op=sent`/`op=failed`.

**Auth**: agent uses the rep's Supabase access JWT. `/api/sms/outbox` validates it via `/auth/v1/user`, scopes claims to the agent's `agency_members` rows.

**Install**: `curl -fsSL https://repflow.koino.capital/repflow-agent/install.sh | bash` registers as launchd (Mac) or systemd user service (Linux).

**Open gaps**: Windows + iPhone has no clean automation API for Phone Link. No agent-token rotation UI yet.

---

## 6. Demo-data discipline — `Shared.isDemoAgency()`

Every fallback to demo data MUST be gated:
```js
const isDemo = window.Shared?.isDemoAgency?.() || false;
const liveX = AppData.X || [];
const visible = liveX.length > 0 ? liveX : (isDemo ? DEMO_X : []);
```

Real agencies see empty-state CTA, not fake "Linda Cho / Cheryl Hampton" data leaking in. Closed in 0014 (`page-extras.jsx`, `page-ops-depth.jsx`, `page-owner.jsx`, `page-performance.jsx`).

**Once burned**: the rickroll incident — `dQw4w9WgXcQ` was used as placeholder YouTube ID in `DEFAULT_VIDEOS`. It also made it into 4 live `agency_videos` rows. If you need a placeholder, use empty `src: ""` + render an empty state.

---

## 7. Owner finance schema (migration 0017)

`agency_expenses` carries:
- `kind` taxonomy (lead_spend, recruiting_ad, marketing, saas, payroll, etc.)
- `paid_by` enum (agency, owner_personal, owner_amex, llc_card, rep_oop, manager_oop)
- `paid_by_rep_id` + `reimbursable` + `reimbursed_at` for OOP tracking
- `lead_source_id` FK → `agency_lead_sources` for ROAS attribution

`expense_allocations` — when one expense covers multiple reps, per-rep slices.

**RLS write policy is split**: owner/admin can do anything; managers can insert *only* `lead_spend | recruiting_ad | marketing | training | meals | travel`. This lets a manager log their team's lead buys without giving them write access to payroll.

**Views**: `v_rep_spend` (per-rep allocated + OOP + reimbursement), `v_lead_source_spend` (monthly per-source totals).

---

## 8. Recruiting page parity (owner ↔ manager)

Same component (`PageRecruiting`), same UI, scoped via `window.scopeRepIds()`:
- Owner: `null` → no filter, sees fleet.
- Manager: `[me.rep_id, ...downline_ids]` → filters applicants/campaigns by `recruiterId in scopeIds`.
- Rep: doesn't appear in nav.

**Tabs**: Invite team → Funnel → Conversations → Programs.
**Modals**: AddApplicantModal, AddCampaignModal, InviteTeamPanel.
**`mint_invite` from card**: must pass `p_agency_id` AND `p_upline_rep_id` (defaults to current viewer's rep_id so new rep slots under them).

**Bug log — silently broken:**
- `reps` table has NO `role` column. Role lives on `agency_members`. Filtering REPS by `r.role === "owner"` returns empty array. Always query `agency_members` directly for role.
- `recruiting_applicants` schema has no `phone`/`email`/`notes` columns. Stuff that data into `recruiting_messages` as a journal row instead.

---

## 9. Agency-level config — `lib/agency-config.js`

Single source of truth for tier targets, daily targets, dial caps, stage probabilities, AP fallbacks. Was previously duplicated across `page-manager.jsx` + `page-performance.jsx` + `page-floor.jsx`.

```js
const cfg = window.AgencyConfig.get();
const target = cfg.tier_targets[rep.tier];
```

- Loads from `agencies.config` jsonb on `me:loaded` event.
- Owner edits persist via `window.AgencyConfig.update({...})`.
- Broadcasts `agency-config:changed` for live UI updates.
- Hardcoded fallback when helper isn't loaded.

**If you find yourself copy-pasting a config object across page files, put it here.**

---

## 10. Live data wiring — derive don't hardcode

When you see a number on screen, ask: where does this come from? If it's a magic constant in JSX, it should derive from a real table. Recent fixes in `page-owner.jsx`:

- **Override revenue · MTD**: `sum(commissions.amount where kind='override' AND earned_at >= start_of_period)`
- **Book of business**: `sum(policies.ap where owner=rep.id)` — replaced `rep.mtd` proxy + magic 1.84M fallback
- **Persistency %**: `active_policies / total_policies` per scope
- **NIGO rate %**: `nigos / policies` per scope
- **Override %**: `override_commissions / producer_commissions` per scope
- **Recruiting funnel counts**: `recruiting_applicants` grouped by status

**Pattern for fallbacks**: `> 0 ? live : (isDemo ? hardcoded : "—")`. Real agencies see "—" until ledger populates.

---

## 11. In-flight work etiquette (multi-session)

This repo is touched by Dispatch + 4 local terminal sessions in parallel. Conflict avoidance:

- **Never commit unrelated dirty files.** Always `git reset HEAD -- .` then `git add <only your files>`.
- **Validate JSX/JS before commit:** `node -e "require('@babel/parser').parse(...)"`. Babel-standalone in the browser swallows parse errors silently → page renders blank.
- **Open one PR per logical change.** Lets the operator pick what to merge.
- **Quoter files are off-limits** unless you own the quoter work: `page-auto-quoter.jsx`, `page-quote.jsx`, `page-quote-card.jsx`, `agent/quote_agent.py`, `agent/scrapers/*`, `lib/rate-engine.js`, `quoter.html`.
- **Auto-merge isn't enabled.** Use `gh pr merge <n> --squash` directly. If conflict: `git merge origin/main && resolve && push && gh pr merge` again.
- **Vercel auto-deploys main.** No manual deploy step needed.

---

## 12. Things I'd build next

1. **Custom SMTP** for Supabase auth — Resend free tier covers 3K/mo. Magic-link rate limit will bite at ~5 simultaneous reps.
2. **Token rotation UI** — agent gets 401, needs a "Settings → Local Agent → Copy fresh token" button in the web app.
3. **Receipt upload** — `agency_expenses.receipt_url` column exists; vault bucket integration doesn't.
4. **Revenue events stream** — `revenue_events` append-only table that every feature writes to. Single source for ROAS, persistency, recruit ROI, reimbursement audit. Sketched in conversation but not built.
5. **Cross-sell sweep** is shipped (migration 0014 trigger + cron `/api/cron/cross-sell-sweep`) — verify it's actually firing in Vercel cron logs.

---

## 13. Process learnings — what cost real time this session

These are the failure modes that wasted iterations. Bake them into the front of the next session.

### Verify schema BEFORE writing SQL

Two-line cost up front:
```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='X' order by ordinal_position;
```
saves 5 schema-mismatch fix-and-retry rounds. This session bit me on:
- `policies.agency_id` didn't exist (had to denormalize from pipeline)
- `recruiting_messages.body_text` was actually `body`
- `reps.role` doesn't exist — role lives on `agency_members`
- `recruiting_campaigns.goal` no column
- `agency_invites.created_at` no column

Every one preventable. **Always grep `information_schema` first when writing INSERT/UPDATE/SELECT against an unfamiliar table.**

### Don't trust the audit — verify the claim directly

An Explore subagent claimed four tables and an RPC didn't exist (`agencies`, `agency_members`, `agency_invites`, `create_agency_for_owner`). All four existed. ~10 minutes wasted before I ran the actual query.

**Pattern**: when an agent reports "X is missing," confirm with one direct query before spending budget on rebuilding X.

### Demo-data gating is a default, not an afterthought

The rickroll (`dQw4w9WgXcQ` placeholder YouTube ID seeded into 4 live `agency_videos` rows) shipped because I treated demo fallback as a "we'll come back to it" pattern. Shipped via:

```js
const isDemo = window.Shared?.isDemoAgency?.() || false;
const visible = liveX.length > 0 ? liveX : (isDemo ? DEMO_X : []);
```

**The first time you write `const DEFAULT_X = [...]` for a render path, gate it.** Don't wait for the operator to catch a fake name.

### Invoke design skills BEFORE writing JSX

Memory entry `feedback_design_skills.md` is explicit: "On any UI/UX work, invoke `redesign-skill` (existing UIs) or `taste-skill`/`impeccable` (new components) BEFORE writing JSX."

This session I built two new surfaces (UEP marketing site, `/expenses` page) without invoking any of them. Output is decent but the discipline was bypassed. Skills that were sitting installed and unused:

- **`taste-skill` (leonxlnx)** — palette restraint, spacing rhythm, dashboard-vs-marketing typography
- **`impeccable` (pbakaus)** — component-level taste gate before disk write
- **`redesign-skill`** — convention-check existing pages before injecting new patterns
- **`mkt-page-cro`** / **`mkt-signup-flow-cro`** — for any conversion-critical form (UEP book-a-call, FirstRun wizard)
- **`mkt-onboarding-cro`** — for the agency-create flow (currently 8 steps, probably 2-3 too many)

### Use planning-with-files for multi-front rebuilds

The Manus persistent-markdown pattern (skill installed at `~/.claude/skills/planning-with-files/`) would have caught the schema mismatches before they hit migrations. Pattern:

1. Before touching SQL: write `.planning/<feature>.md` listing every column you're about to insert/select against, grouped by table.
2. Run the `information_schema` query, paste the actual columns next to your assumed columns.
3. Diff. Fix the assumed list. THEN write the migration.

This is exactly what got skipped on `0017_expenses` — caught a `goal` column that doesn't exist only after the modal was shipped to UI.

### One promptfoo assertion catches future RLS leaks

`promptfoo` is installed (`accelerants-r2/`). One assertion of the form:
```yaml
- name: "anon cannot read non-Atlas pipeline rows"
  vars:
    request: "GET /rest/v1/pipeline"
  asserts:
    - type: "every"
      value: "agency_id == 'e0a68c9f-cf48-47b0-bef7-dba3f27db0b9'"
```
catches the entire class of cross-agency leaks the next time someone adds a blanket `using(true)` policy. Add this to CI before next deploy.

### Verify deploys yourself, not via the operator

Per earlier session feedback: never ask "did it work?" Run `curl -sI` against the deployed URL. Check the build log if it returns the wrong content. The operator's time is for product judgment, not for poking deploys.

### Reports stay terse between cycles

End-of-turn summary: 1–2 sentences. What changed, what's next. Detail goes to commit messages and `LEARNINGS.md`. The temptation to recap a multi-step ship as a paragraphs-long table is real and should be resisted.

---

## 2026-05-16 — Quote tool DB hydration, Connect Source wizard, cross-IIFE hardening

### Cross-IIFE bare refs crash the whole app

Every `*.jsx` is wrapped in an IIFE by `scripts/build-jsx.mjs`. Bare
`<PageTeam/>` in `app.jsx` only works if `page-owner.js` ran first AND
assigned `window.PageTeam = PageTeam`. Cache mismatch, parse error, or
load order → `"Can't find variable: PageTeam"` → whole tab crashes on
render. **Fix shipped** — `F(key, props)` helper in `app.jsx` that falls
back to `<PageStub/>`. Same fragility exists in 30+ other files; codemod
when there's time.

```js
const F = (key, props = {}) => {
  const P = window[key];
  return P ? <P {...props}/> : <PageStub title={key.replace(/^Page/,'')} sub=""/>;
};
```

### Settings → Carriers had silent CHECK violations

UI passed `category: "Med Supp"` and `status: "paused"` — both fail the
DB CHECK constraint (23514). The generic save-failed toast hid the real
error. **Pattern:** when a Supabase insert/update generic-toasts, dump
postgres logs and look for 23514. UI enums and DB enums must be locked in
sync.

- `carriers.category`: `med_supp / medicare_advantage / final_expense /
  annuity / life / aca / dental / vision / part_d / other`
- `carriers.status`: `active / pending / inactive` (NOT
  paused/terminated)

### `provision_sub_agency` RPC requires `p_*` prefixed JS params

PostgREST is strict: `sb.rpc("provision_sub_agency", { name, slug, ... })`
returns `PGRST202 function not found` because the SQL signature is
`provision_sub_agency(p_name, p_slug, ...)`. **All our RPCs use `p_*`
prefix** — JS callers must match exactly. This single bug was what made
"Start a new agency" impossible for any new signup before today.

### AuthGate stale-me race fixed

`refreshTenant` was firing `window.refreshMe()` as fire-and-forget, then
`setTenant(t)`. AuthGate re-rendered with fresh `tenant.member` but stale
`me={role:"unmapped", needs_onboarding:true}` → `isUnmapped` true →
routed back to FirstRun → loop. **Fixed two ways:** `await refreshMe()`
BEFORE `setTenant`, AND short-circuit `isUnmapped` to false when
`tenant.member` exists. **Tenant.member is authoritative; me() is a
lagging cache.**

### Quote tool DB hydration pattern

`lib/rate-engine.js` keeps the `/lib/carrier-underwriting.json` fallback,
but adds `hydrateFromSupabase()` that runs on mount and overrides
`UW_GUIDES` with DB rows. Merge order: JSON first, DB second (DB wins per
carrier id). `recommendReasons()` reads `UW_GUIDES` transparently.

Rule-row → flat-field map:
- `tobacco` rule → `tobacco_rateup_pct`, `tobacco_notes`
- `build_chart` rule → `max_bmi`, `min_bmi`, `build_notes`
- `condition_rate_class { condition: 'diabetes' }` →
  `diabetes_accepted`, `diabetes_a1c_cap`, `diabetes_insulin`
- `condition_decline` rule → `auto_decline_conditions[]`
- `state_avail` rule → `state_exclusions_or_special[]`
- `face_amount` rule → `face_amounts`

### Connect-Source wizard pattern (page-crm.jsx)

`create_inbound_lead_source(p_agency_id, p_name, p_kind, p_vendor,
p_cost_per_lead_cents, p_field_map, p_notes)` is `SECURITY DEFINER`,
returns the new row with slug + 64-char hex HMAC secret. UI never holds
the entropy source. Webhook URL:
`/api/leads/inbound-source?source=<slug>`. HMAC verified server-side via
`x-repflow-signature: sha256=<hex>`. `field_map` jsonb maps provider's
keys → ours.

CSV upload: client-side parse with quoted-field handling, `auto_map`
heuristics by column header text, batch insert into `pipeline` 200 rows
at a time. `agency_id` MUST be explicitly set per row.

### Concurrent writers in the same repo

Eight `sprint/*` branches active in parallel, plus a
`claude/fervent-nobel-b93fcd` upstream agent. Every commit I made had to
`git stash push -u` of unrelated dirty files first (`icons.jsx`,
`shared.jsx`, `page-floor.jsx`, etc.). **Pattern:** stash → push → pop.
Don't `git checkout -- <file>` on dirty files you didn't touch — they're
another agent's in-flight work.

### `?v=N` cache-buster is hand-managed and lies

The version number in `<script src="dist/X.js?v=N">` is decoupled from
file content. Bumping the number doesn't verify what's actually
deployed. **Always `grep` for a known marker in `dist/page-X.js` after
building.** Long-term: switch to content-hashed filenames via esbuild
`--entry-names=[name].[hash]`.

### Migration files don't auto-apply

`supabase/migrations/*.sql` in tree ≠ applied to live DB. Use
`supabase db push` OR Supabase MCP `apply_migration`. Migration 0029
was in tree for days before I applied it.

### Vercel project access via MCP

Returns 403 (`koinocapital-7163s-projects` scope auth mismatch). To
verify a deploy, `curl https://repflow.koino.capital/dist/X.js?v=N` and
grep. The site has Vercel bot challenge enabled — `curl` may get a 403
HTML page; if so, run from a browser DevTools fetch to bypass.

---

*Generated 2026-05-07 by the Dispatch session that built tenant isolation, invite hierarchy, expenses, and the UEP marketing site. Update as you learn more.*

*Appended 2026-05-16 by the session that wired Quote tool to `product_underwriting_rules`, built the Connect-Source wizard, and hardened `app.jsx` against cross-IIFE crashes.*
