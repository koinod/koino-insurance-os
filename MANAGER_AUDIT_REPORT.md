# Manager-role audit — 2026-05-12

Branch: **`feat/role-audit-manager-2026-05-11`** (off `feat/onboarding-frontend-2026-05-11` @ `1f94472`)
Window: two sovereign passes (~6h total). Pass 1: scope + obvious dead handlers + DS swap. Pass 2: tab-by-tab drill of every button.
Push: **NOT** pushed to remote.

```
cca82e4 fix(settings): persist routing rules, kill fake cert KPIs, generic placeholder
610c5dd fix(recruiting): channel picker + error/success toasts + tighten cards
d1b7fc4 fix(pipeline): add manager Note/Alert on lead + Coach-owners bulk action
883c7dc fix(ops): kill hardcoded FB→MedSupp graph, add empty states, wire mailto
32fbc46 fix(leaderboard): wire period switcher, drop bogus delta column
748e681 fix(floor): drop hardcoded "+15125550100" demo phone fallback
70c575f fix(manager): wire Check-in + Call-now stubs, drop hardcoded transcript
ecc4717 docs: append DS swap to MANAGER_AUDIT_REPORT
9658fbb style(ds): adopt koino.capital website palette + tighten manager cards
73039ad fix(settings): SettingsNotifications loads + saves under real user id
17852fb fix(ops): wire dead chevron on workflow row to AI drill-down
6d1ef17 fix(pipeline): manager view scopes to downline via scopeRepIds()
c0455a2 fix(leaderboard): scope to downline + dead handlers + drop demo bleed
66525df fix(data): notificationCreate routes focus alerts to a specific rep
```

14 commits. Zero `main` touches. Zero remote pushes. All changed `.jsx` files compile under `@babel/standalone`.

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

### 6. `9658fbb` — `style(ds): adopt koino.capital website palette + tighten manager cards`

Ian's correction mid-pass: drop the OS amber-leaning oklch DS, align with
`KOINO/ventures/products/storefront-static/index.html` :root.

**`styles.css` :root** — token NAMES preserved; every existing call site
inherits automatically without editing the JSX:

- bg ladder → `#050505` / `#0d0d0d` / `#151515` / `#1a1a1a` (pure black; was warm oklch ~0.18-0.30 / hue 260).
- borders → `#1a1a1a` / `#2a2a2a`.
- text → `#e8e8e8` / `#888` / `#555` / `#3a3a3a`.
- `--accent-money` → **`#00d4aa`** (koino teal; was warm green oklch 0.78 0.18 152). Headline DS shift — every primary button + bar + chip + accent renders teal-on-black.
- `--accent-status` → `#7c3aed` (purple; was yellow). `--accent-heat / --state-warning` retain warm channels.
- `--state-danger / --warning / --info` → flat hex matching website's color system.
- Radii → 6 / 8 / 12 / 14 (was 4 / 6 / 10 / 14) — softer.
- `--row-h` → 32 (was 36) — denser default rows.
- `--shadow-floating` → tinted with `--accent-money` glow.

**Components** (`styles.css`):
- `.panel` — added subtle hover-border transition.
- `.panel-h` — padding `11px 14px` → `9px 12px`; titles 12.5px; meta 11px.
- `.btn-primary` — color `#001a14` (contrast on teal); hover `#00ebbe` with teal box-shadow.

**Manager-audit surfaces tightened** (per "smaller + cooler + tighter packing"):

- `page-leaderboard.jsx:109` — podium gap 14→10, card padding 18→14/12, leader rank → `--accent-money`, numbers in `--font-mono`.
- `page-leaderboard.jsx:146` — standings row height 44→36, avatar 22→20, rank column 40→32.
- `page-leaderboard.jsx:172` — badges panel padding 14→8/10, item padding 10→6/8, icons 14→12, gap 10→8. Tier + $50K badges → `--accent-money` for consistent green accent.
- `page-leaderboard.jsx:227` — live-floor panel padding 14→8/12, status banner in mono uppercase ("3 ON CALLS NOW") matching website's `.tag` style.
- `page-extras.jsx:3252` — `SettingsNotifications` row padding 10→8, on-state shows mono uppercase "On" / "Off" in `--accent-money` (was the wordy "Email + push" text). Checkbox uses `accent-color: var(--accent-money)`.

Cache busters: `styles.css?v=78`, `page-extras.jsx?v=84`, `page-leaderboard.jsx?v=78`.

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

---

## Pass 2 — tab-by-tab drill (2026-05-12, second cycle)

Ian's note after pass-1 finished at 41 turns: "RESUME tab-by-tab. Drill every horizontal nav + sub-tab + button on the manager surface. For each button: wired? stub? hardcoded? — fix in priority Engineering → UX → UI."

Findings + fixes per page (in commit order):

### `70c575f` — `fix(manager): wire Check-in + Call-now stubs, drop hardcoded transcript`

