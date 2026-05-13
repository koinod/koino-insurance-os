# CLEANUP BLUEPRINT — 2026-05-13

> Wave 1 Audit — DO NOT MODIFY CODE. Reference only.

---

## 1. SCHEMA INVENTORY

Source: `supabase/migrations/0001–0024`. All 71 tables audited.

### Public Tables

| Table | Purpose | FK Count | Verdict |
|---|---|---|---|
| reps | Producer roster (tier, presence, upline_id) | 0 | KEEP |
| pipeline | Lead kanban (stage, rep, ROI) | 1 | KEEP |
| queue | Speed-to-lead dial queue | 0 | KEEP |
| recordings | Call recordings + AI scoring | 1 | KEEP |
| courses | Training catalog | 0 | KEEP |
| connections | 3rd-party integrations | 0 | KEEP |
| hardware | Agent fleet nodes | 0 | KEEP |
| ai_agents | Agent metadata + deployment | 1 | KEEP |
| workflows | Automation definitions | 0 | KEEP |
| carriers | Carrier master data | 0 | KEEP |
| products | Per-carrier products | 1 | KEEP |
| carrier_appointments | Rep licensing per state/carrier | 2 | KEEP |
| policies | Issued policies (commission source of truth) | 4 | KEEP |
| commissions | Advance/earned/trail/override events | 2 | KEEP |
| payouts | Monthly Stripe payout runs | 1 | KEEP |
| clawbacks | Chargeback events on lapsed policies | 2 | KEEP |
| lead_sources | Vendor master (FB, T65, referral) | 0 | KEEP |
| attributions | Multi-touch attribution model | 2 | KEEP |
| touchpoints | First/last/click/call/sms events | 2 | KEEP |
| vault_files | SOA/JornayaCert/app PDFs (compliance retention) | 3 | KEEP |
| nigo_reasons | NIGO reason reference data | 0 | KEEP |
| nigos | NIGO work-item queue | 4 | KEEP |
| forecast_runs | AI forecast model runs | 0 | KEEP |
| forecast_overrides | Manual override per period | 0 | KEEP |
| coaching_sessions | Rep coaching appointments | 2 | KEEP |
| coaching_notes | Session notes | 2 | KEEP |
| households | Client household grouping | 1 | KEEP |
| clients | Individual in household | 2 | KEEP |
| book_entries | In-force policy log per rep | 2 | KEEP |
| recruits | Candidate funnel | 0 | KEEP |
| interviews | Interview outcomes | 1 | KEEP |
| threads | In-app DM/team/lead threads | 1 | KEEP |
| thread_members | Thread participants | 1 | KEEP |
| messages | Message body + metadata | 1 | KEEP |
| message_reads | Read receipts | 1 | KEEP |
| notifications | Bell-icon events | 0 | KEEP |
| tasks | Rep action items | 3 | KEEP |
| followup_rules | Trigger → action automation | 0 | KEEP |
| tier_changes | Bronze→Diamond audit trail | 1 | KEEP |
| aep_periods | AEP season definitions | 0 | KEEP |
| aep_assignments | Rep territory + targets per period | 2 | KEEP |
| agent_deployments | Agent → host manifest | 2 | KEEP |
| agent_install_tokens | One-time enrollment tokens | 1 | KEEP |
| agent_runs | Agent run telemetry | 2 | KEEP |
| sequences | Lead nurture sequences | 0 | KEEP |
| sequence_enrollments | Lead enrollment in sequence | 3 | KEEP |
| tiering_overrides | Manual tier assignments | 1 | KEEP |
| org_settings | Key-value org config | 0 | KEEP |
| onboarding_progress | Rep onboarding completion | 0 | KEEP |
| training_courses | Course catalog | 0 | KEEP |
| training_assignments | Courses assigned to reps | 2 | KEEP |
| training_progress | Completion status | 2 | KEEP |
| automation_rules | Trigger → action rules | 0 | KEEP |
| automation_runs | Automation execution log | 0 | KEEP |
| cross_sell_queue | Med Supp → FE cross-sell queue | 0 | KEEP |
| cross_sell_rules | Cross-sell config | 0 | KEEP |
| followup_templates | Email/SMS templates | 0 | KEEP |
| followup_runs | Template execution log | 0 | KEEP |
| agency_scripts | Training scripts | 0 | KEEP |
| agency_videos | Training videos | 0 | KEEP |
| agency_docs | Compliance/carrier docs | 0 | KEEP |
| agency_quick_links | Carrier portals + training URLs | 0 | KEEP |
| agency_expenses | Lead spend per source/month | 0 | KEEP |
| expense_allocations | Cost allocation to reps | 0 | KEEP |
| workflow_assignments | Automation→rep/agency links | 0 | KEEP |
| sms_outbox | Outbound SMS queue | 0 | KEEP |
| demo_submissions | Demo screen captures (QA) | 0 | KEEP |
| subscriptions | Stripe subscription tracking | 0 | KEEP |
| quote_runs | Carrier quote batch pairs | 0 | KEEP |
| auto_quote_requests | Batch quote request payloads | 0 | KEEP |
| auto_quote_results | Batch quote response payloads | 0 | KEEP |
| auto_quoter_settings | Carrier API config per carrier | 0 | KEEP |
| carrier_sessions | Carrier session/auth state | 0 | KEEP |
| imos | IMO super-agency master data | 0 | DEPRECATE (no frontend; admin role being killed) |
| imo_members | IMO membership | 0 | DEPRECATE (no frontend; admin role being killed) |

