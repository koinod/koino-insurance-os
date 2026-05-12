# Manager-role audit — 2026-05-12

Branch: **`feat/role-audit-manager-2026-05-11`** (off `feat/onboarding-frontend-2026-05-11` @ `1f94472`)
Window: ~3-hour sovereign pass against the manager surfaces — Floor, Leaderboard, Ops, Pipeline, Recruiting, Team Board, Coaching, and Settings → Profile / Notifications / Scripts.
Push: **NOT** pushed to remote.

```
73039ad fix(settings): SettingsNotifications loads + saves under real user id
17852fb fix(ops): wire dead chevron on workflow row to AI drill-down
6d1ef17 fix(pipeline): manager view scopes to downline via scopeRepIds()
c0455a2 fix(leaderboard): scope to downline + dead handlers + drop demo bleed
66525df fix(data): notificationCreate routes focus alerts to a specific rep
```

5 commits. Zero `main` touches. Zero remote pushes. All changed `.jsx` files compile under `@babel/standalone`.

---

## Pre-fix audit notes

### page-manager.jsx — clean
- `scopedReps()` (page-manager.jsx:67) already filters via `window.scopeRepIds()`. Owner null = unfiltered. Rep me() not loaded yet returns `[]` and falls back to full REPS so the page can render — correct behaviour.
- `CoachingNoteModal` (page-manager.jsx:324) and `FocusAlertModal` (page-manager.jsx:358) wire correctly into `AppData.mutate.coachingNoteCreate` and `AppData.mutate.notificationCreate`.
- `RoutingRulesModal` (page-manager.jsx:859) uses `AppData.mutate.routingRuleSave / routingRuleDelete`.
- `RepDrillSlideout` (page-manager.jsx:968) wires Note + Call actions correctly.
- Only finding: **the modals themselves were correct, but the underlying `notificationCreate` in `data.jsx` dropped the `recipient_rep_id` column**. Fixed (see below). No edits needed in `page-manager.jsx` itself.

### page-floor.jsx — clean for managers
- `CallRecorderPanel` (page-floor.jsx:157) scope selector defaults to "team" for non-rep roles and uses `CallRecorderUtils.listRecentCalls({ scope })` — server-side RLS handles the agency boundary.
- `FloorTopStrip` (page-floor.jsx:343) shows the manager's own MTD/queue/tasks — acceptable; the manager can also dial from the floor. Not changing.
- `FollowupsMode` (page-floor.jsx:558) scopes templates + assignments through `window.scopeRepIds()` (line 590-596) — correct.
- No edits needed.