Pass-1 declared page-manager.jsx "clean" because the visible buttons all had onClicks. Pass-2 found two that **had** onClicks but the handlers were stubs disguised as wired:

- **page-manager.jsx:974 `sendCheckIn`** — toast-only stub. Showed "Check-in sent to {rep}" with zero side effects. No notification created, no message sent. Fixed: now calls `AppData.mutate.notificationCreate({ kind: "checkin", severity: "info" })` so the alert actually lands in the rep's bell.
- **page-manager.jsx:975 `callRep`** — dialed `"+15125550" + rep.id.slice(0,3)`. Fabricated demo phone numbers. REPS table has no phone column at all. Fixed: try real phone from `rep.phone / cell / mobile`, fall back to a `kind: "call_request"` notification ("Your manager wants to talk").
- **page-manager.jsx:633 ReplayMomentModal** — hardcoded fake transcript when no recording was linked ("So, do you take any medications?" / "metformin, blood pressure..."). Pure demo bleed. Fixed: empty state pointing at coaching focus + an `ai:ask` CTA for next-call phrasing.
- **page-manager.jsx:678** — hardcoded "What to try next time" suggestion ("Walk me through what your morning looks like with those medications"). Same shape, same fix — removed.
- **page-manager.jsx:956 routing rule toggle** — icon semantics: Check↔X was confusing because Delete is also an X. Now Pause↔Play.

### `748e681` — `fix(floor): drop hardcoded "+15125550100" demo phone fallback`

- **page-floor.jsx:668 `RepActionQueue.fire`** — `const phone = lead.phone || "+15125550100";` would route real SMS / autodial to a fake number for any lead without a phone, then silently mark the run as queued. Fixed: missing phone → warn toast + abort; followupDispatch now wrapped in try/catch so backend errors surface.

### `32fbc46` — `fix(leaderboard): wire period switcher, drop bogus delta column`

- **page-leaderboard.jsx:38 period switcher** — Today / WTD / MTD pills set state but the data never changed. `sorted` always read `r.mtd`. Three dead buttons disguised as a working tab strip. Fixed: `periodValue()` callback returns the right field per period (Today→r.today, MTD→r.mtd, WTD→sum from POLICIES issued since start-of-week). `sorted`, `max`, `displayMtd`, and the export now all read `periodValue`. Export column header renamed `MTD AP` → `{period} AP`.
- **page-leaderboard.jsx:165 Δ column** — position-derived ("top 3 → up arrow, bottom → down arrow"). No historical rank tracking. UI lie. Dropped entirely. 7 columns → 6.

### `883c7dc` — `fix(ops): kill hardcoded FB→MedSupp graph, add empty states, wire mailto`

- **page-ops.jsx:316 PageWorkflows right pane** — one hardcoded "FB Lead → Med Supp queue" SVG (6 nodes: FB Lead form / Enrich / T65 check / LeadiD verify / Speed-route / Vapi call back) rendered regardless of which workflow was selected. Decoration that lied about every workflow being the same shape. Fixed: new `WorkflowGraph` reads the selected workflow's `graph: { nodes, edges }` metadata; falls back to empty state pointing at last-run + run count. Selecting a row in the left list now toggles the graph pane.
- **page-ops.jsx:162 "Schedule call with ops"** — toast-only stub. Now opens user's mail client via `mailto:` with pre-filled subject + body.
- **page-ops.jsx:155 PageHardware** — `AppData.HARDWARE` is empty for real agencies after P1, but the map rendered zero cards with no empty state. Added "No hosts enrolled" panel with CTA.
- **page-ops.jsx:243 PageAgents** — same pattern, same fix.
- **page-ops.jsx:380 `WorkflowRequestBar`** — now takes the selected workflow as a prop; placeholder/state reflect it (was a free-floating textbox firing `ai:ask` with no workflow context).

### `d1b7fc4` — `fix(pipeline): add manager Note/Alert on lead + Coach-owners bulk action`

Pass-1 added manager scope. Pass-2 added the manager-coaching surface the brief asked for:

- **page-pipeline.jsx:386 LeadDetail footer** — two new manager-only actions (Note + Alert) hidden when `role === "rep"` or the deal is unowned. Open lead-scoped modals pre-filled with deal context (stage, days-in-stage, AP). Routes through the same `coachingNoteCreate` / `notificationCreate` path the Team Board uses.
- **page-pipeline.jsx:584 LeadCoachingNoteModal** — default body templates with `On {lead} ({product}, {stage}, {days}d, {ap})`. Validates the manager edited past the default before save.
- **page-pipeline.jsx:617 LeadFocusAlertModal** — three deal-specific presets ("Move forward", "Call back today", "Add app docs"). Same severity / title / body shape as the Team Board alert.
- **page-pipeline.jsx:88 bulk-action** — new "Coach owners on these deals" option (manager + owner only). Selecting it swaps the value picker for a textarea; submit fans out a `coachingNoteCreate` to each unique owner of the selected leads.