**Conditionally-KEEP** (required by Wave 2 but `SHAPE NOT DATA` principle applies):
- `profiles` — KEEP (mandatory, referenced by auth flows)
- `connector_catalog` — KEEP (mandatory)
- `agency_onboarding_steps` — KEEP (mandatory)
- `role_agent_defaults` — KEEP (mandatory)

**No zero-row + no-FK tables flagged** — all tables with 0 FKs serve as reference/config roots.

**Duplicate-purpose note:**
- `agency_scripts` / `agency_videos` / `agency_docs` / `agency_quick_links` — 4 tables for Resources tab content. Separate by type by design (different columns). KEEP as-is.
- `vault_files` vs `vault_artifacts` — audit found only `vault_files` in migrations. `vault_artifacts` referenced in `page-transcriber.jsx` may be a table alias or missing migration. **Flag for schema check.**

---

## 2. PAGE INVENTORY

| File | LOC | NAV Roles | Supabase Deps | Verdict |
|---|---|---|---|---|
| page-extras.jsx | 3,347 | All (settings hub) | notifications, training_* | KEEP |
| page-queue.jsx | 1,941 | rep, manager | routing_rules | KEEP |
| **page-platform-admin.jsx** | 1,281 | admin, super_admin | agencies, agency_* (7 tables) | **KILL** (admin role eliminated; super_admin routes null-safe) |
| page-floor.jsx | 1,220 | rep, manager, owner | — | KEEP |
| page-today.jsx | 1,086 | rep, manager, owner | — | KEEP |
| **page-manager.jsx** | 1,059 | manager | routing_rules | **MERGE→page-owner.jsx** |
| page-resources.jsx | 950 | owner, rep | vault | KEEP |
| page-crm.jsx | 875 | manager, owner | — | KEEP |
| page-tenant.jsx | 841 | admin, super_admin | agencies, carriers, connections | KEEP (super_admin only after cleanup) |
| page-owner.jsx | 813 | owner | — | KEEP (absorbs manager) |
| page-auto-quoter.jsx | 809 | owner | auto_quote_*, carrier_session_status | KEEP |
| page-recruiting.jsx | 743 | manager, owner | recruiting_campaigns | KEEP |
| page-ops-depth.jsx | 636 | ops | — | KEEP |
| page-expenses.jsx | 604 | manager, owner | agency_expenses, agency_lead_sources | KEEP |
| page-quote.jsx | 592 | owner | — | KEEP |
| page-pipeline.jsx | 532 | rep, manager, owner | — | KEEP |
| page-first-run.jsx | 531 | rep, manager, owner | — | KEEP |
| page-platform.jsx | 524 | admin, super_admin | agent_deployments, agent_install_tokens | KEEP (super_admin only) |
| page-onboarding.jsx | 461 | rep, manager, owner | connections | KEEP |
| page-auth.jsx | 461 | pre-auth | — | KEEP |
| page-ops.jsx | 391 | ops | agent_runs, connections | KEEP |
| page-admin.jsx | 388 | owner, admin | agencies, agency_*, members, invites | KEEP (owner only after cleanup) |
| page-performance.jsx | 387 | rep, manager, owner | — | KEEP |
| page-deal-write.jsx | 382 | owner | pipeline, policies | KEEP |
| page-floor-actions.jsx | 370 | rep, manager | — | KEEP |
| page-library.jsx | 355 | all | — | KEEP |
| page-autodialer.jsx | 344 | rep, manager | — | KEEP |
| page-transcriber.jsx | 336 | rep | vault_artifacts | KEEP |
| page-billing.jsx | 314 | admin, super_admin | agencies, agency_members | KEEP (super_admin only) |
| page-attribution.jsx | 289 | owner | mock data only | KEEP |
| page-mobile.jsx | 282 | rep | — | KEEP |
| page-quote-card.jsx | 270 | owner | — | KEEP |
| page-messages.jsx | 247 | manager, owner | — | KEEP |
| page-invite-team.jsx | 222 | owner | agency_members | KEEP |
| page-redial-queue.jsx | 213 | rep, manager | — | KEEP |
| page-pipeline-sequences.jsx | 197 | manager | — | KEEP |
| mobile-extra-screens.jsx | 177 | (orphan proto) | — | **KILL** (no NAV link, no import, dead mobile prototype) |
| **page-imo.jsx** | N/A | N/A | N/A | **N/A — FILE DOES NOT EXIST** |
| ios-frame.jsx | 338 | (orphan proto) | — | **KILL** (iOS frame mock, no route, no import) |

