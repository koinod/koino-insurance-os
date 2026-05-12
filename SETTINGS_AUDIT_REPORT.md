# Settings audit — role coverage, save wiring, design system

**Branch:** `feat/role-audit-settings-2026-05-11`
**Base:** `feat/onboarding-frontend-2026-05-11`
**Date:** 2026-05-12
**Scope:** All settings tabs for every role (rep / manager / owner / imo_owner / admin / super_admin)
**Mode:** sovereign execution, anti-theater — no demo seeds, no fake saves, no DO-NOT-PUSH.

---

## (a) Engineering — every save wired per role

| Tab | Component | Save path | Backend table / RPC | Status |
|---|---|---|---|---|
| Profile | `SettingsProfile` | `sb.rpc("save_profile", { p: patch })` + `sb.rpc("get_my_profile")` | `public.profiles` (RPC) | wired (P6 of onboarding pass) — controlled inputs, dirty-tracking, minimal patch, save button gated by dirty count, post-save refresh via `refreshMe()` |
| Notifications | `SettingsNotifications` | `AppData.mutate.notificationPrefsSave("me", prefs)` | `public.notification_prefs` | wired |
| Personal connectors | `SettingsPersonalConnectors` (NEW) | `sb.rpc("save_profile", { p: {telegram_chat_id, telegram_handle, slack_member_id, phone_for_alerts} })` | `public.profiles` (RPC) | wired — Telegram test ping via `/api/connector/test` |
| Resources (rep/manager) | `SettingsResources` (NEW) | read-only | `agency_scripts`, `agency_videos`, `agency_docs`, `agency_quick_links` | wired (read) |
| Team scripts (manager+) | `SettingsTeamScripts` (NEW) | `sb.from("agency_scripts").insert/update` + archive | `public.agency_scripts` | wired — `canEdit` gates write actions |
| Team management | `window.SettingsTeam` | existing | (pre-existing) | unchanged + permission-gated to owner+ |
| Organization | `SettingsOrg` | `AppData.mutate.orgSettingsSave` | `public.org_settings` | unchanged — already wired |
| Branding | `SettingsBranding` (NEW) | `AppData.mutate.orgSettingsSave({ brand_logo_url, brand_color, brand_color_dark, public_name, tagline, default_theme })` | `public.org_settings` | wired — live preview tile |
| Carriers | `window.SettingsCarriers` | existing | (pre-existing) | unchanged + `canEdit` correctly only for owner+ (rank ≥ 5) |
| Products | `SettingsProducts` (NEW) | `sb.from("products").update({ status })` | `public.products` | wired — pause/activate per product, `canEdit` gates writes |
| Agents | `SettingsAgents` | `sb.rpc("install_agent")` w/ fallback to `rba_installs` upsert | `public.rba_installs` | unchanged (P4 of onboarding pass) |
| Connectors | `SettingsIntegrations` | upsert to `connections` via per-connector modals | `public.connector_catalog` × `public.connections` | unchanged (P5) |
| Compliance | `SettingsCompliance` (NEW) | `AppData.mutate.orgSettingsSave({ dnc_list_url, jornaya_account_id, jornaya_site_id, trustedform_account, quiet_hours_start, quiet_hours_end, record_all_calls, soa_required })` | `public.org_settings` | wired |
| Routing rules | `SettingsRouting` | local state only (in-memory) | — | unchanged — known limitation, no `routing_rules` table yet |
| API keys | `SettingsApi` | session-local key + clipboard | `sessionStorage` | unchanged — placeholder until `/api/keys/*` ships |
| Billing | `SettingsBilling` | open Stripe portal (`ORG_SETTINGS.stripe_portal_url`) | external | unchanged |
| Cross-agency (admin/imo) | `SettingsCrossAgency` (NEW) | `sb.from("agencies").select(...)` | `public.agencies` (RLS-scoped via `viewer_agency_ids()`) | wired — opens agency via `sessionStorage` impersonate-id + reload |
| Provision sub-agency | `SettingsProvisionSubAgency` (NEW) | `sb.rpc("create_child_agency", {...})` w/ fallback to `agencies` insert + `agency_invites` insert | `public.agencies`, `public.agency_invites`, `public.create_child_agency()` | wired |
| Audit log | `SettingsAuditLog` (NEW) | `sb.from("audit_log").select(...)` w/ fallback to `notifications` | `public.audit_log` (or `notifications` fallback) | wired (read-only) — shows source pill |
| Feature flags (super) | `SettingsFeatureFlags` (NEW) | `sb.from("feature_flags").update / insert` | `public.feature_flags` | wired — toggle + new-flag modal |
| Demo controls (super) | `SettingsDemoControls` (NEW) | `sb.rpc("reseed_demo" / "wipe_demo_calls" / "reset_demo_pipeline")` | RPCs | wired — surfaces "function does not exist" when RPC absent (no silent fake-success) |
| Global integrations (super) | `SettingsGlobalIntegrations` (NEW) | `sb.from("connector_catalog").upsert` | `public.connector_catalog` | wired — onConflict on `connector_key` |

### Save-correctness defenses
- **Profile** still uses minimal-patch (`Object.keys(dirty).forEach(k => patch[k] = form[k])`) so the backend's "preserve untouched keys" RPC contract is honoured.
- **Personal connectors** writes to the same `profiles` row via `save_profile` — no parallel mutation path.
- **Compliance / Branding** routes through the existing `orgSettingsSave` so cache invalidation (`_emitMutation("org_settings","upsert",null)`) fires consistently.
- **Feature flags / Global integrations** use `upsert(..., { onConflict: "..." })` to be idempotent.
- **Provision** tries the strongly-typed RPC first; falls back to direct insert. Failures bubble to a toast — no silent success.
- **Demo controls** show the actual RPC error if the function doesn't exist on the server (no fake "done" toast).