### `610c5dd` — `fix(recruiting): channel picker + error/success toasts + tighten cards`

- **page-recruiting.jsx:408 `ConversationDetail.send`** — hardcoded `channel: "instagram"` regardless of how the conversation started. Fixed: prefer the latest inbound message's channel, fall back to campaign source, fall back to instagram. Added `Shared.Select` in the composer so the recruiter can override per-message. Sending state added.
- **page-recruiting.jsx:412 `ConversationDetail.advance`** — fire-and-forget with no try/catch and no success toast. Same shape on `ApplicantCard.advance` (line 261) and `CampaignCard.toggle` (line 526). All three: async + try/catch + success toast naming the new stage/state.
- **page-recruiting.jsx:443 outgoing message bubble** — tinted with `var(--accent-action)` which is **undefined** in the OS DS, so bubbles rendered transparent. Switched to `--accent-money`.

### `cca82e4` — `fix(settings): persist routing rules, kill fake cert KPIs, generic placeholder`

Biggest stub in the whole audit lived here:

- **page-extras.jsx:3107 SettingsRouting** — **pure local React state.** `setRules()` updated the array in memory, "Rule added" toast fired, user closed the modal, refresh — **every rule vanished.** Zero Supabase persistence. The page-manager `RoutingRulesModal` was already wired through `AppData.mutate.routingRuleSave / routingRuleDelete`; this Settings surface was a separate orphaned copy that did nothing. Fixed: load existing rules from `public.routing_rules` on mount, persist every add / edit / delete / weight-drag through the same mutators. Demo agencies keep the in-memory seed for the sandbox tour.
- **page-extras.jsx:1625 ProductTraining KPI strip** — two hardcoded fake numbers: "Cert progress 62% · AEP 2026 cert" and "CE hours · YTD 14.5". Every agency saw the same fake stats. Dropped both cards. Restore plan: re-add when `v_user_metrics` surfaces cert + CE counts.
- **page-extras.jsx:1418 ScriptsLibrary placeholder** — "Hi {{lead\_name}}, this is {{rep\_first}} with Atlas..." → "with {{agency\_name}}...".

---

## Pass-2 summary

Pass 1 fixed scoping + obvious dead handlers + the DS swap (6 commits). Pass 2 found 14 additional bugs that survived the first read because they looked plausible:

| Severity | Bug | File:line |
|----------|-----|-----------|
| Critical | Routing rules don't persist (local state only) | page-extras.jsx:3107 |
| Critical | Fake "+1 512 555-0xxx" phone dial on rep call-now | page-manager.jsx:975 |
| Critical | Fake "+15125550100" phone for SMS/autodial fallback | page-floor.jsx:668 |
| High | Notification alerts broadcast (missing recipient_rep_id) | data.jsx:1481 (pass-1) |
| High | Period switcher (Today/WTD/MTD) is dead state-only | page-leaderboard.jsx:38 |
| High | Check-in button is toast-only stub | page-manager.jsx:974 |
| High | Hardcoded coaching transcript fallback | page-manager.jsx:633 |
| High | Hardcoded "FB → Med Supp" workflow graph | page-ops.jsx:316 |
| Medium | Recruiting message channel hardcoded "instagram" | page-recruiting.jsx:408 |
| Medium | Fake "Cert 62% / CE 14.5" KPI cards | page-extras.jsx:1625 |
| Medium | Bogus Δ column on standings (position-derived) | page-leaderboard.jsx:165 |
| Medium | Stage transitions silent on success/failure | page-recruiting.jsx:261,412,526 |
| Medium | `--accent-action` token used but undefined | page-recruiting.jsx:443 |
| Low | "Atlas" hardcoded in script editor placeholder | page-extras.jsx:1418 |
| Low | "Schedule call with ops" was toast-only | page-ops.jsx:162 |
| Low | PageHardware / PageAgents no empty state | page-ops.jsx:155,243 |
| Low | Routing rule toggle icon Check↔X confusing | page-manager.jsx:956 |

All fixed in pass 2. UI surfaces also tightened per koino.capital DS (smaller padding, mono labels in uppercase with letter-spacing, --accent-money replacing yellow status, denser packing on every card).

---

## Push-ready checklist

- [x] 14 commits land cleanly on branch `feat/role-audit-manager-2026-05-11`
- [x] No commits on `main`
- [x] No remote pushes
- [x] All changed `.jsx` files compile under `@babel/standalone`
- [x] Cache busters bumped: `styles.css?v=78`, `page-manager.jsx?v=78`, `page-pipeline.jsx?v=78`, `page-ops.jsx?v=78`, `page-leaderboard.jsx?v=79`, `page-recruiting.jsx?v=77`, `page-extras.jsx?v=85`
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
