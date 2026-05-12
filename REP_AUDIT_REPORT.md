# Rep-role audit — 2026-05-12 (deep-drill pass)

Branch: `feat/role-audit-rep-2026-05-11` (off `feat/onboarding-frontend-2026-05-11`)
Time box: 3 hours, sovereign execution. NOT pushed to remote.

Scope: every surface a `role="rep"` viewer actually touches — drilled
**every button, every handler, every number** across:
`page-today`, `page-pipeline` (rep scope), `page-queue`, `page-mobile`,
`mobile-screens`, `mobile-extra-screens`, and the four `Settings` tabs
the rep sees (Profile / Notifications / Calling / Agents).

**16 commits** on top of `1f94472` (P7/P8 onboarding tip):

```
f4d2087 style(settings/rep): koino teal primaries on Save / Install / Edit Profile / Fire test
858ecb8 feat(mobile-extra/rep): scope Pipeline to me + smart default stage + koino chips
5a6f90a feat(mobile-screens/rep): wire every stub button + functional filter + leaderboard tabs
634e80e feat(mobile/rep): empty-state CTA + Me tab Edit Profile + Leaderboard YOU highlight
aed743f feat(queue/rep): row-click deep-link + koino empty state + button isolation
1230981 feat(pipeline/rep): bulk gates + state scope + touchpoint timeline + deep-link
90f71c1 feat(today/rep): drill every button + wire Tasks/Recent calls clicks
2ef0dc3 docs(rep-audit): note koino.capital DS correction + bumped cache busters
ddec527 style(rep): refit new empty-state CTAs to koino.capital DS
6592736 docs: REP_AUDIT_REPORT.md — 7-commit summary, file:line cites
7481aed fix(settings/rep): profile as default tab + load existing notif prefs
779547c fix(mobile-extra-screens/rep): kill demo names + dead handlers + REPS[0]
afa6fdf fix(mobile-screens/rep): derive everything from AppData + me()
0eba900 fix(mobile/rep): kill fake phone dials + hardcoded rank + Marcus leak
80facb1 fix(queue/rep): live SLA buckets + dead-handler dial fix + me() scope
7a2cc1d fix(pipeline/rep): scope to me + empty state + force rep owner
faf55bd fix(today/rep): kill demo bleed + dead Phone handler + hardcoded queue count
```

Cache busters bumped: `page-today.jsx?v=80`, `page-pipeline.jsx?v=80`,
`page-queue.jsx?v=79`, `page-mobile.jsx?v=77`, `page-extras.jsx?v=84`,
`page-platform.jsx?v=77`, `mobile-screens.jsx?v=17`,
`mobile-extra-screens.jsx?v=17`.

All eight changed `.jsx` files compile cleanly under
`@babel/standalone@7.29.0` (same version `index.html` loads).
Local smoke test is Ian's next step — see "Verify" at the bottom.

---

## (a) Engineering — dead handlers, hardcoded data, broken Supabase queries

### Dead handlers (no `onClick` or `onClick={() => {}}`)

| File | Line (pre-fix) | Symptom |
|---|---|---|
| `page-today.jsx:619` | "Next in queue" row's Phone icon-btn had no `onClick`. Tapping it did nothing. **Fixed**: gates on `l.phone`, routes through `window.repflowCall`, toasts when no phone. |
| `page-queue.jsx:100` | DialQueueView first-row Phone bypassed the no-phone guard and called `onCall()` with nothing — i.e. opened the dialer overlay with no number. **Fixed**: every row gates on `l.phone`; first row still routes through `onCall(l)` when a phone is present. |
| `mobile-extra-screens.jsx:79-81` | Coaching `Replay` and `Drill` buttons had no `onClick`. **Fixed**: removed (no destination existed). |
| `mobile-extra-screens.jsx:152` | Five settings rows ("Notifications", "Audio quality", "Theme", "Language", "Licenses", "Carrier appointments") had no `onClick` — visually clickable, did nothing. **Fixed**: every row routes to `/settings` via `window.gotoPage`, "Sign out" still routes to `signOut`. |

### Hardcoded data (literals not derived from `AppData` / `me()`)

