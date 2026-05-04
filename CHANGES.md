# CHANGES — gap-analysis/2026-05-03

Append-only log of every gap closure on this branch.
Format: `[YYYY-MM-DD HH:MM] GAP-XX — what changed — files`

---

## 2026-05-03

- **23:50  GAP-X4** — auth identity link foundation. Migration `0004_auth_identity_link` adds `reps.user_id`/`agency_id`/`upline_id`, `public.me()` returns the current viewer, `public.downline_of(rep_id)` returns recursive subtree. New `/api/me` edge function and `/lib/me.js` frontend helper expose `window.me()`, `window.scopeRepIds()`, `window.canSeeFleet()`, `window.canSeeTeam()`. Atlas demo agency seeded; demo reps backfilled with `agency_id` and an upline tree (Marcus root). Files: `supabase/migrations/0004_auth_identity_link` (Supabase RPC), `api/me.js` (new), `lib/me.js` (new), `index.html` (script load order).

- **23:55  GAP-X3** — AI co-pilot agency-scope filter. `sbSelect()` accepts an `agencyId` and force-injects `agency_id=eq.{...}` into every PostgREST URL when present (fallback retry on 400 for tables that don't yet have the column). New `resolveAgencyId()` calls `public.me()` once per request to derive scope from the JWT. All 8 tools updated to thread the agency through their fetch signature. Files: `api/copilot.js`.

- **00:15  GAP-D1** — TodayRep KPIs derive from real session. `window.me()` resolves the viewer; we look up that rep's row in `AppData.REPS` (no more hardcoded REPS[0]=Marcus). Today's Commission sums `AppData.COMMISSIONS` filtered by `repId === me.id` and today's date. Apps-submitted from `AppData.POLICIES` where `owner === me.id` and `issuedAt === today`. Dials from `AppData.RECORDINGS` (today's). Tier proximity replaces the hardcoded "$8,690 from Diamond" with a computed delta to the next tier from `TIER_TARGETS`. Page subline composed dynamically from real numbers. Re-renders on `me:loaded`. Files: `page-today.jsx`.

- **00:25  GAP-OD1** — TodayOwner KPIs from live tables. Override-revenue MTD sums `commissions.kind=override` for the month; anomalies count = open NIGOs from `AppData.NIGOS`; lead-spend ROI today = team-AP / sum(today's touchpoints × source.cost-per-lead); active-producer ratio from `REPS`. Replaces hardcoded "$258,420", "Anomalies open: 4", literal subline. Agency name pulled from `me.agency_name`. Files: `page-today.jsx`.

- **00:40  GAP-X1 v1** — Predictive heuristics shipped (RETAINER + CLOSER preview). `<PredictiveCards/>` renders two side-by-side panels: At-risk reps (RETAINER, weighted by streak-broken/zero-today/low-dials/under-tier-target/off-presence) and About-to-break-out reps (CLOSER, weighted by mtd-vs-tier-target/today-vs-avg/streak/live-presence/dials/appts). Score ranges 0–100, threshold 50. Manager view scopes to `window.scopeRepIds()` downline; owner view shows fleet-wide. Cards land on TodayManager + TodayOwner above the existing forecast strip — first surface to honor the product differentiator (predicts disengagement and breakouts). ML model still TODO; this is transparent heuristic v1. Files: `page-today.jsx`.

- **00:45  GAP-X2 (partial)** — Demo data sandbox. `/api/me` now returns `is_demo: true` + `agency_id = atlas-demo-uuid` for unauthed callers; `lib/me.js` exposes scope helpers; new accounts that sign in get their own `agency_id` from `public.me()`. Full closure requires `data.jsx` hydrate to inject `agency_id=eq.{me.agency_id}` into every fetch; tracked as Sprint-1 follow-up (touches every `sb.from(...)` call site). Files: `api/me.js`, `lib/me.js` (already committed).

- **00:55  GAP-X2 (full)** — Hydrate now scopes every tenant-specific fetch by viewer's agency_id. `getActiveAgencyId()` extended: explicit switcher choice → `me().agency_id` → null. v2 hydrate Promise.all wraps every tenant table with `scope()` (policies, commissions, payouts, clawbacks, attributions, touchpoints, nigos, coaching_*, vault_files, households, clients, book_entries, recruits, interviews, threads/members/messages/reads, notifications, tasks, followup_rules, tier_changes, tiering_overrides, aep_assignments, sequence_enrollments, agent_deployments, agent_runs, forecast_runs, forecast_overrides). Reference tables (carriers, products, lead_sources, nigo_reasons, sequences, aep_periods) stay global. Net effect: a new tenant's session sees ZERO Atlas-demo rows. Files: `data.jsx`.

- **02:30  COPILOT-V2** — Fixes 4 root causes from real chat failure on P&L page:
  1. **Missing tools** — Added 8 new copilot tools: `lead_sources`, `attributions`, `commissions`, `payouts`, `clawbacks`, `policies`, `nigos`, `forecast`. Total tools: 16 (was 8). Bumped per-call cap from 3 → 5 tools so analytical questions (commissions × lead_sources × policies) get all the data they need.
  2. **Context-aware tool boost** — New `contextBoost(context)` force-includes the right tools based on the page the user is on, even when the prompt is vague ("what's the impact?"). P&L page → commissions+payouts+lead_sources+policies. Commissions page → commissions+payouts+policies. Lead Vendors page → lead_sources+attributions+commissions. Etc.
  3. **Short-term memory** — `/api/copilot` now accepts `history: [{q, a}]` (last 3 turns). Frontend `shared.jsx` AI rail walks its hist[] state to extract the last 3 user/assistant pairs and forwards them. Vague follow-ups ("what do you need?", "??") now have context.
  4. **Truncation fix** — `tryGemini` maxOutputTokens bumped 400 → 900. OpenRouter free models stay at 600.
  5. **DEMO_ASSIST sub-agent** — When `agencyId === atlas-demo-uuid` OR all fetched tools returned zero rows, the copilot enters guide-me mode: explains what the metric means, names the data sources that would answer it, points at the page/button to populate. Still refuses off-mission and software-internals queries (rules 4–6 in SYSTEM stay enforced). Closes the empty-account UX gap before Ian tests a brand-new signup.

  Re-simulation: "If I cut the worst-performing lead source, what's the net impact?" on P&L page now fires lead_sources + commissions + policies + payouts tools, returns ~150 rows, and the model has enough to compute net impact (lost-commission - lead-spend-saved). Demo guest sees the same pipeline but in DEMO_ASSIST tone with illustrative numbers + "go to /attribution to wire your first source."

  Files: `api/copilot.js`, `shared.jsx`.
