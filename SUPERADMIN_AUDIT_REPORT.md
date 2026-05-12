# SUPERADMIN AUDIT REPORT — 2026-05-12

Branch: `feat/role-audit-superadmin-2026-05-11` off `feat/onboarding-frontend-2026-05-11`.
Scope: every surface the super_admin role touches — page-platform.jsx + the
sidebar pages it advertises (HQ / Agencies / Users / Billing / Audit / System
/ All IMOs), the RLS layer underneath, and the auth/identity pipeline that
decides who is a super_admin.

The role is broken end-to-end. This report enumerates the bugs, ranks them,
and lists exactly what was fixed in this branch.

---

## (A) ENGINEERING — RLS bypass, identity, leakage

### A1 ▌CRITICAL ▌ super_admin has no DB bypass — sees only its own agency

**File:** `supabase/migrations/0015_tenant_isolation.sql` lines 24–35.

```sql
create or replace function public.viewer_agency_ids()
returns setof uuid
language sql stable security definer
as $$
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
$$;
```

Every tenant-table RLS policy in 0015 (`policies`, `commissions`,
`pipeline`, `queue`, `reps`, and the loop at 142–183 that retro-fits the
rest) reads `agency_id in (select public.viewer_agency_ids())`.

There is **no super_admin carve-out**. A user with `agency_members.role =
'super_admin'` returns exactly the agency_ids of memberships they hold.
If Ian has a single membership (his own IMO), he sees one row, even
though the frontend offers him "All agencies" / "All users" / "Global
audit" nav items.

The old export `07_replace_permissive_rls_with_agency_scoped.b64` (which
is **not** in the live migration chain — replaced by 0015) had the
correct shape: `is_superadmin() OR agency_id = get_user_agency_id()`. The
helper `public.is_superadmin()` was **explicitly dropped** by migration
0001 line 39 and never re-introduced.

**Fix landed:** migration `0019_super_admin_platform.sql`:
- New `public.koino_super_admins(user_id, email, granted_at, granted_by,
  active, notes)` allowlist table, independent of `agency_members`. RLS
  membership has **nothing** to do with super-admin status — they are
  orthogonal axes.
- New `public.is_super_admin()` security-definer helper that reads from
  it.
- `viewer_agency_ids()` rewritten to short-circuit: if `is_super_admin()`,
  return `agencies.id` for every row. The set semantics of the existing
  RLS policies pick up the bypass without re-writing each policy.
- For policies that don't go through `viewer_agency_ids()` (the two
  expense policies in 0017 and the two RPCs in 0009 that branch on
  `me().role`), they now branch on `is_super_admin() OR (existing
  check)`.

### A2 ▌CRITICAL ▌ `/api/me` doesn't return `is_super_admin`

**File:** `api/me.js`, lines 53–101.

`/api/me` blindly passes through whatever `public.me()` returns. The RPC
returns `role` from `agency_members.role`. Two failure modes:

1. If Ian is `role='super_admin'` in a single `agency_members` row, the
   frontend gets the right role string — but no field telling the API
   layer / data fetcher to lift the agency scope.
2. If Ian has **no** `agency_members` row (clean Supabase project, never
   onboarded into his own IMO), `me()` returns 0 rows → API falls
   through to demo (Atlas, "Marcus Avila"). He never even sees a
   super-admin sidebar.

**Fix landed:** `/api/me` now hits `public.me()` AND `public.is_super_admin()`
in parallel, merges into the response: `is_super_admin: bool`, falls back
to true for `super_admin`-role users even when no membership row exists.
`lib/me.js` exposes `window.isSuperAdmin()` reading **both** sources so
the UI gate works regardless of how Ian got the privilege.

### A3 ▌CRITICAL ▌ `page-platform-admin.jsx` doesn't exist — entire surface is dead

**File:** `index.html` lines 60, 256, 262–267 reference
`page-platform-admin.jsx?v=76` and `window.PagePlatformAdmin`. The file
**is not in the repo** (verified: `ls page-platform-admin.jsx → No such
file`). Every super_admin sidebar click (`platform`, `agencies`, `users`,
`billing`, `audit`, `system`) resolves to `null` and renders a blank
page. The platform-imo route doesn't even have a switch case.

Same issue for `window.ImpersonationBanner` (referenced in index.html
line 315) and `window.adminImpersonate` (cleared by sign-out in
page-auth.jsx line 418) — the "Acting as agency X" banner described in
`CHANGES.md` `PLATFORM-ADMIN VISIBILITY` (2026-05-05) never made it into
the tree.

