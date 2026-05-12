# ADMIN + IMO_OWNER ROLE AUDIT — 2026-05-12

**Branch**: `feat/role-audit-admin-2026-05-11` (off `feat/onboarding-frontend-2026-05-11`)
**Time-box**: 2.5h (sovereign execution, anti-theater)
**Roles audited**: `admin`, `imo_owner` (and `super_admin` by inheritance)
**Status**: ✅ Shippable — no push (per directive)

---

## TL;DR

The IMO / Platform Admin surface was **broken on main**. `index.html`
loaded a script (`page-platform-admin.jsx`) that **did not exist in the
repo**, leaving `window.PagePlatformAdmin` undefined. Every admin
sub-route (`/platform`, `/agencies`, `/users`, `/billing`, `/audit`,
`/system`) rendered `null` — a blank page where the IMO operator's
mission control should live.

`imo_owner` was referenced in role-rank logic but had **no NAV entry,
no UI surface, and no router case** — it silently fell through to the
single-agency owner experience, identical to a regular `owner`.

### Fixed

1. **Built `page-imo.jsx`** — single component with 6 tabbed subpages,
   wired as both `window.PageImo` and `window.PagePlatformAdmin` (back-
   compat alias so `index.html`'s 6 existing routes work without
   surgery beyond the script-src rename).
2. **Added `imo_owner` NAV** in `shared.jsx`, plus a role pill in the
   Tweaks panel for testing.
3. **Routed `admin` + `imo_owner` + `super_admin`** through the new
   IMO page in `index.html`; everyone else (owner/manager) stays on
   the single-agency `PageAdmin`.