| File | Line (pre-fix) | Was | Now |
|---|---|---|---|
| `page-today.jsx:600` | "47 leads · sorted by speed-to-lead" | Literal `47` | `(QUEUE \|\| []).length` |
| `page-today.jsx:636` | "On Cheryl Hampton's call …" | Demo-rep name in coaching body | Reads `AppData.COACHING_NOTES` for me; demo-only fallback gated to `isDemoAgency()`; renders empty state otherwise |
| `page-today.jsx:722` | `RECORDINGS.map(...)` | Looped over global recordings → leaks Marcus's call history into a fresh rep | Filters to `r.repId === myRow.id`, renders empty state for fresh agencies |
| `page-today.jsx:747-762` | Daily ritual rows (`9:00a Lead Drop · 47 fresh leads in queue`, `4:00p Power Hour = LIVE`) | Hardcoded states (`d: "done"`, `d: "now"`) | Tinted by viewer's local clock; queue size derived from `QUEUE.length` |
| `page-queue.jsx:48-53` | SpendStrip values: `$2.40 / $32.6 / 38% / 11%` | All literals from Atlas demo | Derived from `RECORDINGS` (dial count) + `COMMISSIONS` (comp/dial) per the viewer; rendered as `—` for empty real tenants; demo numbers kept under `isDemoAgency()` |
| `page-queue.jsx:127-131` | Queue health buckets `23 / 12 / 8 / 4` | Hardcoded even with empty QUEUE | Buckets derived from `visible[].elapsed` thresholds |
| `page-queue.jsx:146` | "State licenses · 12 active" | Literal even for a brand-new rep with zero licensed states | Reads `me().licensed_states.length`; falls to "set in Profile" CTA when empty |
| `page-mobile.jsx:107` | Status bar "9:41" | Apple's reveal time, frozen | Rep's actual local clock |
| `page-mobile.jsx:122-125` | Leaderboard pill `#3 +2` | Hardcoded rank + delta | Derives myRepId's actual rank; suppresses pill when not on board |
| `page-mobile.jsx:201` | "Atlas · MTD · live" | Demo agency name | `me().agency_name` |
| `page-mobile.jsx:243` | Tier progress bar `width: mtd / 600 %` | Magic `/600` divisor | Scales against the tier's actual threshold (TIER_TARGETS) |
| `mobile-screens.jsx:54` | `const target = 3800` | Hardcoded daily target | Derived from tier threshold / 22 workdays |
| `mobile-screens.jsx:135` | "47 leads · sorted by SLA" | Literal | `counts.all` from QUEUE |
| `mobile-screens.jsx:141-149` | Filter chips with hardcoded counts `(47, 23, 12, 28, 19)` | All literals | Computed from QUEUE.elapsed / product regex |
| `mobile-screens.jsx:196,254` | Lead defaults to "Cheryl Hampton" when not bound | Demo name leak | "—" placeholder / "No lead selected" empty state |
| `mobile-screens.jsx:310` | "MTD premium · Atlanta office" | Hardcoded city | `me().agency_name` |
| `mobile-screens.jsx:312` | Month chip "Oct" | Literal | Current month from `Date#toLocaleDateString` |
| `mobile-screens.jsx:358-360` | Tier progression `Platinum → Diamond · $42.3k / $60k · 70%` | Literal | Derived from viewer's tier + MTD |
| `mobile-screens.jsx:370` | Commission bars (May–Oct values) + "$12,840 expected" | Literals | Trailing 6 months derived from COMMISSIONS.earnedAt totals; expected = sum of viewer's commissions in current month |
| `mobile-screens.jsx:399-403` | 5 hardcoded policy rows (Cheryl Hampton, Robert Mendez, …) | Demo names in commissions | Reads `POLICIES` (status=issued, owner=me) joined with COMMISSIONS; demo rows gated to `isDemoAgency()` |
| `mobile-extra-screens.jsx:60-62` | 3 coaching cards naming Cheryl + Robert | Demo names in coaching | Reads `COACHING_NOTES` for me; demo cards gated to `isDemoAgency()` |
| `mobile-extra-screens.jsx:91-96` | 5 vault rows + "14,820 artifacts" literal | Demo names + impossible artifact count | Reads `VAULT_FILES` scoped to repId; empty state on real tenants |
| `mobile-extra-screens.jsx:139` | "Atlanta" location after rep handle | Literal | Removed (uses `me().agency_name` instead) |
| `mobile-extra-screens.jsx:148-149` | "5 active" licenses, "5" carrier appointments | Literals | Reads `me().licensed_states.length` + APPOINTMENTS table |
| `mobile-extra-screens.jsx:158` | Footer "Repflow · v2.0 · Atlas IMO" | Hardcoded org | `me().agency_name` |

### Broken Supabase / data queries (no PGRST issues, but logic bugs)