**Fix landed:** new `page-platform-admin.jsx`, loaded by `index.html`.
Exports `window.PagePlatformAdmin` + `window.ImpersonationBanner`.
Subpages: hq · agencies · users · billing · audit · flags · system.
Dark + amber terminal feel matching the rest of the app (the css custom
properties already exist; we use them — no new tokens).

### A4 ▌HIGH ▌ Frontend single-agency lookups leak nothing but break super_admin

**Files:**
- `page-admin.jsx` line 29: `sb.from("agencies").select("*").limit(1).maybeSingle()`
- `page-billing.jsx` line 262 (audit instrumentation): same pattern
- `page-admin.jsx` lines 33–35: subsequent fetches `.eq("agency_id", ag.id)` where `ag` is whatever single row RLS happened to return first

For a real owner, this is fine — RLS returns exactly one row. For a
super_admin with the proposed bypass (A1), `.limit(1)` would still pull
**one random agency** instead of the whole platform, so the global
admin view would look like a stuck-on-tenant-A page.

**Fix landed:**
- New `page-platform-admin.jsx` does NOT use these patterns; it explicitly
  selects all agencies with paging.
- Page-admin.jsx remains the single-agency view (correct for owner/manager).
  No change there — it's role-appropriate.
- Audit instrumentation in page-billing.jsx kept as-is because the audit
  log row needs to be attributed to the **acting** agency; super_admin
  writes go through `act_as_agency_id` (B2) which the patched
  `tryAudit` now reads.

### A5 ▌MEDIUM ▌ `data.jsx scope()` pins every fetch to `me().agency_id`

**File:** `data.jsx` lines 195–242.

`scope()` injects `agency_id=eq.{me.agency_id}` into every PostgREST
fetch on tables in the `TABLES_WITH_AGENCY_ID` set. Even if RLS lets a
super_admin see everything (A1 fix), this client-side filter would still
clamp the result set to one agency.

Two routes for a super_admin to see cross-agency:
- **Act-as a specific agency** — set `localStorage.repflow.active_agency`
  to that agency's id. `getActiveAgencyId()` already prefers explicit
  switcher. This is the chosen path; super_admin's act-as dropdown
  writes this key.
- **Fleet HQ view** — fetches go through dedicated cross-agency RPCs
  (`platform_agencies_summary`, `platform_users_summary`,
  `platform_audit_recent`) that explicitly select across all agencies.
  These RPCs are super_admin-only (security-definer + check
  `is_super_admin()`).

**Fix landed:** new RPCs in 0019. `data.jsx` is **unchanged** —
super_admin sees scoped data per the active-agency switcher, which is
correct (you want to debug "in" the agency, not see everyone's leads
overlapping). The cross-agency views are explicit, separate queries.

### A6 ▌MEDIUM ▌ AgencySwitcher only shows memberships

**File:** `page-billing.jsx` lines 195–247.

```js
sb.from("agency_members").select(...)
  .eq("user_id", data.session.user.id).eq("active", true)
```

If super_admin isn't a member of an agency, they can't switch to it. So
"act as agency to debug" doesn't work for any agency they don't already
belong to.

**Fix landed:** `page-platform-admin.jsx` Agencies subpage has an
"Act as agency" button per row. It writes
`repflow.active_agency` + a new `repflow.super_admin_acting_as` flag
(read by the ImpersonationBanner). When the flag is set, the
AgencySwitcher renders a synthetic "Acting as: Foo (super-admin)"
chip on top of the membership list. Acting-as is logged via the new
`agency_audit_log` row with `kind='super_admin_act_as_start' /
_stop'`.

### A7 ▌MEDIUM ▌ No `koino_super_admins` allowlist persisted

The whole privilege escalation path right now is "set
`agency_members.role` to `super_admin`". That conflates membership
role (owner/manager/rep) with platform admin (super_admin). A user can
be a super_admin **and** a rep in some agency — those are different
axes.

**Fix landed:** `koino_super_admins` (A1) is the source of truth. It's
seeded from `KOINO_SUPER_ADMIN_EMAILS` env var on first migration run,
matching the CLAUDE.md pattern ("Allowlists come from env vars"). No
runtime UI for adding super-admins — must be added via the env var +
re-running the seed RPC, deliberately. The Users subpage of the
platform admin can mark/unmark via the seed RPC for convenience, but
the env var stays canonical.

