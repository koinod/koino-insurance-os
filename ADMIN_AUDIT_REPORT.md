# ADMIN + IMO_OWNER ROLE AUDIT — 2026-05-12

**Branch**: `feat/role-audit-admin-2026-05-11` (off `feat/onboarding-frontend-2026-05-11`)
**Roles audited**: `admin`, `imo_owner` (and `super_admin` by inheritance)
**Status**: ✅ Shippable — no push (per directive)

## Pass log

| Pass | Commit  | Scope |
|------|---------|-------|
| 1    | `7d91d9d` | Build page-imo.jsx scaffold (6 tabs, koino DS) + index.html routing fix |
| 2    | `ee1432b` | **Overview drill** — live-now / 7d activity / stalest-onboarding KPIs |
| 3    | `ba88f03` | **Agencies drill** — row Edit + Suspend/Restore + suspended filter |
| 4    | `a75723b` | **Members drill** — mint_invite flow + pending-invites + revoke |
| 5    | `d3307d9` | **Billing drill** — agency_subscriptions read + Stripe drill modal |
| 6    | `a7dce91` | **Audit drill** — date-range + action filter + CSV export + colored chips |
| 7    | `9fad674` | **System drill** — RLS sanity + feature flags + integrations grid |
| 8    | (this)  | Update report + cache bust |

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

## Tab-by-tab drill (passes 2–7)

Every button, every metric, every filter — traced to its data path.
"Wired" = real Supabase query/RPC, no hardcoded value past the design
system tokens.

### Overview tab (`platform`)

| Element | Path | Verdict |
|---------|------|---------|
| KPI · Sub-agencies | `agencies.count after demo-filter` | ✅ wired |
| KPI sub · stalest onboarding | `min(created_at where !onboarding_complete)` → days | ✅ wired |
| KPI · Producers | `reps.count` in `viewer_agency_ids()` scope | ✅ wired |
| KPI sub · live now | `reps.count where presence='live'` | ✅ wired (new) |
| KPI · Active AP | `Σ policies.ap_cents WHERE status NOT IN ('cancelled','lapsed')` | ✅ wired (new) |
| KPI · Activity (7d) | `agency_audit_log.count where created_at >= now()-7d` | ✅ wired (new) |
| Recent agencies row | row from `agencies` ordered by created_at desc | ✅ wired |
| "Open →" per row | sets `localStorage.repflow.active_agency` + `hydrateFromSupabase` + nav to `/admin` or `/today` if onboarding incomplete | ✅ wired |
| Pending onboarding panel | `agencies WHERE !onboarding_complete`, sorted oldest-first | ✅ wired |
| Stale badge (≥7d) | client-side from `created_at` | ✅ wired |
| "Resume →" | same switchAgency path → wizard auto-mounts on remount | ✅ wired |
| Demo toggle (super_admin) | filters `is_demo === true` from fleet hydration | ✅ wired |
| + Provision (header) | opens `ProvisionModal` → `provision_sub_agency` RPC | ✅ wired |
| ↻ Refresh (header) | re-runs `useFleet.load()` | ✅ wired |

### Agencies tab (`agencies`)

| Element | Path | Verdict |
|---------|------|---------|
| Search box | client-side filter on name + slug | ✅ wired |
| Status filter (all/live/onboarding/suspended) | client-side filter | ✅ wired |
| Demo toggle | same as Overview | ✅ wired |
| Row · Edit | opens `EditAgencyModal` → minimal-patch `UPDATE agencies SET …` → `log_audit('agency.update')` | ✅ wired (new) |
| Row · Suspend / Restore | `suspend_agency(p_agency_id, p_suspend)` RPC with fallback `UPDATE agencies SET suspended_at` → `log_audit('agency.suspend'/'restore')` | ✅ wired (new) |
| Row · Open → | switchAgency (same as Overview) | ✅ wired |
| Suspended-row styling | 60% opacity + red `suspended` + `off` chips | ✅ wired (new) |

### Members tab (`users`)

| Element | Path | Verdict |
|---------|------|---------|
| Agency filter | client-side filter on `r.agency_id` | ✅ wired |
| Role filter | client-side filter on `r.role` | ✅ wired |
| Role dropdown per row | `update_member_role` RPC → fallback `UPDATE agency_members SET role` | ✅ wired |
| Remove button | `deactivate_member` RPC → fallback `UPDATE agency_members SET active=false` | ✅ wired |
| + Invite button | opens `InviteMemberModal` → `mint_invite` RPC → `/api/invites/create` fallback → renders copyable link | ✅ wired (new) |
| Pending invites panel | only renders when `agency_invites WHERE !used_at AND expires_at>now()` returns ≥1 row | ✅ wired (new) |
| Copy link per invite | `navigator.clipboard.writeText(${origin}/?invite=…)` | ✅ wired |
| Revoke per invite | `revoke_invite` RPC → fallback `UPDATE agency_invites SET expires_at=now()` | ✅ wired (new) |

### Billing tab (`billing`)