| File | Line (pre-fix) | Bug |
|---|---|---|
| `page-pipeline.jsx:39` | `const meId = meIdent?.rep_id \|\| (REPS && REPS[0]?.id) \|\| "viewer"` | A fresh rep whose `me()` hasn't resolved fell through to `REPS[0]?.id` — which on demo seed is Marcus. Rep saw Marcus's pipeline as "mine" until session resolved. **Fixed**: `__unresolved_rep__` sentinel for `role==="rep"`. |
| `page-pipeline.jsx:11` | `newRow.owner = REPS[0]?.id` | A new lead created by a rep inherited Marcus's id as `owner`. **Fixed**: default to `me().rep_id`, and `submit()` force-overrides `owner = meId` for the rep role on every insert. |
| `page-queue.jsx:17` | `myRepId = meIdent?.rep_id \|\| (AppData.REPS && AppData.REPS[0] && AppData.REPS[0].id)` | Same Marcus-leak as pipeline. **Fixed**: sentinel. |
| `page-mobile.jsx:13` | Same fall-through to REPS[0]?.id | **Fixed**: sentinel unless `isDemoAgency()`. |
| `page-mobile.jsx:196` | `onLead={(l) => repflowDial("+15125550" + (l.id \|\| "100"), l.lead)}` | **Synthesized a phone number from the lead id and dialed it.** Dialing a real PSTN number with fake digits is worse than no-op. **Fixed**: gate on `l.phone`, toast on miss. |
| `page-mobile.jsx:143` | `const phone = "+1512555" + String(c.id \|\| "")...` | Dead variable (assigned but never read; `handleSwipe` uses `lead.phone`). **Fixed**: removed. |
| `mobile-screens.jsx:47` | `const me = AppData.REPS && AppData.REPS[0]` | Marcus-leak + crashes when REPS is empty. **Fixed**: resolves via `me()` first. |
| `mobile-screens.jsx:304` | `[...AppData.REPS].sort(...)` | Crashes when REPS is empty. **Fixed**: `[...(AppData.REPS \|\| [])]`. |
| `mobile-screens.jsx:323-335` | Top 3 podium block `[ranked[1], ranked[0], ranked[2]]` | Crashes when fewer than 3 reps (ranked[2] is undefined → r.id of undefined). **Fixed**: gates on `ranked.length >= 3`. |
| `mobile-extra-screens.jsx:126` | `const me = AppData.REPS[0]` | Same Marcus-leak + crashes on empty REPS. **Fixed**: resolves via `me()`. |
| `page-extras.jsx:3189` | SettingsNotifications initialised prefs to `DEFAULTS` and never reconciled with backend | First toggle saved the 7-key default, silently overwriting saved prefs | **Fixed**: `get_my_profile` on mount populates `notification_prefs`; toggles save deltas via `save_profile` minimal-patch |

---

## (b) UX — ≤ 2-tap to primary action, empty/loading/error states

### Empty states added

- `page-today.jsx`: "Next in queue" panel with `QUEUE.length === 0` now shows
  a CTA to open Dial Queue, not a 6-row blank list under "47 leads".
- `page-today.jsx`: Recent calls panel shows "No calls recorded yet" copy
  for fresh reps instead of leaking Marcus's call list.
- `page-today.jsx`: Coaching panel now renders "No coaching notes yet"
  for real tenants instead of Cheryl-Hampton placeholder text.
- `page-pipeline.jsx`: When a rep's scoped pipeline is empty (`scoped.length === 0`),
  the table renders a hero CTA with "Open Dial Queue" + "New lead" buttons
  instead of the generic "No leads match these filters".
- `mobile-screens.jsx`: `MScreenQueue` shows "Queue is empty" copy when
  QUEUE has zero rows. `MScreenLeaderboard` shows "No producers on the
  board yet" empty state and conditionally renders the podium only when
  ≥3 reps. `MScreenLead` shows "No lead selected" instead of defaulting
  to a Cheryl Hampton seed.
- `mobile-extra-screens.jsx`: Coaching + Vault both have explicit empty
  states for fresh tenants.

### 2-tap-to-primary-action verified

- Today → Power Hour: 1 tap (header `btn-primary`).
- Today → first dial: 1 tap (per-row Phone button, now wires through `repflowCall`).
- Queue → dial top lead: 1 tap.
- Pipeline → call a lead: 2 taps (row → "Call now" in slide-out).
- Mobile rep dial: 0 taps (top of stack auto-renders), swipe-right to dial.
- Settings → Edit Profile: 1 tap (prominent header button, P7).
- Settings → Save: 1 tap after edits.

### Loading + error surfaces

- `SettingsNotifications` now shows "Loading your preferences…" until
  `get_my_profile` resolves and disables toggles during load so flipping
  during the in-flight roundtrip can't desync.
