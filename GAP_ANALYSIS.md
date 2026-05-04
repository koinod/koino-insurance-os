# Repflow GAP_ANALYSIS — 2026-05-03

Compiled from Phase 3 simulation against the three canonical personas
(REP / MANAGER / OWNER). Sorted by severity then persona impact then
implementation complexity.

---

## CRITICAL — ship today

### GAP-X2 — Demo data contamination on new account
- **personas_affected**: REP, MANAGER, OWNER
- **workflow_ids**: ONBOARD-OWNER, ONBOARD-MGR, ONBOARD-REP
- **description**: New signup inherits the demo agency (Atlas Insurance Group, 9 reps, 12 pipeline, $42k Marcus MTD). Sandboxing failure — ANY new tenant sees Atlas's data.
- **user_behavior_on_hit**: Owner: confused, distrust, "where did this data come from?" Reps: feel scammed.
- **business_impact**: kills enterprise trust on first impression. CRITICAL for any real customer.
- **proposed_fix**: Branch frontend reads on `agency_id`. New agency_id = empty. `?demo=1` URL → forces atlas-demo agency_id, read-only.
- **complexity**: DAYS (touches every page that calls `sb.from(...)`)
- **dependencies**: GAP-X4 (auth-to-agency linking)

### GAP-X3 — AI scope leak across tenants
- **personas_affected**: ALL
- **workflow_ids**: PERFORMANCE-*, REPORTING-*
- **description**: `/api/copilot.js` fetches Supabase rows using anon key + forwarded JWT, but no agency_id filter. Once multi-tenant, a query in tenant A could return rows from tenant B.
- **business_impact**: PII/$$ leak across customers — instant regulatory and trust death.
- **proposed_fix**: Resolve agency_id from JWT → inject `agency_id=eq.{}` into every PostgREST URL the copilot tools build.
- **complexity**: HOURS
- **dependencies**: GAP-X4, GAP-X2

### GAP-X4 — auth.uid() → agents.user_id link incomplete
- **personas_affected**: ALL
- **workflow_ids**: PERFORMANCE-REP, COMMUNICATION-*, anything role-scoped
- **description**: There's no canonical `agents.user_id` (uuid → auth.users.id). Pages fall back to `AppData.REPS[0]` (always Marcus). Every "my pipeline / my commissions / my notifications" is fake.
- **business_impact**: rep can't see their own data, manager can't filter team, owner can't trust totals.
- **proposed_fix**: Migration adds `reps.user_id uuid references auth.users(id)`. New `current_rep()` SQL function returns the row for the current session. UI helper `me()` reads it from a `/api/me` edge route.
- **complexity**: HOURS
- **dependencies**: none (foundational)

### GAP-D1 — Today KPI row hardcoded for the rep
- **personas_affected**: REP
- **workflow_ids**: DAILY-REP
- **description**: TodayRep renders "Today's commission $2,840", "Apps submitted 4", "Dials 87", "streak 18d" as string literals. Every rep sees Marcus's numbers.
- **user_behavior_on_hit**: rep loses trust immediately, abandons (matches persona fear).
- **business_impact**: rep activation = 0. The Today page is the morning ritual; if it lies, the product is dead on first open.
- **proposed_fix**: Read from `me()`'s rep row + AppData.COMMISSIONS filtered by rep_id + `me().streak_days`. Delete the literal sub-line.
- **complexity**: HOURS
- **dependencies**: GAP-X4

### GAP-X1 — Differentiator missing: predictive engine
- **personas_affected**: MANAGER, OWNER
- **workflow_ids**: DAILY-MGR, DAILY-OWNER
- **description**: Product positioning = "predicts disengagement, breakouts, recruiting gaps before they materialize." NONE built. RECRUITER/TRAINER/CLOSER/RETAINER sub-agents are named only.
- **business_impact**: this IS the product. Without it, Repflow = another CRM. Persona OWNER goal #3 (predictive forecasting) and MGR goals #1+#2 (spot quitters/breakouts) all unmet.
- **proposed_fix**: Phase-1 heuristic detector (no ML yet):
    - **risk_score** per rep = recent_dials_7d trend × call_quality_trend × tier_drop × days_since_last_issued
    - **breakout_score** per rep = rev_velocity vs 30d_avg + streak_days + tier_proximity
    - **recruiting_gap** = forecast vs current pipeline depth × interview rate
    - Surface as cards on Today (mgr) + Performance (owner)
    - Background sub-agent (RETAINER) writes scores nightly via Edge cron
- **complexity**: SPRINT (2-3 days for v1 heuristics + UI)
- **dependencies**: GAP-X4 (need real rep data flowing)