### page-leaderboard.jsx — was broken (now fixed)
Pre-fix issues:
- page-leaderboard.jsx:8 — `[...REPS]` was not scoped to manager downline. Manager saw the full agency.
- page-leaderboard.jsx:37 — hardcoded `"Atlas Insurance"` agency name (would leak into any agency's display).
- page-leaderboard.jsx:41 — period pill included "AEP" even though P8 archived the AEP surface across the rest of the app.
- page-leaderboard.jsx:61 — "Issue challenge" button had **no onClick** (dead handler).
- page-leaderboard.jsx:130-148 — "Recent badges" panel was hardcoded to Dani Rivera / Marcus Avila / Tony Park / Kira Walsh. Demo bleed into every agency.
- page-leaderboard.jsx:144 — the badge "comment" icon had **no onClick** (dead handler).
- page-leaderboard.jsx:152-165 — "AEP war-room" panel was hardcoded "6 producers in voice · Power Hour 4-5p". Demo bleed + tied to the archived AEP surface.
- `index.html:227` had been routing the `leaderboard` slot to `PagePerformance` for **every** role with the comment "page-leaderboard.jsx was removed", even though the file still existed.

### page-ops.jsx — small bug
- page-ops.jsx:317 — in `PageWorkflows`, the `ChevronRight` icon button on each workflow row had **no onClick** (dead handler — the only visible disclosure indicator).
- The rest of `PageConnections / PageHardware / PageAgents / PageWorkflows` was clean.

### page-pipeline.jsx — manager scope missing (now fixed)
Pre-fix issues:
- page-pipeline.jsx:41 — `const scoped = role === "rep" ? all.filter(p => p.owner === meId) : all;`. Manager fell through to "all" — they saw the entire org pipeline.
- page-pipeline.jsx:282 — Filter modal Owner picker used `REPS` (every rep in the agency).
- page-pipeline.jsx:309 — New-lead form Owner picker used `REPS`.
- page-pipeline.jsx:331 — Bulk-action Reassign picker used `REPS`.
- page-pipeline.jsx:458 — Lead-detail Owner select used `REPS`.

### page-recruiting.jsx — clean
- `useScope()` (page-recruiting.jsx:57) reads `me / scopeRepIds / canSeeFleet`.
- `filterByScope` (page-recruiting.jsx:87) scopes applicants by `recruiterId` and campaigns by `ownerRepId` for managers; owner sees fleet.
- `AddCampaignModal` (page-recruiting.jsx:641) sets `owner_rep_id` to the viewer's rep_id, so the new campaign appears in their own downline scope.
- `ApplicantCard.sendInvite` (page-recruiting.jsx:271) wires `mint_invite` RPC + clipboard copy.
- No edits needed.

### Settings → Profile / Notifications / Scripts
- **Profile** (page-extras.jsx:3290) — already rewritten in P6/P7. Loads `get_my_profile()`, controlled inputs, `save_profile()` on click, role-gated Licensing panel. Clean.
- **Notifications** (page-extras.jsx:3189) — was calling `notificationPrefsSave("me", next)` with the literal string `"me"` as the user_id. RLS would reject this; saves were silently dropping. Also there was a dead duplicate `SettingsNotifications_OLD` (page-extras.jsx:3225) sitting next to it.
- **Scripts** (page-extras.jsx:1270) — `ScriptsLibrary` reads `AppData.SCRIPTS_LIB`, falls back to `DEFAULT_SCRIPTS` when `isDemoAgency()`, and wires through `scriptUpsert / scriptDelete`. The only blemish was the placeholder text on line 1418 referencing "with Atlas..." — left in place since it's an example string in a placeholder, not a runtime label.

---

## Engineering fixes (commits)

### 1. `66525df` — `fix(data): notificationCreate routes focus alerts to a specific rep`

**Bug**: the manager's "Send focus alert" modal (`page-manager.jsx:386-419`) passes the target `repId`. `data.jsx`'s `notificationCreate` was mapping that to `ref_id` only — `recipient_rep_id` (the column added by migration `0011_notifications_recipient.sql` that the SELECT policy keys on) was always null. Result: every per-rep alert landed as an agency-wide broadcast and every rep got the ping.

**Fix**: `data.jsx:1481`
- `create_notification` RPC call now also passes `p_recipient_rep_id`.
- Fallback direct insert now sets `recipient_rep_id` AND `agency_id` (from `me().agency_id`).

Also tightened `coachingNoteCreate` (`data.jsx:1436`) to set `agency_id` explicitly with a column-missing fallback, so it works on deployments before and after the `0015_tenant_isolation` sweep alters the table.

### 2. `c0455a2` — `fix(leaderboard): scope to downline + dead handlers + drop demo bleed`

**Engineering**
- `page-leaderboard.jsx:7` — `sorted` now filters `AppData.REPS` via `window.scopeRepIds()` so managers see their downline only; owners get the full agency (`null` scope).
- `page-leaderboard.jsx:62` — "Issue challenge" button now dispatches `ai:ask` with a scope-aware prompt (was a no-op).
- `page-leaderboard.jsx:142` — derived-badge congrats button now calls `coachingNoteCreate` (was a no-op icon-only).

**UX**
- `page-leaderboard.jsx:37` — hardcoded "Atlas Insurance" replaced with `me().agency_name`; subline differentiates downline vs. agency-wide.
- `page-leaderboard.jsx:41` — dropped "AEP" period pill (P8 archived).
- `page-leaderboard.jsx:101` — empty-state when no producers in scope, deep-links to Recruiting.
- `page-leaderboard.jsx:130` — hardcoded Dani/Marcus/Tony/Kira badges replaced with a derivation from real rep signals (streak, tier, MTD). Empty state when nothing's earned.
- `page-leaderboard.jsx:152` — "AEP war-room" panel replaced with a presence-based "Live floor" panel that derives from `rep.presence`.

### 3. `6d1ef17` — `fix(pipeline): manager view scopes to downline via scopeRepIds()`

**Engineering**
- `page-pipeline.jsx:18` — `scopedRepIds` + `ownerOptionReps` (downline-only for managers, full REPS for owners, `null` = no filter).
- `page-pipeline.jsx:50` — scoped list filter splits: rep / manager-with-downline / owner. Manager keeps unowned rows visible so they can route inbound leads to their team.
- `page-pipeline.jsx:301` — filter modal Owner picker → `ownerOptionReps`.
- `page-pipeline.jsx:328` — new-lead Owner picker → `ownerOptionReps`.
- `page-pipeline.jsx:350` — bulk-action Reassign picker → `ownerOptionReps`.
- `page-pipeline.jsx:359` — `LeadDetail` accepts `assignableReps` prop so the drawer's Owner select respects manager scope.

Re-renders on `me:loaded` + `data:hydrated` so a manager landing on `/pipeline` before their `downline_ids` resolve gets the correct scope on first paint.

### 4. `17852fb` — `fix(ops): wire dead chevron on workflow row to AI drill-down`

- `page-ops.jsx:317` — the `ChevronRight` icon button at the end of each workflow row had no `onClick`. Now dispatches `ai:ask` with a workflow-specific prompt.

### 5. `73039ad` — `fix(settings): SettingsNotifications loads + saves under real user id`

**Engineering**
- `page-extras.jsx:3189` — `SettingsNotifications` resolves the auth user id from `supabase.auth.getSession()` on mount, hydrates from `notification_prefs.maybeSingle()`, and saves with success/error toasts.
- `page-extras.jsx:3225` — drop the dead duplicate `SettingsNotifications_OLD`.

**Wiring**
- `index.html:44` — add `<script src="page-leaderboard.jsx?v=77">` so the leaderboard scope work I did in commit 2 actually loads (the file had been orphaned).
- `index.html:227` — owner falls through to `PagePerformance` (combined Performance / Tiering / Forecast); manager + rep get `PageLeaderboard` with `scopeRepIds()` downline restriction. Matches the comment at the top of `page-performance.jsx`.
- Cache busters bumped: `page-pipeline.jsx?v=77`, `page-manager.jsx?v=77`, `page-ops.jsx?v=77`, `page-extras.jsx?v=83`, `page-leaderboard.jsx?v=77`.

---

## What's NOT done (deferred / out of scope)

- **`viewer_agency_ids()` per-query injection**: the frontend already relies on RLS to do this at the API layer (every SELECT on tenant-scoped tables is filtered server-side via `agency_id in (select public.viewer_agency_ids())` per `0015_tenant_isolation.sql`). Adding a redundant `.in("agency_id", viewer_agency_ids())` from the client would be belt-and-suspenders and would mean fetching the helper output to the browser. Not changing.
- **`page-floor.jsx` `FloorTopStrip` "Today's number" for managers**: currently shows the manager's own MTD. Reasonable since managers also dial. A "team MTD rollup" would be a feature add, not an audit fix — deferred.
- **`page-leaderboard.jsx` rep-level masking edge case** when `meIdent?.rep_id` is null and there are no scoped reps: `myId` now falls back to `sorted[0]?.id` which is fine when the list is non-empty, undefined when empty (the empty-state renders instead so no broken UI).
- **`agency_notifications` create_notification RPC**: I added `p_recipient_rep_id` to the call signature, but the RPC itself is **not in the tracked migrations**. The fallback insert still works; if/when someone adds the RPC, it should accept `p_recipient_rep_id`. The contract is now correct on the client side regardless.
- **Routing-rules natural-language parser** (page-manager.jsx:846): handles "send X to Y" / "route X to Y" / arrow forms. Doesn't handle conditional clauses ("in Tampa go to gold+") — the rule gets saved with the whole clause as the `source`. Acceptable for v1, deferred as a parser improvement.

---

## RPCs / tables this branch assumes exist

- `public.notification_prefs` (`user_id uuid PK`, `prefs jsonb`) — used by `SettingsNotifications`.
- `public.agency_notifications` — `agency_id, kind, severity, title, body, page_link, ref_id, recipient_rep_id` (migration `0011_notifications_recipient.sql` added `recipient_rep_id`).
- `public.coaching_notes` — `session_id, rep_id, body, created_by` (migration `0002`). The `agency_id` column is added by the `0015_tenant_isolation` sweep on any table that has the column; if absent, the data layer drops the key and retries.
- `viewer_agency_ids()` SECURITY DEFINER helper (migration `0015`) — used by RLS, not called from frontend.

If `recipient_rep_id` is missing in production (i.e., migration 0011 didn't run), the fallback insert will throw with `column "recipient_rep_id" of relation "agency_notifications" does not exist` and the toast will surface it — that's the intended fail-loud behaviour.

---

## Push-ready checklist

- [x] All 5 commits land cleanly on branch `feat/role-audit-manager-2026-05-11`
- [x] No commits on `main`
- [x] No remote pushes
- [x] All changed `.jsx` files compile under `@babel/standalone`
- [x] Cache busters bumped (`?v=77` on the four touched JSX files, `?v=83` on `page-extras.jsx`)
- [ ] Local smoke test in a browser (Ian to run — `python -m http.server 8000`)
- [ ] `git push origin feat/role-audit-manager-2026-05-11` (Ian to run)

---

## Verify steps

1. Sign in as a manager with at least one rep under them.
2. **Manager → Team Board** — only your downline reps appear as cards. Click "Note" on a card → save → reload Team Board → note appears under "Recent coaching notes" in the rep drill-down.
3. **Manager → Team Board → Alert** — send a focus alert. Sign in as the targeted rep → bell shows the alert; sign in as a different downline rep → bell does NOT show the alert. (Previously every rep saw it.)
4. **Leaderboard** — only downline reps show in podium + standings. Hardcoded Dani/Marcus/Tony/Kira badges are gone; you see "No badges yet" until someone earns one. Period pills no longer include "AEP".
5. **Pipeline** — only deals owned by downline reps (plus unowned rows you can route) appear in list / kanban / filter Owner picker / new-lead Owner picker / bulk-Reassign.
6. **Ops → Workflows** — chevron at the end of each workflow row opens an AI drill-down (was a no-op).
7. **Settings → Notifications** — toggle a checkbox → toast "Notification prefs saved". Sign out, sign back in → toggle state persists (previously it didn't).