- `SettingsProfile` already has full loading + error recovery (P6).

---

## (c) UI — koino.capital DS (per Ian's correction mid-pass)

Ian's mid-pass correction: don't use the existing dark+amber OS DS.
Match the koino.capital marketing site — green + black, rounded soft,
modern tech-stack look. Tokens lifted from
`KOINO/ventures/products/storefront-static/index.html`:

| Token | Marketing site | Used where |
|---|---|---|
| Accent green | `#00d4aa` | Empty-state tag lines, primary CTA bg |
| Accent glow | `rgba(0,212,170,0.18)` | Button box-shadow on hover/rest |
| Primary text on accent | `#000` | All teal buttons get black text |
| Border radius | `8px` (buttons), `10-12px` (cards) | New empty-state buttons |
| Tag label | `font-family:JetBrains Mono; font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; color:#00d4aa` | `// queue · empty`, `// no notes yet`, `// vault · empty`, etc. |
| Body font | `Inter` | Already the OS default (`--font-ui`) |
| Padding (cards) | smaller than OS — 14–20px | Empty-state hero containers |

Where applied (NEW components only, not the existing OS surfaces):
- `page-today.jsx`: Next-in-queue empty notice, coaching empty branch,
  recent-calls empty state
- `page-pipeline.jsx`: rep-with-zero-leads hero CTA (the most visible
  new component — primary "New lead" button gets the full teal +
  glow treatment)
- `mobile-screens.jsx`: 4 empty-state screens (queue / leaderboard /
  lead / commissions)
- `mobile-extra-screens.jsx`: coaching + vault empty states

Out of scope (NOT overhauled, per Ian "don't stress about overhauling"):
- Existing OS panels (`panel`, `panel-h`, `kpi-row`, `list`, `row`,
  `chip-*`) keep their amber-leaning oklch tokens. A full OS DS swap
  is a separate branch.
- No new CSS, no new utility classes. All koino.capital styling lives
  inline on the elements I introduced — reversible and scoped.

Mobile-first surface (`mobile.html` shell): every screen now renders
without crashing on an empty agency (the REPS[0] crashes were the
dominant failure mode for fresh accounts).

Profile grid was already mobile-responsive (P7 `.profile-grid-{2,3,4}` +
`@media (max-width: 720px)`); no rep-side change needed.

---

## Files changed (deltas)

| File | Lines added | Lines removed | Net |
|---|---|---|---|
| `page-today.jsx` | +94 | -34 | +60 |
| `page-pipeline.jsx` | +30 | -3 | +27 |
| `page-queue.jsx` | +67 | -20 | +47 |
| `page-mobile.jsx` | +73 | -24 | +49 |
| `mobile-screens.jsx` | +146 | -25 | +121 |
| `mobile-extra-screens.jsx` | +74 | -23 | +51 |
| `page-extras.jsx` | +24 | -22 | +2 |
| `index.html` | +6 | -6 | 0 |
| `mobile.html` | +2 | -2 | 0 |
| `REP_AUDIT_REPORT.md` | new | — | new |

---

## What's NOT done (deliberately deferred)

- **DispatchView (manager surface of `page-queue.jsx`)** still has
  hardcoded SpendStrip values (`Team CPA $87`, `Lead spend $1,240`,
  `Avg dispatch SLA 21s`, `Breaches 4`). That's a manager-role
  concern, out of scope for this branch. Same for `LiveFloorMap`.
- **`Compliance` panel in DialQueueView**: TPMO / SOA / Recording rows
  are static labels, not derived from agency_settings. Leaving as
  policy-copy until those settings exist.
- **`page-floor.jsx`**: Rep uses Floor via Today's "Power Hour" button
  but the floor itself wasn't in the brief. Not audited this pass.
- **Mobile pull-to-refresh / haptics**: not on the list. mobile-styles.css
  already supports the swipe gestures we use.
- **DOM tests / Playwright**: this prototype is Babel-standalone, no
  build step; smoke test is browser-driven (see below).

---

## Verify locally

```powershell
cd C:\Users\PLATINUM\Documents\GitHub\koino-insurance-os\.claude\worktrees\recursing-franklin-4c0ddd
python -m http.server 8000
# open http://localhost:8000 in a browser
```

Expected:

1. Login → "Skip → demo data". Tweaks panel → role: rep.
2. Today page renders with the rep's name (no `Marcus`), Daily Ritual
   tints by your actual local clock, "Next in queue" shows the real
   QUEUE count.
3. Click the per-row Phone in Next-in-queue → dial overlay opens
   with that lead's number (was a dead button).
