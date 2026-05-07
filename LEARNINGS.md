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

*Generated 2026-05-07 by the Dispatch session that built tenant isolation, invite hierarchy, expenses, and the UEP marketing site. Update as you learn more.*