### A8 ▌LOW ▌ Demo agency visibility

`agencies.is_demo` exists since migration 04. Nothing surfaces it to a
super_admin. They can't tell which agencies in the platform are real
vs. seed.

**Fix landed:** Agencies subpage has a "Show demo agencies" toggle (off
by default). Persists to `repflow.super_admin.show_demo`. When off,
`is_demo = true` agencies are filtered client-side out of the list, the
HQ counters, and the user/billing aggregates.

### A9 ▌LOW ▌ Feature flags have nowhere to live

There's no `feature_flags` table, column, or jsonb anywhere.
Per CLAUDE.md "no dedicated table" guidance:

**Fix landed:** Platform-wide flags live as keys in `public.org_settings`
under prefix `feature_flag.<name>`. Per-agency overrides live in
`agencies.config jsonb` (which `lib/agency-config.js` already manages)
under the `feature_flags` key. The Flags subpage on platform admin
edits both — global toggle and a per-agency override table.

---

## (B) UX — KOINO HQ mission control

The super_admin sidebar promises six surfaces. Before this branch all
six rendered blank. After this branch:

### B1 Internal HQ (`/platform`)

Single screen, no scroll bait. Six panel groups, top-to-bottom:

1. **Fleet line** — top hero strip. `Agencies`, `Active users 24h`,
   `Live calls now`, `MRR (sum across Stripe)`, `Open NIGOs across
   platform`, `Audit events 24h`. All from the four new platform RPCs.
   Live = green dot; stale (>5min) = amber.
2. **Per-agency revenue strip** — sparkline-per-agency, hover shows
   plan + MRR + last-30 commissions, click = act-as.
3. **Agent fleet status** — reads `public.hardware` joined to
   `public.ai_agents` (enrolled via `agent_install_tokens.used_for_id`
   heartbeats). Per-host: kind, load %, agent count, last-heartbeat age
   with live (<5min) / stale (<1h) / dead (>1h) chip. Cross-agency.
4. **BLOCKERS card** — items from `agency_audit_log` with
   `kind='blocker_on_operator'` (new kind). Surfaces things the
   automation flagged that need Ian-as-operator action. Each row has
   "Resolve" → marks the row resolved, "Open" → deep-links to the
   acting agency.
5. **Recent global audit** — bottom-of-screen tail. Last 12 entries
   across all agencies, color by severity, click to filter the full
   Audit tab.
6. **Capabilities probe row** — re-uses the existing
   `useCapabilityStatus` hook from page-platform.jsx (Voice / SMS /
   Transcription) so a platform admin sees infra state at a glance
   without leaving HQ.

### B2 ImpersonationBanner

Sticky top of `<main>`. Renders when `repflow.super_admin_acting_as` OR
`window.adminImpersonate` is set. Status-warn tone (matches the rest of
the app's accent palette). Copy:

> Acting as **`{agency_name}`** as super_admin · every write will be
> attributed to your user_id but scoped to this agency · `Stop`

Banner persists across reloads (reads sessionStorage on mount).
Subscribes to `admin:impersonate` events for reactive start/stop.

### B3 Other subpages

- **Agencies** — full list with plan / member count / MRR / NIGO open
  count / created_at / `is_demo` chip / row actions: `Act as` ·
  `Edit flags` · `Open audit` · `Edit plan` (Stripe portal deep-link).
- **Users** — paginated cross-agency user list, with role per
  membership. Allows toggling `super_admin` allowlist membership.
- **Billing** — cross-agency Stripe roll-up (sum subscriptions, MRR,
  failed-payment count). For now reads from `agencies.stripe_*` columns;
  Stripe sync is a separate task tracked in OVERNIGHT_HANDOFF.
- **Audit** — cross-agency `agency_audit_log` viewer with date / kind /
  actor filters. Defaults to last-24h, all agencies, all kinds.
- **Flags** — global + per-agency feature flag editor (per A9).
- **System** — env-vars / connector capability probe row / Supabase
  project ref / migration version / cron job status.

---

## (C) UI — koino.capital DS (mint-green + deep black, denser cards)

The platform-admin surface mirrors the koino.capital storefront DS
(`KOINO/ventures/products/storefront-static/`) — NOT the Repflow app's
amber terminal DS. Tokens lifted directly from the storefront's
`:root`:

| Token              | Value          | Use                                |
|--------------------|----------------|------------------------------------|
| `--accent-money`   | `#00d4aa`      | primary mint-green (CTAs, success) |
| `--accent-status`  | `#7c3aed`      | secondary purple                   |
| `--accent-heat`    | `#f59e0b`      | warning / impersonation amber      |
| `--bg-base`        | `#050505`      | deepest surface                    |
| `--bg-raised`      | `#0d0d0d`      | card body                          |
| `--bg-elevated`    | `#151515`      | chip / hover                       |
| `--border-subtle`  | `#1a1a1a`      | default border                     |
| `--border-strong`  | `#2a2a2a`      | hover border                       |
| `--text-primary`   | `#e8e8e8`      | body text                          |
| `--text-tertiary`  | `#888`         | meta text                          |
| `--font-stack`     | Inter          | body                               |
| `--font-mono`      | JetBrains Mono | numbers, code                      |

These are scoped to a `.koino-platform` wrapper so they don't bleed into
the rest of the Repflow app. Repflow's amber DS (`--accent-money` →
amber/oklch gold) is **untouched** for every other surface.