4. Pipeline page → "My pipeline · N active" header. With no leads,
   the empty state shows two CTAs.
5. Dial Queue (`/queue`) → SpendStrip + Queue health buckets reflect
   QUEUE state. Compliance "State licenses" reflects your profile.
6. Settings → lands on Profile (not Agents). Edit Profile button is
   still primary. Notifications tab loads existing prefs before
   accepting toggles.
7. Open `http://localhost:8000/mobile.html` → status bar shows the
   real time, Leaderboard renders with the agency name, Vault +
   Coaching empty states present instead of Cheryl-Hampton seed.

Push when ready:
```
git push origin feat/role-audit-rep-2026-05-11
```
(Per the brief: **NOT pushed by this run.**)

---

## Deep-drill coverage — second pass (2026-05-12 evening)

Ian asked for a tab-by-tab, button-by-button drill rather than spot
fixes. Below is the exhaustive inventory: every interactive element in
every rep-visible surface, with status `Wired ✓` / `Wired now` /
`Hardcoded → derived` / `Out of scope`.

### page-today.jsx · `TodayRep`

| Element | File:line | Status | Note |
|---|---|---|---|
| Page-title quarter chip | page-today:524 | Hardcoded → derived | `currentQuarter()` helper from current month |
| Schedule btn (header) | page-today:472 | Wired ✓ | dispatches `appointment:open` (listener in page-floor-actions:351) |
| Power Hour btn (header) | page-today:475 | Wired ✓ | `goFloor` → gotoPage("floor") |
| Day-is-blank banner CTA | page-today:543 | Wired ✓ + DS | teal #00d4aa; routes to /floor or /queue based on queueDepth |
| Onboarding 5 tiles | page-today:548-591 | Wired now | each tile routes to the page that completes its step (was display-only) |
| GoalRow today/week/month | page-today:546-548 | Wired ✓ | derived from `myRow.mtd` / tier threshold |
| ActionTile Power Hour | page-today:556 | Wired ✓ | goFloor |
| ActionTile Log activity | page-today:557 | Wired ✓ | gotoPage("crm") + dispatchEvent("crm:addLead") (listener page-crm:117) |
| ActionTile DM Manager | page-today:558-559 | Wired ✓ | `dmManager` ensures thread + nav to Messages |
| ActionTile Pull a script | page-today:560 | Wired ✓ | gotoPage("library") |
| SpendStrip Cost/issued | page-today:579 | Hardcoded → derived | live from LEAD_SPEND_TOTALS / POLICIES |
| SpendStrip NIGO drag | page-today:582 | Hardcoded → derived | sum NIGOS scoped to my rep, this month |
| Hero KPI sparkline | page-today:588 | Hardcoded → derived | `_bucketLastNDays(COMMISSIONS, "earnedAt")` for the viewer |
| Apps KPI sparkline | page-today:589 | Hardcoded → derived | bucket POLICIES.issuedAt |
| Dials KPI sparkline | page-today:590 | Removed | RECORDINGS lacks ISO date through hydrate; spark suppressed |
| TasksPanel row click | page-today:301-318 | Wired now | routes to /pipeline+openLead for relatedLeadId, /commissions for relatedPolicyId |
| TasksPanel Check button | page-today:309-319 | Wired now | `sb.from("tasks").update({status:"completed"})` |
| Next-in-queue meta | page-today:600 | Hardcoded → derived | `(QUEUE || []).length` |
| Next-in-queue per-row Phone | page-today:642-660 | Wired now | gates on l.phone, routes window.repflowCall |
| Empty-queue CTA | page-today:606-635 | Wired now | "Open dial queue" → teal CTA |
| Coaching panel Replay btn | page-today:692-696 | Wired ✓ | gotoPage("calls") + toast |
| Coaching panel Mark practiced btn | page-today:699-708 | Wired ✓ | writes to localStorage "repflow.coaching_practiced" |
| Coaching empty state | page-today:716-722 | Wired now | mono `// no notes yet` tag |
| Tier progress (next tier remaining) | page-today:733-755 | Wired ✓ | derived from TIER_TARGETS + myRow.mtd |
| Recent calls per-row | page-today:818-841 | Wired now | row click → gotoPage("calls") + dispatch `calls:openRecording` |
| Recent calls empty state | page-today:809-816 | Wired now | mono `// no calls yet` |
| Daily ritual rows | page-today:856-878 | Hardcoded → derived | row state (next/now/done) derived from local clock hour |

### page-pipeline.jsx · `PagePipeline` + `LeadDetail`