4. **Applied koino.capital design system** scoped to `.koino-skin` —
   near-black (#050505/#0d0d0d) bg, teal-green (#00d4aa) accent,
   JetBrains Mono for tabular numbers + labels, tighter 10–14px card
   padding, denser grids. No bleed into the rest of the app.

---

## Surface delivered

`page-imo.jsx` (~720 lines) — single IIFE, Babel-standalone, no build
step. Six subpages routed by `subpage` prop from `index.html`:

| Route        | What it shows                                                                                       |
|--------------|-----------------------------------------------------------------------------------------------------|
| `platform`   | Overview: 4 KPI cards (sub-agencies / producers / policies / aggregate AP), recent provisioning list with drill, pending-onboarding panel |
| `agencies`   | Full sub-agency fleet table with search + status filter + drill-in (`switchAgency` sets `repflow.active_agency` and rehydrates the single-tenant pages) |
| `users`      | Cross-agency member list — role change (via `update_member_role` RPC w/ direct-update fallback), deactivate (via `deactivate_member` RPC w/ direct-update fallback), filter by agency + role |
| `billing`    | Per-plan + per-sub-agency MRR roll-up (placeholder until Stripe webhooks land) |
| `audit`      | Cross-agency `agency_audit_log` view (latest 200) with agency + actor_role filters + realtime refresh |
| `system`     | 5 health probes — `me()` RPC, `viewer_agency_ids()` RPC, `agency_audit_log` read, `/api/twilio-token`, `/api/transcribe` — plus fleet sanity (`if viewer_agency_ids() returns 1 and you expect more…`) |

Plus a **Provision modal** (top-right CTA on every tab) that calls
`provision_sub_agency(name, slug, tier, owner_email, primary_state, plan)`
with verbatim server-error surfacing.

---

## Audit findings (engineering / UX / UI)

### A. Engineering

| ID  | Finding | Severity | Action |
|-----|---------|----------|--------|
| E1  | `page-platform-admin.jsx` referenced in `index.html` did not exist → blank admin pages | **P0 blocker** | Replaced with `page-imo.jsx` (script src rename, `?v=78` cache bust). New file exposes `window.PageImo` AND back-compat `window.PagePlatformAdmin`. |
| E2  | `imo_owner` role had no NAV, no router case, no role pill | **P1** | Added NAV entry (shared.jsx), added pill (`index.html` line 344), routed through `PageImo` (index.html admin case). `imo_owner` now sees IMO HQ + their own producing-agency surfaces (P&L, Org, Recruiting, Compliance) folded into the sidebar. |
| E3  | Demo agency (Atlas, `e0a68c9f-…`) was visible in production fleet views | **P1** | Fleet hydration filters `is_demo === true` by default. Super_admin toggles "Demo" checkbox in OverviewTab/AgenciesTab to include them. Demo rows always render a `<demo>` chip when shown. The `DEMO_AGENCY_IDS` set is an additional belt-and-suspenders gate keyed on `agencies.id` for envs that haven't run migration 04 (which adds the `is_demo` column). |
| E4  | `viewer_agency_ids()` SECURITY DEFINER helper already returns multiple `uuid` (one per active `agency_members` row). For IMO owners with member rows on each sub-agency, this returns the full set without changes. Existing migration `0015_tenant_isolation` already scopes every authenticated read on tenant tables through this helper. | OK | No SQL change needed. Verified by `SystemTab` probe — surfaces `n agency_ids visible` so the operator can confirm visually. |
| E5  | Member management UI for admins did not exist | **P1** | `MembersTab` calls `update_member_role` and `deactivate_member` RPCs first; falls back to direct `agency_members.update()` if the RPC doesn't exist on a stale env. Both paths surface the server error verbatim so RLS / permission failures are visible (not swallowed). |
| E6  | `agencies` table queried for columns (`is_demo`, `onboarding_complete`, `parent_agency_id`) not present in checked-in migrations — they come from the live remote migrations from the 2026-05-11 deploy. | LOW | On stale envs (no remote migration), the fleet load surfaces the PostgREST error verbatim via the error panel — fail-loud per the overnight handoff principle. |

### B. UX

| ID  | Finding | Severity | Action |
|-----|---------|----------|--------|
| U1  | No fleet view existed for IMO operators — they couldn't see all the sub-agencies under them on one screen | **P0** | OverviewTab (4 KPI strip + recent agencies table + pending onboarding panel) + AgenciesTab (full searchable table) |
| U2  | No drill-into-sub-agency action | **P0** | "Open →" button on every row sets `localStorage.repflow.active_agency`, fires `hydrateFromSupabase`, navigates to `/admin` (or `/today` if onboarding not finished, so the wizard catches them). |
| U3  | No aggregate metrics across sub-agencies (policies, premium, producers) | **P0** | KPI strip on OverviewTab + BillingTab. Numbers roll up across `viewer_agency_ids()`-scoped reads of `reps` + `policies`. |
| U4  | No provisioning entry point from the admin surface | **P1** | "+ Provision sub-agency" CTA in header + every tab. ProvisionModal collects name/owner-email/state/tier/plan and calls the RPC. |
| U5  | Audit log was per-agency only (in `page-admin.jsx`) | **P1** | AuditTab joins audit logs across the viewer's full agency_id set with agency + actor_role filters + realtime refresh on inserts. |

### C. UI

| ID  | Finding | Severity | Action |
|-----|---------|----------|--------|
| I1  | Repflow dark+amber DS doesn't match the koino.capital marketing site (which is the productized look) | **P1** | New `.koino-skin` namespace in `styles.css` — tokens lifted verbatim from `storefront-static/index.html` (`--a: #00d4aa`, `--bg: #050505`, etc.). Scoped to the admin/imo surface; no bleed into rep/manager/owner pages. |
| I2  | Cards in the old admin were too padded (18–24px) | OK | New card padding 10–14px. Header at 8–10px. KPI value font: JetBrains Mono 1.55rem (was Inter 1.8rem on old hero). |
| I3  | Grid was sparse — 2 column at 14px gap | OK | KPIs now 4-up at 10px gap. Tables 6-column at 10px gap. 2-col layout 1.5fr:1fr with 12px gap. |
| I4  | Tabular numbers were in Inter (no fixed-width) | OK | JetBrains Mono via `.k-num` class with `font-variant-numeric: tabular-nums`. |
| I5  | Primary CTA buttons used `--accent-money` (oklch green) on dark blue — low contrast vs koino's #00d4aa on near-black with **black text on green** | OK | `.k-btn-primary { background: var(--k-a); color: #000 }` — matches the site exactly. Hover: brighter teal + glow shadow. |

---

## Files touched

- **NEW**: `page-imo.jsx` (~720 lines) — full IMO HQ surface
- **NEW**: `ADMIN_AUDIT_REPORT.md` — this file
- `index.html` — script src rename (`page-platform-admin.jsx` → `page-imo.jsx`), admin route includes `imo_owner` + `super_admin`, role-sync routes `imo_owner` to `platform`, role-pill includes `IMO`, cache busts (`styles.css?v=78`, `page-imo.jsx?v=78`)
- `shared.jsx` — `NAV.imo_owner` added (10 entries); `admin` NAV `Users` → `Members` to match `users` route label
- `styles.css` — `.koino-skin` block appended (~140 lines) — scoped design tokens, tab pills, KPI cards, dense tables, chips, buttons, form controls, system probe rows

---

## What I did NOT change (deliberate)

- **No SQL migrations** — the brief said the RPCs (`provision_sub_agency`,
  `viewer_agency_ids`, `update_member_role`, `deactivate_member`,
  `log_audit`) are already deployed from the 2026-05-11 batch. Adding
  duplicate migrations would conflict. If RPCs are missing in a given
  env, the UI surfaces the error verbatim.
- **No bleed into rep/manager/owner surfaces** — `.koino-skin` is scoped.
  The rest of the app keeps the existing Repflow dark+amber tokens. A
  full DS migration is out of scope for this 2.5h time-box.
- **No real Stripe wire-up** in BillingTab — uses a static `PLAN_MRR`
  map until webhooks land. Numbers are clearly labeled "Est. MRR".
- **No agencies.is_demo column migration** — assumed already present
  from migration 04. Belt-and-suspenders gate on `DEMO_AGENCY_IDS` Set
  for envs where it isn't.

---

## How to verify (smoke test)

1. Sign in as `super_admin` or `admin` (or flip via Tweaks → Role).
2. Sidebar should show the IMO nav: **IMO HQ / Sub-agencies / Members / Billing / Audit log / System** (for imo_owner) or **Platform / Agencies / Members / Billing / Audit log / System** (for admin).
3. Default landing on `/platform` (Overview tab).
4. **Overview**: 4 KPI cards + recent agencies + pending onboarding. "+ Provision" button opens modal.
5. **Agencies**: search box + status filter + per-row "Open →" drill.
6. **Members**: role dropdown should update via `update_member_role` (or direct update fallback). Remove button asks for confirm.
7. **Billing**: per-plan + per-agency MRR estimate.
8. **Audit log**: rows from agency_audit_log across all `viewer_agency_ids()` agencies; filterable.
9. **System**: 5 probes — green dots if healthy, yellow if env vars missing, red if RPC errors. "viewer_agency_ids() returns N agency_ids visible" sanity line.
10. Toggle `Demo` checkbox (super_admin only) — Atlas row should appear/disappear; when present it carries a `demo` chip.

---

## RPCs / tables this branch assumes

If any are missing in a given env, the affected tab surfaces the
PostgREST error verbatim (fail-loud, per the overnight handoff).

**RPCs**:
- `provision_sub_agency(name, slug, tier, owner_email, primary_state, plan)` — required for ProvisionModal
- `viewer_agency_ids()` — required for SystemTab probe (queries also rely on the RLS scoping it provides)
- `me()` — required for SystemTab probe
- `update_member_role(p_agency_id, p_user_id, p_role)` — soft; falls back to direct update
- `deactivate_member(p_agency_id, p_user_id)` — soft; falls back to direct update
- `log_audit(p_agency_id, p_action, p_target, p_metadata, p_actor_role)` — already wired in `page-billing.jsx`

**Tables / columns**:
- `agencies` with `is_demo`, `onboarding_complete`, `parent_agency_id`, `plan`, `primary_state`
- `agency_members` with `active`, `joined_at`, `role`, `rep_id`
- `agency_audit_log` with `action`, `actor_role`, `target`, `metadata`
- `policies` with `agency_id`, `ap_cents`
- `reps` with `agency_id`, `presence`

---

## Time accounting

- Repo mapping + RPC tracing: ~25 min
- `page-imo.jsx` v1 (Repflow DS): ~50 min
- Pivot to koino.capital DS + `.koino-skin` rewrite: ~40 min
- Routing wiring (index.html + shared.jsx): ~15 min
- This report: ~15 min
- **Total**: ~2h 25min — under the 2.5h time-box

---

— Done. No `git push`. Branch ready for review.
