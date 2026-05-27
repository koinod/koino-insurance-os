# Settings Overhaul — Audit + Execution Record
Date: 2026-05-26  
Triggered by: Ian — "Repflow desktop helper is redundant from the agents page"

---

## Phase 1: Audit

### Current structure (11 tabs, owner view)
| Tab key | Label | Component | Status | Notes |
|---------|-------|-----------|--------|-------|
| `org` | Organization | `SettingsOrg` | PARTIAL | Saves via `AppData.mutate.orgSettingsSave`. Missing sticky save bar. |
| `team` | Team & invites | `SettingsTeam` (page-tenant.jsx) | WIRED | Member list + invite creation. Works. |
| `carriers` | Carriers | `SettingsCarriers` (page-tenant.jsx) | WIRED | Inline carrier portal login editor (lock icon) already uses `connector_vault`. |
| `billing` | Billing | `SettingsBilling` | DEAD | Usage numbers hardcoded. Payment method hardcoded. Plan hardcoded "Network Annual". |
| `integrations` | Integrations | `SettingsIntegrations` | PARTIAL | Reads `connector_catalog` (may be empty → blank state). TwilioConfigModal wired. Demo fallback only shows demo CONNECTIONS. |
| `agents` | Agents | `SettingsAgents` | WIRED | Device list via `/api/agent/installs`. Issue token + revoke works. Also renders `UserConnectorVault` (12 providers) + `AutomationRulesEditor` + `AgentSettingsEditor`. |
| `api` | API keys | `SettingsApi` | DEAD | Keys are session-local random strings — no persistence. Webhooks are hardcoded Atlas demo data. No real `/api/keys/*` endpoint. |
| `routing` | Routing rules | `SettingsRouting` | WIRED | Real DB reads/writes via `routing_rules` table + `AppData.mutate`. Demo seed for demo mode. |
| `calling` | Calling | `CallingSetup` (page-platform.jsx) | PARTIAL/REDUNDANT | Twilio status panel + TwilioConfigModal: WIRED. "Install Repflow Desktop helper" section: **REDUNDANT** — bash/PowerShell scripts for repflow:// URL scheme. Separate from RBA agent install but visually duplicates Agents tab. |
| `notifications` | Notifications | `SettingsNotifications` | WIRED | Reads/writes `notification_prefs` table via `AppData.mutate.notificationPrefsSave`. Per-key toggles save immediately. |
| `profile` | Profile | `SettingsProfile` | WIRED | Bound to `get_my_profile` / `save_profile` RPCs. Theme instant-save. NPN, licensed_states, E&O, notification_prefs. All wired. |

### Redundancy confirmed: "Repflow Desktop helper"
- **Settings → Calling** (page-platform.jsx): "Install Repflow Desktop helper" renders bash/PowerShell/Linux scripts to register the `repflow://` URL scheme. This is the *fallback* click-to-call path when Twilio isn't configured.
- **Settings → Agents** (page-extras.jsx `SettingsAgents`): Shows registered devices from `rba_installs`, lets user issue one-time install token → runs curl/iwr commands to install the Repflow Browser Agent daemon.
- **Assessment**: Different purposes technically, but to a rep they look identical ("install something"). Since Twilio handles in-browser calling without any helper, the desktop helper section is purely for fallback/legacy. Ian's call: merge or remove. **Decision: remove the install scripts panel from Calling; keep only the Twilio capability status panel.**

### Missing sections
- **Compliance**: No tab. TCPA consent tracking, recording consent by state, DNC list management — all expected by a licensed insurance agency. **New section needed.**
- **Carrier Portal Logins in Connectors**: Already exists inline in Settings → Carriers (lock icon per row). The inline editor uses `connector_vault.provider = 'carrier_<slug>'`. However, the `connector_vault.provider` CHECK constraint (migration 0030) does NOT include `carrier_*` patterns — existing code would throw a DB constraint violation on save. **Migration needed.**

### connector_vault.provider CHECK gap
Current allowed values (migration 0030):  
`'twilio','sendblue','fathom','gmail','outlook','linkedin','sales_nav','fb_ads','ig_business','meta_dm','calendly','stripe','bluetooth_phone','phantombuster','apollo','zoominfo','clay','custom'`

Missing: all `carrier_*` slugs used by the carrier portal login editor.  
Fix: migration `0072` extends the CHECK via regex pattern `provider ~ '^carrier_[a-z0-9_-]+$' OR provider IN (...)`.

---

## Phase 2: Proposed 8-section structure

| New key | Label | Role access | Content |
|---------|-------|-------------|---------|
| `profile` | Profile | All | SettingsProfile (theme, NPN, states, E&O) + SettingsNotifications inline |
| `agency` | Agency | owner, super_admin | SettingsOrg + SettingsCarriers (merged) |
| `agents` | Agents | All | SettingsAgents (devices + connector vault + automations + routing rules) |
| `connectors` | Connectors | All | Twilio status + SettingsIntegrations (catalog) + CarrierPortalLogins (new card) |
| `team` | Team | manager, owner, super_admin | SettingsTeam |
| `billing` | Billing | owner, super_admin | SettingsBilling |
| `compliance` | Compliance | manager, owner, super_admin | NEW — TCPA, recording consent, DNC |
| `developer` | Developer | super_admin only | SettingsApi (real or labeled "coming soon") + webhook debug |

### Mapping of removed tabs
- `org` → merged into `agency`
- `carriers` → merged into `agency` (sub-section)
- `integrations` → merged into `connectors`
- `calling` → Twilio panel moved to `connectors`; desktop helper REMOVED
- `notifications` → merged into `profile`
- `api` → renamed to `developer`; gated to super_admin
- `routing` → moved to `agents` tab as sub-section

---

## Phase 2: Execution log

### A. Migration 0072 — connector_vault carrier providers
File: `supabase/migrations/0072_connector_vault_carrier_providers.sql`  
Action: DROP + ADD CHECK constraint to allow `carrier_*` providers.

### B. page-platform.jsx — Simplify CallingSetup
- Remove "Fallback · click-to-call via desktop helper" info box
- Remove "Install Repflow Desktop helper" panel  
- Remove "Test the wire" panel
- Add compact note: "Need click-to-call without Twilio? Install the desktop helper from Settings → Agents."

### C. page-extras.jsx — Reorganize PageSettings
- TABS array: 11 → 8 tabs with role gating
- New functions: `SettingsAgency`, `SettingsConnectors`, `CarrierPortalLogins`, `SettingsCompliance`, `SettingsDeveloper`
- Routing rules moved into `SettingsAgents` (below AutomationRulesEditor)
- Notifications folded into `SettingsProfile` (already has `notification_prefs` in form)

### D. cache-busters + rebuild
- `page-extras.js`: bump from current version
- `page-platform.js`: bump from current version

---

## Acceptance checklist
- [ ] Settings nav shows 8 sections (Profile, Agency, Agents, Connectors, Team, Billing, Compliance, Developer)
- [ ] "Repflow Desktop helper" install scripts GONE from Calling/Connectors tab
- [ ] Connectors → Carrier Portal Logins card lists all agency carriers
- [ ] Click Connect on Mutual of Omaha → modal → fill creds → Save → toast → status flips
- [ ] SQL verify: `connector_vault` row for `provider = 'carrier_mutual_omaha'` exists
- [ ] Developer tab only visible to super_admin
- [ ] Isaiah (manager/owner) sees Profile, Agency, Agents, Connectors, Team, Billing, Compliance
- [ ] Rep sees Profile, Agents, Connectors