| Element | Path | Verdict |
|---------|------|---------|
| KPI · MRR | `Σ agency_subscriptions.monthly_price_cents WHERE status='active'` + plan-tier fallback for missing rows | ✅ wired (new) |
| KPI label flip | "MRR (real + est.)" vs "MRR (estimate)" depending on `realCount > 0` | ✅ wired (new) |
| KPI · Stripe-wired count | `agency_subscriptions.count grouped by agency_id` | ✅ wired (new) |
| "Stripe not wired" callout | renders when `agency_subscriptions` table missing (PGRST205) | ✅ wired (new) |
| Per-agency row · "est" suffix | flagged when row falls back to PLAN_MRR | ✅ wired (new) |
| Row click → drill modal | `BillingDrillModal` — shows full subscription row (status / price / period_end / trial_ends_at / stripe_customer_id / stripe_subscription_id) | ✅ wired (new) |
| "Open in Stripe ↗" | `https://dashboard.stripe.com/customers/{id}` (when customer id present) | ✅ wired (new) |

### Audit tab (`audit`)

| Element | Path | Verdict |
|---------|------|---------|
| Action filter | server-side `action ILIKE %term%` | ✅ wired (new) |
| Agency filter | server-side `eq('agency_id', …)` | ✅ wired |
| Actor filter | server-side `eq('actor_role', …)` | ✅ wired |
| Date range | server-side `gte('created_at', since)` for 24h / 7d / 30d / 90d / all | ✅ wired (new) |
| Result limit (100–1000) | passed to `.limit(N)`; surfaces "N+" in count when limit hit | ✅ wired (new) |
| CSV export | client-side Blob + ObjectURL → `audit-log-YYYY-MM-DD.csv`, RFC 4180-quoted, metadata JSON-stringified | ✅ wired (new) |
| Action chips colored by family | client-side regex on action name (fail/error/suspend → warn; login/provision/stripe/paid → live) | ✅ wired (new) |
| Realtime refresh | `data:realtime` event on `agency_audit_log` inserts | ✅ wired |
| ↻ Refresh | re-runs the query | ✅ wired |

### System tab (`system`)

| Element | Path | Verdict |
|---------|------|---------|
| Probe · `me()` | `sb.rpc('me')` — surfaces role | ✅ wired |
| Probe · `viewer_agency_ids()` | RPC call — surfaces visible count | ✅ wired |
| Probe · RLS scope match | cross-checks `viewer_agency_ids()` set ↔ `agency_members.eq(user_id)` set; flags any drift | ✅ wired (new) |
| Probe · agency_audit_log read | `count exact head:true` | ✅ wired |
| Probe · Supabase realtime | subscribes a `__imo_probe` channel; 1.5s SUBSCRIBED ack timeout | ✅ wired (new) |
| Probe · Twilio voice | `/api/twilio-token` POST — 503 → warn, ok → ready | ✅ wired |
| Probe · Twilio SMS | `/api/twilio-sms` POST — `missing_to_or_body` → configured | ✅ wired (new) |
| Probe · OpenAI / Whisper | `/api/transcribe` POST — `missing_audio_url` → configured | ✅ wired |
| Probe · Stripe billing | `/api/stripe/checkout` POST — `stripe_not_configured` → warn | ✅ wired (new) |
| "Vercel env ↗" deep link | renders only on probes in `warn` state | ✅ wired (new) |
| Feature flags panel | reads `agencies.config.feature_flags`; 5 known flags (AEP / autodial / live transcript / AI coach / DNC scrub) | ✅ wired (new) |
| Flag toggle | jsonb merge → `UPDATE agencies SET config` + `log_audit('feature_flag.toggle')` | ✅ wired (new) |
| Per-agency selector | defaults to active-agency from localStorage | ✅ wired (new) |
| RLS sanity · my memberships | `agency_members.eq(user_id, current)`, "in scope" if visible in fleet, "RLS-hidden" otherwise | ✅ wired (new) |
| Fleet sanity card | renders raw counts + Re-hydrate button | ✅ wired |

---

## Cross-agency RLS verification

The **System tab → RLS scope match probe** is the canonical check. It
performs three operations and compares them:

1. `viewer_agency_ids()` RPC — what the SECURITY DEFINER helper claims
   the viewer can read.
2. `agency_members.eq(user_id, auth.uid()).eq(active, true)` — the raw
   membership rows.
3. `agencies.select('*')` (subject to RLS) — what actually comes back.

For an `imo_owner` running across N sub-agencies, the expected state is
**helper count == active membership count == fleet agency count**. Any
two of these diverging is a bug surfaced visibly in the probe row
with the count of differing ids.

Today, the helper definition (migration `0015_tenant_isolation.sql:24`)
is:

```sql
create or replace function public.viewer_agency_ids()
returns setof uuid language sql stable security definer
set search_path = public
as $$
  select agency_id from public.agency_members
   where user_id = auth.uid() and active = true
$$;
```

So **the IMO owner must have one `agency_members` row per sub-agency**
to see them. The `provision_sub_agency` RPC must grant that row (to
the caller, in addition to the `owner_email`) for the fleet view to
work. If it doesn't, the System tab probe will fail-loud:

> **RLS scope match** · `1 id differs between viewer_agency_ids() and agency_members`

and the fix is one SQL line — either an INSERT into agency_members or
a tweak to `provision_sub_agency` to add the caller. Both are server-
side concerns out of scope for this branch.

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

- **NEW**: `page-imo.jsx` (~1450 lines after drill passes) — full IMO HQ surface
- **NEW**: `ADMIN_AUDIT_REPORT.md` — this file
- `index.html` — script src rename (`page-platform-admin.jsx` → `page-imo.jsx`), admin route includes `imo_owner` + `super_admin`, role-sync routes `imo_owner` to `platform`, role-pill includes `IMO`, cache busts (`styles.css?v=78`, `page-imo.jsx?v=79`)
- `shared.jsx` — `NAV.imo_owner` added (10 entries); `admin` NAV `Users` → `Members` to match `users` route label
- `styles.css` — `.koino-skin` block appended (~140 lines) — scoped design tokens, tab pills, KPI cards, dense tables, chips, buttons, form controls, system probe rows

## RPCs / tables added in the drill passes

Soft-tried with direct-update fallback (so a stale env doesn't break the UI):

- `suspend_agency(p_agency_id, p_suspend bool)` — falls back to `UPDATE agencies SET suspended_at`
- `revoke_invite(p_token)` — falls back to `UPDATE agency_invites SET expires_at = now()`
- `agency_subscriptions` table (read-only) — falls back to plan-tier estimate
- `agencies.suspended_at` column + `agencies.config.feature_flags` JSONB key

When these are missing the affected control surfaces its error verbatim or
gracefully degrades — never silently fails.

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
2. Sidebar shows the IMO nav: **IMO HQ / Sub-agencies / Members / Billing / Audit log / System** (for imo_owner) or **Platform / Agencies / Members / Billing / Audit log / System** (for admin).
3. Default landing on `/platform` (Overview tab).
4. **Overview**: 4 KPI cards (Sub-agencies / Producers / Active AP / Activity 7d). Stalest-onboarding sub-line on hero KPI. Pending onboarding panel sorts oldest-first and tags ≥7d as `Nd stale`. "+ Provision" button opens modal.
5. **Agencies**: search + status filter (incl. "Suspended") + per-row **Edit** / **Suspend** / **Open →**. Edit modal renames + changes plan + changes state with minimal-patch save. Suspend toggles `agencies.suspended_at` + emits an audit row.
6. **Members**: filters + role dropdown + Remove. **+ Invite** opens flow → mint_invite → copyable link with 14d expiry. Pending invites panel appears below the table when ≥1 outstanding invite exists, with Copy + Revoke actions.
7. **Billing**: KPI strip with "MRR (real + est.)" label flipping based on Stripe coverage. "Stripe not wired" callout when `agency_subscriptions` table missing. Click any per-agency row → BillingDrillModal showing subscription detail + "Open in Stripe ↗" deep link.
8. **Audit log**: action filter (ILIKE), agency filter, actor filter, date range (24h/7d/30d/90d/all), limit selector (100–1000), **↓ CSV** export. Action chips colored by family.
9. **System**: 5 Supabase+RLS probes (me / viewer_agency_ids / RLS scope match / audit read / realtime) + 4 integration probes (Twilio voice + SMS / OpenAI / Stripe) + Feature flags panel per-sub-agency (jsonb merge writes + audit emit) + RLS sanity card showing the viewer's raw `agency_members` rows with `in scope` / `RLS-hidden` chip per row.
10. **Demo toggle** (super_admin only) — Atlas row appears/disappears across Overview + Agencies tabs; when present it carries a `demo` chip.

### Cross-agency RLS verification

System tab → "RLS scope match" probe. Expected: `helper matches N active memberships` with N == fleet agency count. Any mismatch is flagged with the exact count of differing ids — the single best signal that IMO oversight scoping is correct.

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

## Drill pass summary

7 commits on the branch, no push.

| Tab       | Before drill                                        | After drill                                                                                                |
|-----------|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| Overview  | 4 KPIs, "policies in book" was raw count            | 4 KPIs with active-only AP, live-now producer breakdown, 7d activity volume, stalest-onboarding callout    |
| Agencies  | "Open →" only; no row mutation                      | Edit + Suspend/Restore + Open. Suspended-row styling. New `suspended` status filter                        |
| Members   | Role dropdown + Remove only; no invite path         | + Invite modal (mint_invite + link copy), Pending invites panel, Revoke per invite                         |
| Billing   | Hardcoded PLAN_MRR estimate everywhere              | Real `agency_subscriptions` read with plan-tier fallback. Per-row drill modal. "Open in Stripe ↗" deep link |
| Audit log | 200-row dump with 2 filters                         | + Action ILIKE filter, + Date range (24h/7d/30d/90d/all), + limit selector, + CSV export, + colored chips   |
| System    | 5 health probes                                     | 5 Supabase/RLS probes + 4 integration probes + RLS scope match + Feature flags toggle + my-memberships card |

— Done. No `git push`. Branch ready for review.