| Element | File:line | Status | Note |
|---|---|---|---|
| View toggle (List/Kanban/Sequences) | page-pipeline:170-174 | Wired ✓ | setView |
| Filter button | page-pipeline:177-180 | Wired ✓ | opens filter modal |
| Import CSV button | page-pipeline:181 | Wired ✓ | mounts window.CSVImport |
| Export button | page-pipeline:182-186 | Wired ✓ | window.exportCSV(filtered) |
| New lead button | page-pipeline:188 | Wired ✓ | opens new-lead modal |
| Saved-view chips | page-pipeline:194-200 | Wired ✓ | loadView/deleteView/saveView with localStorage persistence |
| Bulk action button | page-pipeline:204 | Wired ✓ | opens bulk modal |
| pipeline:openLead listener | page-pipeline:28-37 | Wired now | new — accepts deep-link from Today's tasks |
| List row click | page-pipeline:226-232 | Wired ✓ | shift/cmd toggles selection, else opens LeadDetail |
| List row Dots (selection) | page-pipeline:253 | Wired ✓ | toggles selection |
| Kanban drop | page-pipeline:269 | Wired ✓ | `moveTo` with override + Supabase persist |
| Kanban card drag | page-pipeline:276-279 | Wired ✓ | sets drag id, opens detail on click |
| New-lead State dropdown | page-pipeline:386-401 | Hardcoded → derived | for rep, scoped to me().licensed_states (with "(N licensed)" hint) |
| New-lead Source dropdown | page-pipeline:404-415 | Hardcoded → derived | reads LEAD_SOURCES catalog, falls back to legacy 5 |
| New-lead Owner field (manager+) | page-pipeline:418 | Wired ✓ | hidden for rep |
| submit() rep owner enforce | page-pipeline:74-78 | Wired now | `effectiveOwner = role === "rep" ? meId : newRow.owner` |
| Bulk modal "Reassign producer" | page-pipeline:434-445 | Wired now | option hidden for rep; on switch, defaults to meId (not REPS[0]) |
| Bulk Apply CTA | page-pipeline:420-432 | Wired ✓ + DS | teal koino primary |
| LeadDetail X close | page-pipeline:484 | Wired ✓ | onClose |
| LeadDetail phone inline edit | page-pipeline:493-497 | Wired ✓ | onBlur → AppData.mutate.pipelineContact |
| LeadDetail email inline edit | page-pipeline:498-502 | Wired ✓ | onBlur → pipelineContact |
| LeadDetail stage buttons | page-pipeline:556-558 | Wired ✓ | onMove (which calls moveTo with realtime override) |
| LeadDetail sequence Enroll | page-pipeline:579-584 | Wired ✓ | AppData.mutate.sequenceEnroll |
| LeadDetail Owner reassign | page-pipeline:596-598 | Wired ✓ | hidden for rep, onReassign for manager+ |
| LeadDetail Activity timeline | page-pipeline:628-680 | Hardcoded → derived | reads TOUCHPOINTS scoped to lead; legacy 2-row fallback; empty-state mono tag |
| LeadDetail Email footer | page-pipeline:707-711 | Wired ✓ | mailto: with lead.product subject |
| LeadDetail SMS footer | page-pipeline:712-716 | Wired ✓ | window.smsCompose |
| LeadDetail SOA footer | page-pipeline:717-721 | Wired ✓ | window.generateSOAPdf with me().agency_name |
| LeadDetail Call now footer | page-pipeline:723-738 | Wired ✓ + DS | teal #00d4aa primary, neutral when no phone |
| Rep-empty-pipeline hero CTAs | page-pipeline:259-307 | Wired now | "Open dial queue" + teal "New lead" buttons |

### page-queue.jsx · `DialQueueView` (rep)

| Element | File:line | Status | Note |
|---|---|---|---|
| Tab pill (mine/inbound) | page-queue:73-80 | Wired ✓ | SectionPill setTab |
| SpendStrip values | page-queue:48-71 | Hardcoded → derived | RECORDINGS dial count + COMMISSIONS comp/dial |
| Row click → open lead detail | page-queue:107-114 | Wired now | gotoPage("pipeline") + dispatch pipeline:openLead, strips "p-" prefix |
| Per-row Phone | page-queue:118-128 | Wired now | gates on l.phone, isolates from row-click |
| Per-row SMS | page-queue:129-134 | Wired ✓ | window.smsCompose |
| Per-row SOA | page-queue:135-139 | Wired ✓ | window.scheduleSOA |
| Queue health buckets | page-queue:158-179 | Hardcoded → derived | from visible[].elapsed thresholds |
| Compliance state-licenses chip | page-queue:194-205 | Hardcoded → derived | me().licensed_states.length, clickable → /settings |
| Empty-state CTA "Open inbound" | page-queue:101-126 | Wired now | teal koino primary |