### Known limitations (not regressions — documented for follow-up)
- `SettingsRouting` is still in-memory only. There's no `routing_rules` table yet. Demo agency shows seeded rules so the surface is testable; real agencies see "Add one to control which producer gets which lead source."
- `SettingsApi` mints session-local keys. Real key issuance needs `/api/keys/create` + `/api/keys/rotate` endpoints.
- `SettingsBilling` shows usage placeholders pending a `usage_summary` view.

---

## (b) UX — right tabs per role, no leaky permissions

### Tab matrix

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
| Compliance (DNC/Jornaya/TrustedForm) | — | — | ✓ | ✓ | ✓ | ✓ |
| Routing rules | — | — | ✓ | ✓ | ✓ | ✓ |
| API keys | — | — | ✓ | ✓ | ✓ | ✓ |
| Billing | — | — | ✓ | ✓ | ✓ | ✓ |
| Cross-agency mgmt | — | — | — | ✓ | ✓ | ✓ |
| Audit log | — | — | — | ✓ | ✓ | ✓ |
| Provision sub-agency | — | — | — | ✓ | ✓ | ✓ |
| Feature flags | — | — | — | — | — | ✓ |
| Demo controls | — | — | — | — | — | ✓ |
| Global integrations | — | — | — | — | — | ✓ |

### Leak prevention
- Tab order is centralised in `SETTINGS_TAB_ORDER[role]` and rendered as the only source of truth for which buttons appear in the sidebar.
- `canRender(tab)` runs a numeric rank comparison (`SETTINGS_ROLE_RANK[viewer] >= SETTINGS_ROLE_RANK[def.min]`) on every dispatch. If a stale tab key sneaks through `sessionStorage` deeplinks or URL state, the dispatch yields `<SettingsDenied/>` instead of the editable form.
- Deeplink normaliser handles legacy keys (`"telegram"` → `"personal_connectors"`) so old links from elsewhere in the app still resolve.
- "Edit profile" pinned button always renders for any signed-in user since profile is in the rep tier.

### Section grouping in the sidebar
Tabs are grouped into 5 semantic sections with mono-uppercase labels:
- **You** — Profile, Notifications, Personal connectors, Resources
- **Team** — Team scripts, Team management
- **Agency** — Organization, Branding, Carriers, Products, Agents, Connectors, Compliance, Routing, API, Billing
- **Cross-agency** — Cross-agency, Audit log, Provision sub-agency
- **Platform** — Feature flags, Demo controls, Global integrations

This gives reps a 4-tab sidebar (no clutter), owners a 14-tab sidebar with clear groupings, and super-admins a 22-tab sidebar that scrolls vertically (mobile: scrolls horizontally).

---

## (c) UI — koino.capital design system (green + black + rounded)

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
- New **`.ks-tile`** primitive — denser than `.panel` (12px padding vs 16px), 10px radius, hover-on-border ring instead of bg-elevate.
- New **`.ks-grid`** (220px min cols) and **`.ks-grid-wide`** (300px min cols) replace fixed `gridTemplateColumns: "1fr 1fr"`.
- New **`.ks-tabs`** — vertical pill stack with section labels in mono-uppercase. Active tab gets a 1px green inset ring + 12% green tint background.
- `.btn-primary` gets a soft drop-shadow on hover (green glow), translateY(-1px) for tactility.

### Typography
- Page title gets a green→white gradient text fill (`background-clip: text`) — matches the marketing-site hero treatment.
- Section labels use JetBrains Mono uppercase tracking-0.12em at 9.5px — matches `koino.capital` `.tag` rule.

### Mobile
At `≤760px` the `.ks-tabs` flips from column to row + scrolls horizontally, page stays usable on phones (manager/owner phones, not rep phones — reps don't open Settings from mobile).

---

## Files touched

- `page-extras.jsx` — `PageSettings` rewritten (lines 2497-2740); 12 new `Settings*` components added (lines 2746-4350).
- `styles.css` — appended `.koino-settings-ds` DS scope (≈190 lines).
- `index.html` — bumped `styles.css?v=83`, `page-extras.jsx?v=83`.

No changes to: data layer (`data.jsx`), Supabase migrations, other pages. The DS scope is class-bound so it cannot leak into other surfaces.

---

## How to verify

1. **Open Settings as each role** — toggle role via the Tweaks panel (top-right gear). Tab count should match the matrix above.
2. **Profile save** — change Display name, click Save profile. Toast = "Profile saved". Reload, name persists.
3. **Personal connectors save** — paste a Telegram chat id, Save connectors. `save_profile` patch sent (Network → `rest/v1/rpc/save_profile`).
4. **Compliance save** — toggle "Record all calls" + Save compliance. `org_settings` upsert hits.
5. **Branding preview** — change Primary color, watch the live preview tile and CTA button color update.
6. **Permission gate** — manually set `sessionStorage.setItem("repflow.settings.tab","feature_flags")` then switch to rep role and reload. You should see the **denied banner**, not the form.
7. **Resources** — as a rep, no Edit buttons; as a manager, you see the Team scripts tab where you can publish.

---

## Anti-theater compliance

- No fake "saved!" toasts when the underlying RPC doesn't exist. Demo controls explicitly surface "function does not exist" when the demo RPC isn't there.
- No hardcoded business data (per SHAPE NOT DATA). Branding seed shows `#00d4aa` only as a placeholder color picker default — `org_settings` stays empty until the owner saves.
- Did NOT push. Branch + commits land locally for review.