Density choices vs. the storefront's defaults:
- Card padding: storefront uses 32-40px; platform admin uses **10-14px**
  to pack more rows-per-screen for an operator surface.
- Border radii: **10-12px** on panels, 8px on buttons, 100px on chips
  (matches the rounded soft look without going full pill on tables).
- Grid gaps: **8-12px** (tight). Six-card hero strip lives in
  `grid-template-columns: repeat(6, 1fr)`, gap 8.
- Hover: subtle `translateY(-1px)` lift on cards + metrics (matches the
  storefront's `.btn-p:hover{transform:translateY(-1px)}`); no
  amber-glow corners.
- Numbers in `--font-mono` with `font-feature-settings: 'tnum'` so
  columns lock as MRR / counts grow.
- Audit log row height ~28px (was ~36px in the amber DS).
- Impersonation banner uses `--accent-heat` (amber) with a pulsing dot
  — same colour Repflow already uses for "warn" status, but presented
  as a soft gradient (`linear-gradient(90deg, rgba(245,158,11,0.12),
  rgba(245,158,11,0.04))`) rather than a hard fill.

---

## (D) ENGINEERING — anti-leak verification

Did the new platform-admin surface leak anything to non-super_admin?

1. **`PagePlatformAdmin` itself** — only mounts via sidebar nav items
   that exist for `admin` + `super_admin`. `admin` is the IMO operator
   role; they legitimately need a subset of these surfaces. The new
   page checks `window.isSuperAdmin()` and renders a degraded
   single-IMO view when only `admin` (no super-admin allowlist
   membership), with the global cards hidden.
2. **RPCs `platform_agencies_summary` / `platform_users_summary` /
   `platform_audit_recent` / `platform_act_as_log`** — all wrapped in
   `if not is_super_admin() then raise exception 'forbidden' end if;`
   inside the function body, security-definer. Anyone else calling them
   gets a 500 from PostgREST.
3. **`koino_super_admins`** — RLS enabled, policies are super-admin-only
   read + service-role-only write. Anon / authenticated get nothing.
4. **`agency_audit_log` global view** — the existing per-tenant policy
   stays; the cross-tenant view goes through
   `platform_audit_recent()` (definer + check). Non-super-admin trying
   to list across agencies just doesn't see other agencies' rows.
5. **`act-as` writes** — logged in `agency_audit_log` of the target
   agency with `kind='super_admin_act_as_start'` and the super-admin
   user_id in `metadata`. So the target agency's owner can see "Ian
   was in your tenant on 2026-05-12 at 14:32, looked at NIGO queue"
   in their own admin log. Transparency by default.

---

## (E) Open items deferred (not in this branch)

- **Stripe cross-agency MRR roll-up.** Billing tab placeholder reads
  agency-level Stripe metadata only. Real Stripe API aggregation
  (per-customer subscription + invoice history across agencies) needs
  a server-side fan-out — tracked separately.
- **Agent fleet panel.** Reads Repflow's own `public.hardware` +
  `public.ai_agents` via the new `platform_fleet_status()` RPC. Shows
  every host enrolled through Repflow's host-enrollment flow
  (page-platform.jsx → Hardware → Enroll). No external agent pools are
  pulled — this surface is Repflow-scoped, full stop.
- **Granular flag rollout** (% rollouts, cohort assignments). Flags
  shipped here are boolean. Add cohort logic when the second flag
  needs it.
- **Feature-flag audit trail.** Edits to flags log to
  `agency_audit_log` via `kind='feature_flag_changed'`, but there's
  no rollback UI yet. Manual revert by editing the value back.

---

## Files touched in this branch

- `SUPERADMIN_AUDIT_REPORT.md` (this file)
- `supabase/migrations/0019_super_admin_platform.sql` (new)
- `supabase/migrations/0020_super_admin_section_drill.sql` (new — appended in
  the section drill pass: blocker_resolve RPC, agent_heartbeats fleet view,
  audit_export RPC)
- `api/me.js` — emit `is_super_admin`
- `api/stripe/admin.js` (new — cross-agency Stripe roll-up endpoint)
- `lib/me.js` — `window.isSuperAdmin()` recognises new flag, hot-path
  cache invalidation when act-as toggles
- `lib/agency-config.js` — adds `featureFlag(name, default)` consumer
- `lib/feature-flags.js` (new — minimal flag-read helper, loaded early)
- `page-platform-admin.jsx` — section-drill rewrite, ~1000 lines
- `index.html` — script tag was already present + new flag-helper load

---

## (F) Section drill — every button, every fetch (2026-05-12 second pass)

Per Ian's drill instruction: tab-by-tab audit of what's actually wired vs.
what's a display stub. Format below: WIRED / STUB / HARDCODED for each
element, with the fix applied.

### F1 Fleet health strip (HQ — top hero)

| Element        | Before               | After                                      |
|----------------|----------------------|--------------------------------------------|
| 6 KPI tiles    | WIRED to `platform_hq_kpis` | WIRED + clickable — each tile routes to the drill |
| Tile click     | STUB (no onClick)    | WIRED — Agencies → /agencies, Active 24h → /audit (filtered to 24h non-system), Audit 24h → /audit, MRR → /billing, NIGOs → opens cross-agency NIGO modal, Blockers → /audit?kind=blocker_on_operator |
| MRR sparkline  | HARDCODED (no spark) | WIRED — `platform_hq_mrr_trend(p_days int)` RPC returns daily MRR for last 7d |
| Hover context  | none                 | tooltip: "click to drill" + sub-stat       |
| Re-sync btn    | WIRED                | WIRED                                      |

### F2 Top agencies by MRR panel (HQ left column)

| Element       | Before              | After                                                 |
|---------------|---------------------|-------------------------------------------------------|
| Rows          | WIRED               | WIRED + row click → drills to /audit filtered to agency_id |
| Act-as button | WIRED (RPC + flag)  | WIRED + post-act, auto-routes to /pipeline for that agency |
| MRR column    | WIRED (via subs)    | WIRED — now reads from new Stripe admin endpoint when key present, falls back to local subs table |
| Plan chip     | WIRED               | WIRED                                                 |

### F3 BLOCKERS card (HQ right column)

| Element     | Before                            | After                                                |
|-------------|-----------------------------------|------------------------------------------------------|
| List        | WIRED filter on audit kind        | WIRED — same                                          |
| Source      | NO WRITER (filter showed nothing) | wired writer: `flag_blocker_on_operator(agency, kind, target, metadata)` RPC, callable from cron / agent code |
| Resolve btn | STUB (not present)                | WIRED — `resolve_blocker(id, note)` RPC. Writes resolution row + marks original `metadata.resolved=true`. Audit-trailed. |
| Drill-in    | STUB                              | WIRED — row click → act-as that agency + route to relevant page from `metadata.deep_link` if present |

### F4 Agent fleet status (Repflow hosts + agents)

| Element       | Before                          | After                                                                |
|---------------|---------------------------------|----------------------------------------------------------------------|
| Whole panel   | MISSING (only capability probe) | NEW `<AgentFleetPanel/>` on HQ right column                          |
| Hardware list | n/a                             | WIRED — reads `public.hardware` (kind/status/uptime/load/last_heartbeat) |
| Agent list    | n/a                             | WIRED — reads `public.ai_agents` joined to hardware via host_id      |
| Heartbeat age | n/a                             | WIRED — computed client-side from `last_heartbeat`. Live (<5min) / stale (<1h) / dead (>1h) chip |
| Scope         | n/a                             | Repflow agent infra only. Hosts enrolled via page-platform.jsx → Hardware → Enroll → `agent_install_tokens` flow. No external agent fleets surfaced. |

### F5 Act-as agency

| Element              | Before                 | After                                                |
|----------------------|------------------------|------------------------------------------------------|
| start/stop RPCs      | WIRED                  | WIRED — same                                         |
| localStorage flag    | WIRED                  | WIRED — same                                         |
| data.jsx scope read  | WIRED via getActiveAgencyId() | WIRED + verified by tracing scope() through one query |
| Banner on platform   | WIRED                  | WIRED — same                                         |
| Banner on other pages| MISSING                | WIRED — `<ImpersonationBanner/>` now mounts above topbar in `<main>` for every page (not just platform-admin), so super-admin sees the warning when they navigate to /pipeline or /floor while acting-as |
| Topbar agency chip   | shows me().agency_name | WIRED — now overrides to the acting-as agency name in topbar `AgencyChip` when impersonating, with amber styling |
| Stop button          | WIRED                  | WIRED                                                |

### F6 Global agency_audit_log viewer

| Element       | Before                 | After                                                                 |
|---------------|------------------------|-----------------------------------------------------------------------|
| RPC fetch     | WIRED                  | WIRED                                                                 |
| Time filter   | WIRED (1h/6h/24h/3d/7d)| WIRED                                                                 |
| Kind filter   | WIRED                  | WIRED + agency filter dropdown (NEW)                                  |
| Row click     | STUB                   | WIRED — click → AuditRowDetail modal showing full JSON metadata + "Act as this agency" + "Filter to agency" buttons |
| CSV export    | STUB                   | WIRED — downloads filtered set as CSV via `platform_audit_export` RPC |
| Severity dot  | WIRED                  | WIRED                                                                 |

### F7 Demo toggle

| Element       | Before                            | After                                       |
|---------------|-----------------------------------|---------------------------------------------|
| HQ checkbox   | WIRED                             | WIRED                                       |
| Agencies tab  | WIRED                             | WIRED                                       |
| Billing tab   | WIRED                             | WIRED                                       |
| Flags tab     | always included demo              | WIRED — now reads the same toggle           |
| Persistence   | WIRED (localStorage)              | WIRED                                       |
| Demo chip on row | WIRED                          | WIRED                                       |

### F8 Feature flags

| Element              | Before                                   | After                                                                                                                |
|----------------------|------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Storage              | WIRED (org_settings + agencies.config)   | WIRED                                                                                                                |
| Editor UI            | WIRED                                    | WIRED                                                                                                                |
| **Consumer**         | **NONE — flags had ZERO effect**          | WIRED — `lib/feature-flags.js` adds `window.featureFlag(name, default)` reading agency override → global → default; loaded BEFORE every page-*.jsx |
| Per-agency overrides | WIRED storage                            | WIRED storage + consumer                                                                                              |
| Hot-reload           | needed page refresh                      | WIRED — `feature-flags:changed` event fires on save; consumers can subscribe                                          |
| Seeded examples      | none                                     | Three seed flags written by 0020: `predictive_cards` (default true), `repflow_desktop_install` (false), `stripe_billing_admin` (false). Each has a comment naming the consuming file. |

### F9 Stripe billing oversight

| Element              | Before                                       | After                                                                                       |
|----------------------|----------------------------------------------|---------------------------------------------------------------------------------------------|
| Local subs sum       | WIRED (with undefined_table fallback)        | WIRED — kept as fallback                                                                    |
| Cross-customer Stripe| STUB ("tracked separately")                  | WIRED — `/api/stripe/admin` edge function lists Stripe subscriptions, groups by `customer.metadata.agency_id`, returns per-agency MRR + status counts |
| Status counts        | none                                         | WIRED — active / trialing / past_due / canceled                                              |
| Refresh hint         | none                                         | WIRED — page calls /api/stripe/admin when feature flag `stripe_billing_admin = true` AND STRIPE_SECRET_KEY env is present |
| Failed-payment count | none                                         | WIRED — same endpoint, `past_due` count surfaces in HQ as a new "Past due" chip on the Billing tab |

Endpoint refuses non-super (verifies via `/api/me`-equivalent JWT check
against `koino_super_admins` allowlist).

No `data.jsx` changes — the existing `scope()` is correct for act-as
mode and shouldn't be lifted for super_admin.

— ends —
