# Rep-role audit — 2026-05-12

Branch: `feat/role-audit-rep-2026-05-11` (off `feat/onboarding-frontend-2026-05-11`)
Time box: 3 hours, sovereign execution. NOT pushed to remote.

Scope: every surface a `role="rep"` viewer actually touches —
`page-today`, `page-pipeline` (rep scope), `page-queue`, `page-mobile`,
`mobile-screens`, `mobile-extra-screens`, `Settings → Profile`.

7 commits, one per surface, on top of `1f94472` (P7/P8 onboarding tip).

```
7481aed fix(settings/rep): profile as default tab + load existing notif prefs
779547c fix(mobile-extra-screens/rep): kill demo names + dead handlers + REPS[0]
afa6fdf fix(mobile-screens/rep): derive everything from AppData + me()
0eba900 fix(mobile/rep): kill fake phone dials + hardcoded rank + Marcus leak
80facb1 fix(queue/rep): live SLA buckets + dead-handler dial fix + me() scope
7a2cc1d fix(pipeline/rep): scope to me + empty state + force rep owner
faf55bd fix(today/rep): kill demo bleed + dead Phone handler + hardcoded queue
```

Cache busters bumped: `page-today.jsx?v=78`, `page-pipeline.jsx?v=78`,
`page-queue.jsx?v=78`, `page-mobile.jsx?v=76`, `page-extras.jsx?v=83`,
`mobile-screens.jsx?v=15`, `mobile-extra-screens.jsx?v=15`.

All seven changed `.jsx` files compile cleanly under
`@babel/standalone@7.29.0` (the same version `index.html` loads).
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

## (c) UI — KOINO DS tokens, mobile-first

No regressions introduced. All edits stay inside the existing token
vocabulary (`var(--accent-money)`, `var(--state-warning)`, `var(--bg-raised)`,
etc.) and reuse `m-card / m-chip / m-section-h / m-rank / m-bar`
classes from `mobile-styles.css`. No new color literals.

Mobile-first surface (mobile.html shell): every screen now renders
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