---

## 3. KILL LIST

### Tables to Drop
None in this wave. `imos` and `imo_members` are DEPRECATE-flagged (no Wave 2 migration; leave for a separate pass).

### Files to Delete
| File | Reason | Refs to Remove |
|---|---|---|
| `page-platform-admin.jsx` | admin role eliminated; null-safe guard already in index.html routes | `shared.jsx`:NAV.admin, `index.html`:line 60 script tag + lines 233–248 routing block + line 325 TweakRadio Admin option |
| `mobile-extra-screens.jsx` | Zero imports, zero routes, dead prototype | None — unreferenced |
| `ios-frame.jsx` | Zero imports, zero routes, iOS frame mock | None — unreferenced |

### Pages to Merge
| Source | Target | Reason |
|---|---|---|
| `page-manager.jsx` | `page-owner.jsx` | Single unified leadership page; manager sees `scopeRepIds()` team scope, owner sees full agency |

### NAV Entries to Remove
| File | Line | Content | Reason |
|---|---|---|---|
| `shared.jsx` | 105–113 | `admin: [...]` NAV block | admin role eliminated |
| `shared.jsx` | 168 | `"admin"` in role-switch array | admin role eliminated |
| `shared.jsx` | 170 | `r === "admin" ? "Admin" :` label | admin role eliminated |
| `index.html` | 60 | `<script src="page-platform-admin.jsx">` | file deleted |
| `index.html` | 160–163 | `if (meRow.role === "admin") setTweak(...)` auth block | admin role eliminated |
| `index.html` | 233–241 | `case "admin": ...PagePlatformAdmin` routing | admin role eliminated |
| `index.html` | 243–248 | `case "platform"/"agencies"/"users"/"billing"/"audit"/"system"` using PagePlatformAdmin | now render null via existing guard |
| `index.html` | 325 | `{value:"admin",label:"Admin"}` TweakRadio option | admin role eliminated |
| `page-extras.jsx` | 1196–1199 | `imo_owner` role check comment + condition | dead role |
| `page-extras.jsx` | 1202 | `role === "manager" \|\| role === "admin"` → remove `admin` | admin role eliminated |

### Constants to Remove
| Constant | File | Status |
|---|---|---|
| `ROLE_ADMIN_ENABLED` | N/A | **DOES NOT EXIST** — already clean |
| `SETTINGS_TAB_ORDER` | N/A | **DOES NOT EXIST** in page-extras.jsx — inline only |

---

## 4. OPEN QUESTIONS FOR IAN (max 5)

1. **Super-admin platform UI**: `page-platform-admin.jsx` also backed the `super_admin` routes (`platform`, `agencies`, `users`, `billing`, `audit`, `system`). After deletion, these render null via existing null-guards. Will super_admin platform views be rebuilt in a future pass, or should we route them to `page-tenant.jsx` as an interim? *(Current plan: leave null — safe, not broken, just blank pages.)*

2. **`vault_artifacts` vs `vault_files`**: `page-transcriber.jsx` queries `vault_artifacts` but migrations only define `vault_files`. Is `vault_artifacts` a renamed table that never got a migration, or is the query wrong?

3. **`imos` / `imo_members` tables**: Two migrations define IMO hierarchy tables. With `admin` role killed, these tables are orphaned in the schema. Drop them in 0025 migration or leave for a future IMO re-implementation?

4. **`page-admin.jsx`**: Currently listed as `owner, admin` in NAV. After `admin` is removed, only `owner` sees it. The page also references `agencies` table (multi-tenant pivot). Are the `agencies`-level queries safe for a single-agency owner to hit? Or should `page-admin.jsx` be narrowed to single-agency-only queries?

5. **downline tree depth**: The `downline_of()` RPC is recursive (CTE on `reps.upline_id`). For the Wave 2 tree component, should it show all levels (unlimited depth) or cap at 2 (manager → rep)?
