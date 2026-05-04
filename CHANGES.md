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