### GAP-OD1 — Owner P&L is hardcoded
- **personas_affected**: OWNER
- **workflow_ids**: DAILY-OWNER, REPORTING-OWNER
- **description**: TodayOwner renders "AP closed today", "Override revenue MTD $258,420", "Anomalies open 4" as literals.
- **business_impact**: owner cannot make decisions from this page → opens once, closes, never returns (persona OWNER fear: vanity dashboards).
- **proposed_fix**: Compute from policies + commissions + clawbacks tables. Override revenue = sum of commissions where `kind='override'`. Anomalies = derived from risk_score (depends GAP-X1).
- **complexity**: HOURS
- **dependencies**: GAP-X4

---

## HIGH — this week

### GAP-A1 — No "first action" CTA after rep onboarding
- REP completes wizard → drops to Today empty page → abandons.
- **fix**: After onboarding, redirect to `/floor?defaultMode=live&onboarding=true` with a "Make your first dial" highlight on the queue.
- **complexity**: HOURS

### GAP-A2 — NIPR API failure during onboarding strands the rep
- If NIPR not configured or down, wizard hangs.
- **fix**: 5s timeout → "we'll verify your license in the background; continue" → soft-flag on the rep row.
- **complexity**: HOURS

### GAP-D2 — Dial queue not filtered to "my queue"
- Multi-rep agency: every rep sees every queue lead.
- **fix**: queue filter `assigned_rep_id IS NULL OR assigned_rep_id = me()`.
- **complexity**: HOURS
- **deps**: GAP-X4

### GAP-P2 — Leaderboard exposes other reps' exact MTD $$ to a rep
- RBAC violation. Rep should see their rank + delta to next, not exact $$ of peers.
- **fix**: in PageLeaderboard for `role='rep'`, mask MTD column to `≈$X0k` ranges; show only own exact $.
- **complexity**: HOURS

### GAP-MD1 — Manager team rollup unfiltered by upline
- TodayManager sums all REPS, not the manager's downline.
- **fix**: `team = REPS.filter(r => r.upline_id IN downlineOf(me().id))` recursive.
- **complexity**: HOURS
- **deps**: GAP-X4

### GAP-MD2/3 — No surfaced "at risk" / "breakout" alerts
- See GAP-X1.
- **partial fix while X1 lands**: simple heuristic "no dial in 48h + tier=bronze/silver" → "at risk" badge; "MTD > 1.5× rep's rolling 30d avg" → "breakout" badge.
- **complexity**: HOURS

### GAP-MD4 — Coaching cards from mock, not coaching_sessions
- **fix**: bind to `AppData.COACHING_SESSIONS` filtered by rep + status.
- **complexity**: HOURS

### GAP-C1 — Notifications panel mostly demo fallback
- Live AppData.NOTIFICATIONS only has 6 hardcoded handles.
- **fix**: filter to `recipient_handle = me().handle`. Add a notification trigger when a coaching session lands or a NIGO is assigned.
- **complexity**: HOURS

### GAP-C2 — No Messages UI
- threads/messages/message_reads tables exist; no page.
- **fix**: New `/messages` route (rep+mgr+owner). Inbox left, conversation right. Compose to thread.
- **complexity**: DAYS

### GAP-MR1 — Recruiting page fleet-wide, not "my recruiting"
- **fix**: filter campaigns/leads by `owner = me().id` for managers.
- **complexity**: HOURS

### GAP-OO2 — Multi-tenant isolation on queries
- Every page reads global; no agency_id filter.
- **fix**: extend hydrate function to inject `agency_id=eq.{me_agency}` into every `.from(...)` call.
- **complexity**: DAYS

### GAP-RP1 — No CSV/PDF export
- Owner needs to send commission reports to accountant.
- **fix**: Add CSV export on PnL, Commissions, Performance pages. PDF export already wired for commission statement.
- **complexity**: HOURS

### GAP-OE2 — No auto-escalation when manager inactive
- **fix**: Cron / scheduled function: if manager has no activity_log entry in 5d → notify owner.
- **complexity**: HOURS

### GAP-M1 — Mobile reps see old MobileRep, not Floor
- **fix**: route mobile reps to `/floor` directly; MobileRep becomes the floor mobile-layout.
- **complexity**: HOURS

### GAP-OC2 — No broadcast tool for owner
- "AEP huddle in 1 hour, all reps" should be a 1-click thing.
- **fix**: Owner Today page → "Broadcast" button → modal → write → fan-out to notifications.
- **complexity**: HOURS

---

## MEDIUM — next week