### page-mobile.jsx · `MobileRep` (live mobile)

| Tab | Element | Status | Note |
|---|---|---|---|
| status bar | clock | Hardcoded → derived | rep's local time |
| dial | leaderboard pill (#3 +2) | Hardcoded → derived | real rank from REPS sort; suppress if not on board |
| dial | swipe-card phone synth | Removed | dead variable was `"+1512555" + c.id` |
| dial | swipe-right tint | DS | teal rgba(0,212,170,0.25) on DIAL overlay |
| dial | empty-state Pull 6 leads | Wired now | only renders when QUEUE has rows; otherwise guidance text |
| pipe | onLead handler | Wired now | gates on l.phone, never synthesizes |
| lb | agency subline | Hardcoded → derived | me().agency_name |
| lb | tail rows (no me-highlight) | Wired now | tinted bg + 2px border + "YOU" mono label for viewer's row |
| me | tier bar magic /600 | Hardcoded → derived | scales against tier threshold + remaining-to-next caption |
| me | (no Edit Profile control) | Wired now | new teal CTA above Sign out |

### mobile-screens.jsx · `MScreenToday / Queue / Call / Lead / Leaderboard / Comm`

| Screen | Element | File:line | Status |
|---|---|---|---|
| Today | header avatar/welcome | mobile-screens:62-69 | Wired ✓ (display) |
| Today | "Dial" hot-lead CTA | mobile-screens:89 | Wired ✓ |
| Today | KPI 4-row | mobile-screens:96-100 | Derived from me + POLICIES |
| Today | target $3800 literal | mobile-screens:54 | Hardcoded → derived from tier/22 |
| Today | upNext rows | mobile-screens:107-119 | Filtered to my pipeline |
| Queue | "Filter" pill | mobile-screens:165-170 | Wired now | toggles all↔hot |
| Queue | 5 filter chips | mobile-screens:172-198 | Wired now | each is a button, active = teal |
| Queue | per-row Call | mobile-screens:212-235 | Wired now | gates on l.phone, teal primary |
| Queue | row click → onLead | mobile-screens:204 | Wired ✓ |
| Queue | hardcoded "47 leads" | mobile-screens:152 | Hardcoded → derived |
| Call | Mute toggle | mobile-screens:289 | Wired ✓ |
| Call | Keypad btn | mobile-screens:293 | Wired now | toasts hint (DTMF needs real call) |
| Call | Rebut btn | mobile-screens:296 | Wired now | dispatches ai:ask |
| Call | "Show script" chip | mobile-screens:269-274 | Wired now | gotoPage("library") |
| Call | "Send SOA" chip | mobile-screens:275-285 | Wired now | window.generateSOAPdf |
| Call | "Quote $145/mo" chip | mobile-screens:286-294 | Wired now | gotoPage("quote") + relabeled "Open quote" |
| Call | End call btn | mobile-screens:302 | Wired ✓ |
| Lead | Back ← Queue | mobile-screens:407 | Wired ✓ |
| Lead | ••• kebab | mobile-screens:412 | Wired now | onNote |
| Lead | avatar gradient | mobile-screens:402-405 | Hardcoded → derived | hash-of-name → hsl pair |
| Lead | Call action | mobile-screens:431 | Wired now | gates on hasPhone |
| Lead | SMS action | mobile-screens:432 | Wired now | window.smsCompose |
| Lead | SOA action | mobile-screens:433 | Wired now | window.generateSOAPdf |
| Lead | Note action | mobile-screens:434 | Wired now | toast (mobile note capture not built) |
| Lead | Compliance rows | mobile-screens:443-470 | Hardcoded → derived | from lead.consent + product hint |
| Lead | Activity timeline | mobile-screens:476-516 | Hardcoded → derived | reads TOUCHPOINTS for this lead |
| Lead | "Call now" bottom CTA | mobile-screens:518-533 | Wired ✓ + DS | teal #00d4aa, disabled→neutral |
| LB | tabs (Agency/All teams/Personal) | mobile-screens:562-595 | Wired now | scopes ranked list, teal active |
| LB | tail rows me-highlight | mobile-screens:629-666 | Wired now | bg/border/YOU label + true rank |
| LB | podium / flat-list gate | mobile-screens:603-604 | Wired ✓ | ≥3 reps |
| Comm | Statement btn | mobile-screens:768-778 | Wired now | gotoPage("commissions") |
| Comm | Expected this month | mobile-screens:737-754 | Derived from my COMMISSIONS |
| Comm | bars 6mo | mobile-screens:744-755 | Derived from COMMISSIONS.earnedAt |
| Comm | Recent issues list | mobile-screens:794-808 | Derived from POLICIES (status=issued) |

### mobile-extra-screens.jsx · Pipeline / Coaching / Vault / Settings

| Screen | Element | Status | Note |
|---|---|---|---|
| Pipeline | rep scope | Wired now | filters PIPELINE to owner === me().rep_id |
| Pipeline | default stage | Hardcoded → derived | highest-volume stage from rep's rows |
| Pipeline | stage chips | Wired now | real `<button>`s, teal active treatment |
| Pipeline | per-card AP color | DS | swapped to teal |
| Pipeline | "no phone" inline chip | Wired now | new warning chip |
| Pipeline | empty state | Wired now | mono tag + conditional "Pull from queue" CTA |
| Coaching | demo names leak | Fixed earlier | scoped to COACHING_NOTES for me + isDemoAgency fallback |
| Coaching | Replay/Drill dead buttons | Removed | no destination existed |
| Vault | demo names + 14,820 literal | Fixed earlier | reads VAULT_FILES scoped to repId |
| Settings | REPS[0] crash on empty | Fixed earlier | resolves via me() |
| Settings | 6 rows with no onClick | Fixed earlier | every row routes to /settings |
| Settings | hardcoded license count | Fixed earlier | reads me().licensed_states.length |
| Settings | hardcoded "Atlas IMO" | Fixed earlier | me().agency_name |

### Settings tabs visible to rep · profile / notifications / calling / agents

| Tab | Element | Status | Note |
|---|---|---|---|
| Profile | get_my_profile load | Wired ✓ (P6) | one RPC roundtrip with `{profile, memberships, current_agency_id, is_platform_admin}` |
| Profile | 18 form fields | Wired ✓ (P6) | controlled inputs + dirty tracking |
| Profile | Save profile CTA | Wired ✓ + DS | teal koino primary, neutral disabled |
| Profile | Sign out (Session panel) | Wired ✓ | window.signOut |
| Profile | Avatar live preview | Wired ✓ (P7) | onError fallback to Shared.Avatar |
| Profile | Licensed states grid | Wired ✓ (P6) | click-to-toggle 50 states + DC |
| Profile | License expiration per state | Wired ✓ (P6) | date input per active state |
| Profile | E&O carrier + expiry | Wired ✓ (P6) | save_profile minimal patch |
| Profile | Background check status | Wired ✓ (P7) | 6-option select |
| Profile | Notification prefs grid | Wired ✓ (P6) | 4 channels + digest frequency |
| Profile | Tab default for rep | Fixed earlier | Profile (was Agents) |
| Notifications | 7 toggle rows | Wired now (this branch) | loads existing prefs from get_my_profile before accepting toggles |
| Notifications | save on toggle | Wired ✓ | save_profile minimal patch + AppData mutate fallback |
| Calling | TwilioStatusPanel | Wired ✓ | platform.jsx |
| Calling | TwilioConfigModal | Wired ✓ | platform.jsx |
| Calling | OS install script | Wired ✓ | mac/win/linux variants |
| Calling | Copy script btn | Wired ✓ | navigator.clipboard.writeText |
| Calling | Fire test call CTA | Wired ✓ + DS | teal primary |
| Agents | suggested_agents_for_role | Wired ✓ (P4) | RPC |
| Agents | rba_installs read | Wired ✓ (P4) | scoped by current_agency_id |
| Agents | Install row | Wired ✓ + DS | RPC + direct-insert fallback, teal primary, "installed" pill teal |
| Agents | Uninstall row | Wired ✓ (P4) | disabled for required agents |
| Agents | Loading + error recovery | Wired ✓ | Try-again button on RPC failure |

### What's deliberately NOT touched (out of scope)

- **page-floor.jsx** — rep uses it via Today's Power Hour button, but
  the floor view itself was out of brief. Audited only the entry-point.
- **page-messages.jsx** — DM Manager tile in Today routes here; not
  drilled in this branch.
- **page-library.jsx** — Pull a script tile routes here; not drilled.
- **page-leaderboard.jsx** — separate from the mobile leaderboard; not
  drilled.
- **page-floor-actions.jsx** — the actual call-overlay where dials
  happen. Not in brief.
- **Existing OS panel/list/row/chip styling** — Ian's instruction
  ("don't stress about overhauling") means the OS amber `--accent-money`
  token persists on existing surfaces. Only the new components I
  added or directly touched got the koino.capital teal treatment.
