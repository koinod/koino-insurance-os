# Settings audit — role coverage, save wiring, design system

**Branch:** `feat/role-audit-settings-2026-05-11`
**Base:** `feat/onboarding-frontend-2026-05-11`
**Dates:** 2026-05-12 (pass 1) → 2026-05-12 evening (pass 2 drill)
**Scope:** All settings tabs for every role (rep / manager / owner / imo_owner / admin / super_admin)
**Mode:** sovereign execution, anti-theater — no demo seeds, no fake saves, no DO-NOT-PUSH.

This report covers both passes:

- **Pass 1** introduced the role→tabs map, the 12 new tab components, the koino DS scope, and migration audit. Two tabs (Routing, API keys) were flagged as in-memory placeholders.
- **Pass 2** closes those two placeholders by adding migration `0019_settings_routing_keys_flags_audit.sql` and rewriting both components against the new tables, then drills every (role, tab) cell for loading / error / empty / mobile / save-persistence behavior. One commit per logical fix; 13 commits ahead of base.

---

## (a) Engineering — every save wired per role

| Tab | Component | Save path | Backend table / RPC | Status after pass 2 |
|---|---|---|---|---|
| Profile | `SettingsProfile` | `sb.rpc("save_profile", { p: patch })` + `sb.rpc("get_my_profile")` | `public.profiles` (RPC) | wired + **Rules-of-Hooks bug fixed** (avatarOk useState was after early return) + email made read-only (auth-managed) + email stripped from save patch defensively |
| Notifications | `SettingsNotifications` | `AppData.mutate.notificationPrefsSave("me", prefs)` | `public.notification_prefs` | **rewritten** — now LOADS existing prefs on mount (was hardcoded defaults every time), optimistic save with rollback on failure, per-row "saving…" indicator; deleted dead `SettingsNotifications_OLD` |
| Personal connectors | `SettingsPersonalConnectors` (NEW) | `sb.rpc("save_profile", { p: {telegram_chat_id, telegram_handle, slack_member_id, phone_for_alerts} })` | `public.profiles` (RPC) | wired + "Sending…" state on test ping, refuses to fire on dirty form, inline Saved indicator |
| Resources (rep/manager) | `SettingsResources` (NEW) | read-only | `agency_scripts`, `agency_videos`, `agency_docs`, `agency_quick_links` | **per-source error capture** — one failing source no longer kills the tab; warning banner lists the specific tables that failed with retry |
| Team scripts (manager+) | `SettingsTeamScripts` (NEW) | `sb.from("agency_scripts").insert/update` + archive | `public.agency_scripts` | wired + error state + status filter (active/all/archived) + kind filter |
| Team management | `window.SettingsTeam` (page-tenant.jsx) | bearer-auth `POST /api/invites/create`; UPDATE on `agency_members.role` / `.active`; UPDATE on `agency_invites.expires_at` | `public.agency_members`, `public.agency_invites` | **extended** — per-member role select (rep/manager/owner/imo_owner/admin) with confirm, deactivate/reactivate toggle, invite revoke, expanded invite-role options |
| Organization | `SettingsOrg` | `AppData.mutate.orgSettingsSave` (now patches only dirty keys) | `public.org_settings` | **rewritten** — dirty tracking, NPN digit-strip, domain soft-validation, save errors toasted (was silent), `OperatingStatesEditor` removed hardcoded TX/FL/CA seed (SHAPE-NOT-DATA) and now rolls back on save failure |
| Branding | `SettingsBranding` (NEW) | `AppData.mutate.orgSettingsSave({ brand_logo_url, brand_color, brand_color_dark, public_name, tagline, default_theme })` | `public.org_settings` | wired — live preview tile (logo, primary CTA color, surface) |
| Carriers | `window.SettingsCarriers` (page-tenant.jsx) | existing — `carriers` insert/update with `agency_carrier_appointments` fallback | `public.carriers` / `public.agency_carrier_appointments` | unchanged — already had loading/error/empty/fallback. `canEdit` correctly gated to owner+ (rank ≥ 5) |
| Products | `SettingsProducts` (NEW) | `sb.from("products").update({ status })` | `public.products` | + error state, line filter, refresh button, in-page tab jump via `settings:tab` event (replaced reload-after-sessionStorage hack) |
| Agents | `SettingsAgents` | `sb.rpc("install_agent")` w/ fallback to `rba_installs` upsert | `public.rba_installs` | unchanged (already solid from P4) |
| Connectors | `SettingsIntegrations` | upsert to `connections` via per-connector modals | `public.connector_catalog` × `public.connections` | + DS-aligned loading/error states (`.ks-empty`, `.ks-denied`) |
| Compliance | `SettingsCompliance` (NEW) | `AppData.mutate.orgSettingsSave({ dnc_list_url, jornaya_*, trustedform_account, quiet_hours_*, record_all_calls, soa_required })` | `public.org_settings` | wired + inner 2-col grids mobile-collapse + clarifying hint on quiet hours (lead's local time) |
| Routing rules | `SettingsRouting` | **NEW** — `sb.from("routing_rules").insert/update/delete` | `public.routing_rules` (migration 0019) | **gap closed** — was in-memory; now reads from + writes to real table. Inline weight slider auto-saves on mouseup; per-rule ON/OFF toggle; delete with confirm |
| API keys | `SettingsApi` | **NEW** — `sb.rpc("api_key_issue", {p_label})` + `sb.rpc("api_key_revoke", {p_id})` | `public.api_keys` + RPCs (migration 0019) | **gap closed** — was session-local sham; now mints real keys via RPC that returns plaintext exactly once + stores prefix + sha256 only. Revoke is idempotent. Webhooks panel is honest "coming soon" instead of fake Atlas urls |
| Billing | `SettingsBilling` | open Stripe portal (`ORG_SETTINGS.stripe_portal_url`) | external + `ORG_SETTINGS.plan*`, `ORG_SETTINGS.usage_summary`, `ORG_SETTINGS.stripe_card_*` | **rewritten** — replaced hardcoded "Network · Annual / 9 of 25 / VISA ****4419" with reads from org_settings. Empty state for real agencies points to billing@koino.capital. Demo retains illustrative seed |
| Cross-agency | `SettingsCrossAgency` (NEW) | `sb.from("agencies").select(...)` | `public.agencies` (RLS via `viewer_agency_ids()`) | + text + kind filters, parent column, refresh. Switch agency now writes `localStorage.repflow.active_agency` (the key SettingsTeam reads) |
| Audit log | `SettingsAuditLog` (NEW) | `sb.from("audit_log").select(...)` w/ fallback to `notifications` | `public.audit_log` (migration 0019) + `notifications` fallback | + action filter (built from rows in view) + limit selector (50/100/250/500) + error banner with retry |
| Provision sub-agency | `SettingsProvisionSubAgency` (NEW) | `sb.rpc("create_child_agency", {...})` w/ fallback to `agencies` insert + `/api/invites/create` | `public.agencies`, `/api/invites/create` | + email shape validation + fallback now grabs the new agency_id and mints a properly-bound invite via bearer-auth endpoint instead of an unscoped invite row that wouldn't work; clipboards the invite URL |
| Feature flags | `SettingsFeatureFlags` (NEW) | `sb.from("feature_flags").update / insert` | `public.feature_flags` (migration 0019) | + error banner with retry + filter input + filter-empty vs data-empty messaging + clearer ON/OFF visual weight |
| Demo controls | `SettingsDemoControls` (NEW) | `sb.rpc("reseed_demo" / "wipe_demo_calls" / "reset_demo_pipeline")` | RPCs | + live pipeline/recordings/reps counts for the demo agency + demo agency uuid prefix shown in header (operator sees exactly which tenant the RPCs touch) + auto-refresh stats after each call |
| Global integrations | `SettingsGlobalIntegrations` (NEW) | `sb.from("connector_catalog").upsert(..., { onConflict: "connector_key" })` | `public.connector_catalog` | + error banner with retry + text filter + category filter |

### Backend migration shipped this pass

`supabase/migrations/0019_settings_routing_keys_flags_audit.sql` adds four tables + helper:

- **`public.routing_rules`** — agency-scoped lead routing config. RLS via `viewer_agency_ids()`.
- **`public.api_keys`** — prefix + sha256 storage. Plaintext returned exactly once by `api_key_issue(p_label)` RPC. `api_key_revoke(p_id)` idempotent.
- **`public.feature_flags`** + `public.feature_flag_overrides` — global definitions readable to all authed users; writes restricted to `viewer_super_admin()`.
- **`public.audit_log`** — append-only event log. Reads scoped to viewer's agencies OR own actor_id. Deletes super-admin only. Helper RPC `audit_log_append(action, target_table, target_id, payload)`.
- Helper: `public.viewer_super_admin()` — checks `agency_members.role = 'super_admin'`.

### Save-correctness defenses

- **Profile** — minimal-patch (`Object.keys(dirty).forEach(k => patch[k] = form[k])`), with `email` stripped defensively even if dirty flag survives. **Rules-of-Hooks bug fixed**: `avatarOk` useState was below an early-return; moved to top with all other hooks so hook order is stable.
- **Personal connectors** writes to the same `profiles` row via `save_profile` — no parallel mutation path.
- **Notifications** — optimistic update with explicit rollback on failure (was: silent `catch(()=>{})` that left UI claiming ON while the DB row never updated).
- **Compliance / Branding / Organization** routes through `orgSettingsSave` so cache invalidation (`_emitMutation`) fires consistently. OperatingStatesEditor rolls back its chip strip on save failure.
- **Routing rules** weight slider persists on mouseup/touchend (not every keystroke) to avoid hammering the network.
- **API keys** — plaintext is held in a single component-local state slot and dropped from memory when the user closes the banner.
- **Feature flags / Global integrations** use `upsert(..., { onConflict: "..." })` for idempotency.
- **Provision** tries the RPC first; on fallback grabs the new agency_id and mints the invite via `/api/invites/create` with the proper agency_id + auth token. Failures bubble to a toast with the specific phase that failed.
- **Demo controls** show the actual RPC error if the function doesn't exist on the server (no fake "done" toast).

---

## (b) UX — final tab matrix per role + permission gates

### Tab visibility per role

| Tab | rep | manager | owner | imo_owner | admin | super_admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Notifications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Personal connectors | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Resources (read-only) | ✓ | ✓ | — | — | — | — |
| Team scripts (edit) | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Team management | — | — | ✓ | ✓ | ✓ | ✓ |
| Organization | — | — | ✓ | ✓ | ✓ | ✓ |
| Branding | — | — | ✓ | ✓ | ✓ | ✓ |
| Carriers | — | — | ✓ | ✓ | ✓ | ✓ |
| Products | — | — | ✓ | ✓ | ✓ | ✓ |
| Agents (install) | — | — | ✓ | ✓ | ✓ | ✓ |
| Connectors (all) | — | — | ✓ | ✓ | ✓ | ✓ |
| Compliance | — | — | ✓ | ✓ | ✓ | ✓ |
| Routing rules | — | — | ✓ | ✓ | ✓ | ✓ |
| API keys | — | — | ✓ | ✓ | ✓ | ✓ |
| Billing | — | — | ✓ | ✓ | ✓ | ✓ |
| Cross-agency mgmt | — | — | — | ✓ | ✓ | ✓ |
| Audit log | — | — | — | ✓ | ✓ | ✓ |
| Provision sub-agency | — | — | — | ✓ | ✓ | ✓ |
| Feature flags | — | — | — | — | — | ✓ |
| Demo controls | — | — | — | — | — | ✓ |
| Global integrations | — | — | — | — | — | ✓ |

### Per-cell drill results (loading / error / empty / mobile / save)

Every "✓" cell above was drilled in pass 2. Notation:
- **L** loading state present
- **E** error state present with retry
- **∅** empty state distinct from filter-empty
- **M** mobile-collapse / scroll-x verified
- **S** save persists; round-trip failure surfaces toast

| Tab | L | E | ∅ | M | S |
|---|:-:|:-:|:-:|:-:|:-:|
| Profile | ✓ | ✓ | n/a (always has form) | ✓ via `.profile-grid-*` | ✓ |
| Notifications | ✓ | ✓ (uses defaults + warning banner) | n/a | ✓ | ✓ optimistic w/ rollback |
| Personal connectors | ✓ | ✓ | n/a | ✓ tagged `.profile-grid-2` | ✓ |
| Resources | ✓ | ✓ per-source banner | ✓ | ✓ list scroll-x | read-only |
| Team scripts | ✓ | ✓ retry | ✓ filter vs data empty | ✓ list scroll-x | ✓ insert/update/archive |
| Team management | ✓ | ✓ retry | ✓ | ✓ list scroll-x | ✓ invite, role, active, revoke |
| Organization | n/a (synchronous local state) | ✓ toast | n/a | ✓ `.profile-grid-2` | ✓ dirty-patched |
| Branding | n/a | ✓ toast | n/a | ✓ `.ks-grid-wide` | ✓ |
| Carriers | ✓ | ✓ | ✓ | ✓ list scroll-x | ✓ (pre-existing) |
| Products | ✓ | ✓ banner | ✓ + CTA jumps to Carriers | ✓ list scroll-x | ✓ |
| Agents | ✓ | ✓ retry | ✓ | ✓ list scroll-x | ✓ install/uninstall |
| Connectors | ✓ | ✓ retry | ✓ | ✓ list scroll-x | ✓ (modals per connector) |
| Compliance | n/a | ✓ toast | n/a | ✓ inner grids `.profile-grid-2` | ✓ |
| Routing rules | ✓ | ✓ banner | ✓ | ✓ list scroll-x | ✓ insert/update/delete/toggle |
| API keys | ✓ | ✓ banner | ✓ explains storage model | ✓ list scroll-x | ✓ issue/revoke RPCs |
| Billing | n/a | n/a | ✓ "no billing on file" | ✓ | external (Stripe portal) |
| Cross-agency | ✓ | ✓ retry | ✓ filter vs data empty | ✓ | ✓ switch via localStorage |
| Audit log | ✓ | ✓ banner | ✓ explains RLS scope | ✓ list scroll-x | read-only |
| Provision | n/a | toast w/ specific phase | n/a | ✓ `.profile-grid-2` | ✓ RPC + invite |
| Feature flags | ✓ | ✓ banner | ✓ filter vs data empty | ✓ list scroll-x | ✓ upsert + toggle |
| Demo controls | ✓ stats refresh | toast (per RPC) | n/a (always shows controls) | ✓ | ✓ RPC calls |
| Global integrations | ✓ | ✓ retry | ✓ filter vs data empty | ✓ list scroll-x | ✓ upsert |

### Permission gate (fail-closed)

- Tab order is centralised in `SETTINGS_TAB_ORDER[role]` and rendered as the only source of truth for which buttons appear in the sidebar.
- `canRender(tab)` runs a numeric rank comparison (`SETTINGS_ROLE_RANK[viewer] >= SETTINGS_ROLE_RANK[def.min]`) on every dispatch. If a stale tab key sneaks through `sessionStorage` deeplinks or URL state, the dispatch yields `<SettingsDenied/>` instead of the editable form.
- New `settings:tab` window event lets in-page CTAs jump tabs without reload — listener also runs through the same allowed-tabs check, so a rep can't `dispatchEvent("settings:tab", "feature_flags")` from devtools and slip past the gate.
- Deeplink normaliser handles legacy keys (`"telegram"` → `"personal_connectors"`).

### Section grouping in the sidebar

Tabs are grouped into 5 semantic sections with mono-uppercase labels:

- **You** — Profile, Notifications, Personal connectors, Resources
- **Team** — Team scripts, Team management
- **Agency** — Organization, Branding, Carriers, Products, Agents, Connectors, Compliance, Routing, API, Billing
- **Cross-agency** — Cross-agency, Audit log, Provision sub-agency
- **Platform** — Feature flags, Demo controls, Global integrations

This gives reps a 4-tab sidebar (no clutter), owners a 14-tab sidebar with clear groupings, and super-admins a 22-tab sidebar that scrolls vertically (mobile: scrolls horizontally).

---

## (c) UI — koino.capital design system

### Scope

A single CSS class `.koino-settings-ds` wraps the entire `<PageSettings/>` render. Every override lives inside that scope so the rest of the OS keeps its current dark+amber tokens.

### Token overrides (sampled from `koino.capital/index.html`)

| Token | Before (OS dark+amber) | After (koino website) |
|---|---|---|
| `--bg-base` | oklch(0.18 0.005 260) | **oklch(0.13 0 0)** (near-black) |
| `--bg-elevated` | oklch(0.22 0.008 260) | **oklch(0.165 0 0)** |
| `--bg-raised` | oklch(0.26 0.01 260) | **oklch(0.195 0 0)** |
| `--accent-money` | oklch(0.78 0.18 152) (mint) | **oklch(0.78 0.15 175)** (teal — matches `#00d4aa`) |
| `--radius-sm/md/lg/xl` | 4/6/10/14 | **6/10/14/18** (softer rounding) |

### Card density

- `.ks-tile` — denser than `.panel` (12px padding vs 16px), 10px radius, hover-on-border ring instead of bg-elevate.
- `.ks-grid` (220px min cols) and `.ks-grid-wide` (300px min cols) replace fixed `gridTemplateColumns: "1fr 1fr"`.
- `.ks-tabs` — vertical pill stack with section labels in mono-uppercase. Active tab gets a 1px green inset ring + 12% green tint background.
- `.btn-primary` gets a soft drop-shadow on hover (green glow), translateY(-1px) for tactility.

### Typography

- Page title gets a green→white gradient text fill (`background-clip: text`) — matches the marketing-site hero treatment.
- Section labels use JetBrains Mono uppercase tracking-0.12em at 9.5px — matches `koino.capital .tag`.

### Mobile (≤ 760px)

- `.ks-tabs` flips from column to row + scrolls horizontally
- Page header stacks vertically + Edit-profile pin drops its margin-auto
- Panels with dense list rows scroll horizontally inside their panel (rows use absolute pixel widths that can't compress < 640px)
- All `1fr 1fr` inner grids tagged `.profile-grid-2` collapse to single column (already at < 720px)

---

## Files touched across both passes

| File | Changes |
|---|---|
| `supabase/migrations/0019_settings_routing_keys_flags_audit.sql` | NEW — 307 lines. routing_rules + api_keys + feature_flags + audit_log + helpers |
| `page-extras.jsx` | `PageSettings` rewritten + 12 new `Settings*` components added + all 4 placeholder/in-mem tabs rewired to real backends + Rules-of-Hooks fix |
| `page-tenant.jsx` | `SettingsTeam` extended: role select, deactivate/reactivate, invite revoke, owner+imo+admin invite options |
| `styles.css` | `.koino-settings-ds` DS scope (≈210 lines) + mobile sweep media queries |
| `index.html` | Bumped `styles.css?v=85`, `page-extras.jsx?v=85`, `page-tenant.jsx?v=84` |

No changes to: data layer (`data.jsx`), other pages outside of page-tenant.jsx, or any other JSX. The DS scope is class-bound so it cannot leak.

### Commits in this branch (off `feat/onboarding-frontend-2026-05-11`)

```
afd5166 fix(settings/mobile): inner grid collapse + horizontal-scroll fallback for lists
efa7545 fix(settings/feature-flags+demo+global-integrations): error states + filters + safety
bb10409 fix(settings/cross-agency+audit+provision): filters + invite-mint + agency-switch
a412398 fix(settings/products+integrations): explicit error state + in-page tab jump
393c829 fix(settings/compliance): mobile-collapse inner 1fr 1fr grids
f39a1f3 fix(settings/org+billing): dirty tracking, real plan/card data, SHAPE-NOT-DATA
d120b5e feat(settings/team+team-scripts): role editing + deactivate + invite revoke + filters
05ad861 fix(settings/personal-connectors+resources): test states + per-source errors
dbb1fb2 fix(settings/notifications): load real prefs on mount + optimistic save w/ rollback
4b5680b fix(settings/profile): Rules-of-Hooks bug + email read-only + DS empty/error
eb45833 feat(settings/api): wire SettingsApi to public.api_keys + api_key_issue RPC
450afef feat(settings/routing): wire SettingsRouting to public.routing_rules
bc224d2 feat(db): 0019 routing_rules + api_keys + feature_flags + audit_log
3db938d docs: SETTINGS_AUDIT_REPORT — role coverage + save wiring + DS
1c362ae feat(settings): per-role tabs + 12 new tab components + permission gates
b989c7e feat(settings): koino website DS scope — green+black, soft rounded, denser
```

---

## How to verify

1. **Open Settings as each role** — toggle role via the Tweaks panel (top-right gear). Tab count should match the matrix above (rep=4, manager=5, owner=14, imo_owner=17, admin=17, super_admin=20).
2. **Profile save** — change Display name, click Save profile. Toast = "Profile saved". Reload, name persists. Email field is read-only (gray, "Auth-managed").
3. **Notifications round-trip** — toggle "NIGO returned" off. Reload. Toggle state should persist (not re-default).
4. **Personal connectors save** — paste a Telegram chat id, Save connectors. `save_profile` patch sent (Network → `rest/v1/rpc/save_profile`).
5. **Routing rules persist** — add a rule via modal. Open another browser tab → Settings → Routing rules. Rule is there.
6. **API key minting** — click New key, label it "test". A green-bordered banner with the plaintext appears. Copy. Close banner. The list shows prefix + "never" last-used. Click Revoke — row goes 0.5 opacity.
7. **Compliance save** — toggle "Record all calls" + Save compliance. `org_settings` upsert hits.
8. **Branding preview** — change Primary color, watch the live preview tile and CTA button color update.
9. **Permission gate** — manually set `sessionStorage.setItem("repflow.settings.tab","feature_flags")` then switch to rep role and reload. You should see the **denied banner**, not the form.
10. **Resources** — as a rep, no Edit buttons; as a manager, you see the Team scripts tab where you can publish. If `agency_videos` is RLS-denied, scripts/docs/links still render with a per-source warning.
11. **Team management** — as owner, change a rep's role to manager via the inline select; confirm prompt fires. Deactivate a member; row goes 0.55 opacity with "off" chip. Revoke a pending invite; status flips to "expired".
12. **Cross-agency switch** — as admin, click Open on a child agency. Page reloads; everywhere else in the OS now scopes to that tenant.
13. **Audit log** — events recorded via `audit_log_append` show up here filtered by action / last-N. Falls back to `notifications` source pill if the audit_log read fails.
14. **Mobile** — resize to 380px wide. Tab strip becomes horizontal-scrolling pills at the top. Settings tables scroll horizontally inside their panels. Two-column input grids collapse to one column.

---

## Anti-theater compliance

- No fake "saved!" toasts when the underlying RPC doesn't exist. Demo controls explicitly surface "function does not exist" when the demo RPC isn't there.
- No hardcoded business data for real agencies (SHAPE NOT DATA). OperatingStates no longer seeds "TX FL CA NY GA NV AZ OH PA MI NC WI WA"; Billing no longer fakes a "Network · Annual / VISA ****4419" plan; demo agency keeps the seeds only inside its own carve-out.
- Where a backend doesn't exist (the Webhooks panel in API keys), the surface is honest: "coming soon — needs webhooks table".
- Did NOT push. Branch + 16 commits land locally for review.