### GAP-A3 — No "import your first lead" prompt after onboarding
- Empty state needs a CSV upload or "drop a Convoso export" affordance.
- **complexity**: HOURS

### GAP-A4 — No persistent onboarding checklist
- Rep loses progress if they close wizard.
- **fix**: persisted `onboarding_progress` table; checklist card on Today until complete.
- **complexity**: HOURS

### GAP-D4 — No prominent "log activity" CTA
- 3 clicks to log a call. Should be 1.
- **fix**: floating action button on every rep page → log activity modal.
- **complexity**: HOURS

### GAP-D5 — AEP banner shows for users with no AEP assignment
- **fix**: hide if no `myAssign` AND user is rep.
- **complexity**: TRIVIAL (already implemented partial; verify)

### GAP-P3 — No "my goals" / target-vs-actual
- **fix**: rep can set monthly target; render against MTD with progress ring.
- **complexity**: HOURS

### GAP-MP2 — NIGO Queue fleet-wide for managers
- **fix**: filter by `assigned_to IN downline OR assigned_to = me()`.
- **complexity**: HOURS

### GAP-MR2 — No "send invite" from recruits → application
- **fix**: button on recruit row: status="offer" → "Send invite" → fires `/api/invites/create`.
- **complexity**: HOURS

### GAP-OP2 — No predictive churn/breakout viz at org level
- See GAP-X1.

### GAP-OR2 — No ROI per recruiting source
- Could compute as `sum(commissions where rep_recruited_via=source) / sum(spend per source)`.
- **complexity**: HOURS

### GAP-RP2 — No scheduled reports
- **fix**: edge cron + Mailgun integration.
- **complexity**: DAYS

### GAP-X5 — No real-time push
- Currently polling/refresh.
- **fix**: Supabase realtime channels on `notifications`, `pipeline`, `commissions` tables.
- **complexity**: HOURS

### GAP-OE1 — No agency data export/backup
- **fix**: "Export all" button → S3-style zip of all tables as JSON.
- **complexity**: DAYS

### GAP-MC1 — No rep-coaching-note from Today
- **fix**: per-rep card → "Add coaching note" → posts to coaching_notes.
- **complexity**: HOURS

### GAP-MC2 — Manager can't fire alerts inline
- **fix**: per-rep card → "Send focus note" → notifications.
- **complexity**: HOURS

### GAP-OC1 — No DM to manager from Today
- **fix**: "Message manager" buttons on each manager card on Today (owner).
- **complexity**: HOURS
- **deps**: GAP-C2 (Messages UI)

### GAP-X8 — No keyboard shortcuts on Floor (besides ?+⌘K)
- **fix**: D=dial next, M=mark complete, S=send SOA, etc. Document in ?-help.
- **complexity**: HOURS

---

## LOW — backlog

### GAP-MO1 — No manager-distinct onboarding
### GAP-MO2 — No bulk invite for downline
### GAP-OO3 — No CSV import path (medium-ish — depends on go-to-market)
### GAP-E1 — No "what changed while you were out" digest
### GAP-E2 — Sequences don't auto-pause on rep inactivity
### GAP-MR-cross — Recruiting recruiter_handle linking weak
### GAP-X6 — No light mode
### GAP-X7 — No undo for destructive actions
### GAP-M2 — PWA install prompt missing
### GAP-M3 — No mobile-specific deal-write (form is desktop-grid)

---

## SUMMARY

- **CRITICAL**: 6 (X1, X2, X3, X4, D1, OD1) — predictive engine + tenancy isolation + auth identity + 2 hardcoded-data pages
- **HIGH**: 16 — onboarding, dial scoping, RBAC, manager rollup, alerts, messaging, recruiting scoping, CSV exports, mobile, broadcast
- **MEDIUM**: 14 — empty-state polish, FAB, predictive viz, real-time, scheduled reports, DM affordances, shortcuts
- **LOW**: 10 — manager-onboarding distinction, light mode, undo, PWA, edge cases

**Persona impact tally:**
- REP unmet goals: 4/4 (sees-it-add-up [GAP-D1], lead status [GAP-D2], recognized-w/o-asking [GAP-MC2/C1], hidden=right-choice [GAP-A1])
- MANAGER unmet goals: 3/4 (quitters [X1], breakouts [X1], recruit-w/o-eating-day [GAP-MR1], hidden=look-good [GAP-OC1+RP1 partial])
- OWNER unmet goals: 4/4 (portfolio [OD1], accountability [OE2], forecasting [X1], hidden=runs-without-them [requires X1])

**Next: PHASE_5 plan + implementation per gap, branch `gap-analysis/2026-05-03`.**
