# CHANGES — gap-analysis/2026-05-03

Append-only log of every gap closure on this branch.
Format: `[YYYY-MM-DD HH:MM] GAP-XX — what changed — files`

---

## 2026-05-03

- **23:50  GAP-X4** — auth identity link foundation. Migration `0004_auth_identity_link` adds `reps.user_id`/`agency_id`/`upline_id`, `public.me()` returns the current viewer, `public.downline_of(rep_id)` returns recursive subtree. New `/api/me` edge function and `/lib/me.js` frontend helper expose `window.me()`, `window.scopeRepIds()`, `window.canSeeFleet()`, `window.canSeeTeam()`. Atlas demo agency seeded; demo reps backfilled with `agency_id` and an upline tree (Marcus root). Files: `supabase/migrations/0004_auth_identity_link` (Supabase RPC), `api/me.js` (new), `lib/me.js` (new), `index.html` (script load order).

- **23:55  GAP-X3** — AI co-pilot agency-scope filter. `sbSelect()` accepts an `agencyId` and force-injects `agency_id=eq.{...}` into every PostgREST URL when present (fallback retry on 400 for tables that don't yet have the column). New `resolveAgencyId()` calls `public.me()` once per request to derive scope from the JWT. All 8 tools updated to thread the agency through their fetch signature. Files: `api/copilot.js`.
