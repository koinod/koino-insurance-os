# REALTIME COVERAGE AUDIT — channels, mutations, and false-live UI

Date: 2026-05-15
Method:
1. Found every `sb.channel("...")` / `supabase.channel("...")` and every `channel.on("postgres_changes", { ..., table: "X" }, …)` call in `.jsx`/`.js`.
2. Found every `_emitMutation("X", …)` invocation in `.jsx`/`.js`.
3. Found every `window.addEventListener("data:realtime", …)` and noted the listening component + which table(s) the component reads from.
4. Cross-referenced against the schema-drift audit's `all_code_tables` set so coverage is reported against the full universe of tables the client actually queries.

No code changes — audit only.

---

## A. The realtime subscription map (`data.jsx:850-969`)

`data.jsx` creates a single Supabase channel named `"repflow-rt"` and subscribes to `postgres_changes` events for the tables in `TABLE_TO_KEY` (`data.jsx:854-878`) plus two more handled inline (`training_assignments`, `training_progress`). Each event mutates `window.AppData.<KEY>` in place and dispatches `CustomEvent("data:realtime", { detail: { table, eventType, id } })` plus a `data:hydrated` event.

### Tables WITH realtime channel (20)

Source: `data.jsx:854-878` + inline blocks `:925`, `:948`.

| Table | AppData key | Migration audit-trail |
|---|---|---|
| `pipeline` | `PIPELINE` | `0001_repflow_v2_init.sql:65` |
| `queue` | `QUEUE` | `0001:90` |
| `reps` | `REPS` | `0001:45` |
| `hardware` | `HARDWARE` | `0001:149` |
| `ai_agents` | `AGENTS` | `0001:163` |
| `connections` | `CONNECTIONS` | `0001:137` |
| `workflows` | `WORKFLOWS` | `0001:177` |
| `agent_deployments` | `DEPLOYMENTS` | `0002_fill_missing_domains.sql` |
| `agent_runs` | `AGENT_RUNS` | `0002` |
| `agency_scripts` | `SCRIPTS_LIB` | `0010_resources_persistence.sql` |
| `agency_videos` | `VIDEOS` | `0010` |
| `agency_docs` | `DOCS` | `0010` |
| `agency_quick_links` | `QUICK_LINKS` | `0010` |
| `notifications` | `NOTIFICATIONS` | publication added in `0018_realtime_publication.sql:11` |
| `commissions` | `COMMISSIONS` | publication added in `0018:18` |
| `training_courses` | `TRAINING_COURSES` | `0019_training_courses.sql` |
| `training_assignments` | (folded into `TRAINING_ASSIGNMENTS`) | `data.jsx:925` |
| `training_progress` | (folded into `TRAINING_PROGRESS`) | `data.jsx:948` |
| `lead_vendor_webhooks` | `VENDOR_WEBHOOKS` | `0025_lead_vendor_webhooks.sql` |
| `vault_segments` | `SEGMENTS` | `0026_vault_rework.sql` |

---

## B. Tables WITHOUT realtime channel (85 of 105 referenced in code)

These tables are queried by the client (per the schema-drift audit) but have no `postgres_changes` subscription. Any mutation made from another browser tab, another user, or a backend cron will NOT appear in the UI until a full re-hydrate.

Full list (85):

`aep_assignments, aep_periods, agencies, agency_audit_log, agency_calls, agency_carrier_appointments, agency_expenses, agency_invites, agency_lead_sources, agency_members, agency_notifications, agency_onboarding_steps, agent_install_tokens, agent_settings, appointments, attributions, auto_quote_requests, auto_quote_results, auto_quoter_settings, automation_rules, automation_runs, book_entries, call_events, call_recordings, carrier_appointments, carrier_profiles, carrier_scrape_findings, carrier_session_status, carriers, clawbacks, clients, coaching_notes, coaching_sessions, connector_catalog, connector_vault, courses, drip_log, followup_rules, followup_runs, followup_templates, forecast_overrides, forecast_runs, households, imos, interviews, lead_quotes, lead_sources, meeting_notes, message_reads, messages, nigo_items, nigo_reasons, nigos, notification_prefs, onboarding_progress, org_settings, payouts, policies, product_underwriting_rules, products, rba_action_confirmations, rba_audit, rba_commands, rba_installs, recordings, recruiting_applicants, recruiting_campaigns, recruiting_messages, recruits, routing_rules, saved_views, sequence_enrollments, sequences, sms_outbox, tasks, thread_members, threads, tier_changes, tiering_overrides, touchpoints, v_agency_onboarding_status, v_user_metrics, vault_artifacts, vault_files, workflow_assignments`

Notable categories:
- **Calling & dialer:** `call_events`, `call_recordings`, `rba_audit`, `rba_action_confirmations`, `rba_commands`, `rba_installs` — no live channel. A rep finishing a call elsewhere wouldn't reflect on another manager's screen.
- **Quoting:** `auto_quote_requests`, `auto_quote_results`, `auto_quoter_settings`, `lead_quotes`, `quote_runs` — no live channel.
- **Lead vendor inbound:** `sms_outbox`, `drip_log` — no live channel; only `lead_vendor_webhooks` config is live, not the actual messages/events.
- **Tenant ops:** `agencies`, `agency_members`, `agency_invites`, `agency_notifications`, `agency_lead_sources`, `agency_audit_log`, `agency_onboarding_steps`, `agency_expenses` — no live channel.
- **Recruiting:** `recruiting_applicants`, `recruiting_campaigns`, `recruiting_messages`, `recruits`, `interviews` — no live channel.
- **CRM tasks/messages:** `tasks`, `messages`, `thread_members`, `threads`, `message_reads` — no live channel (despite the in-app chat UI in `page-messages.jsx`).
- **Workflows / automations:** `automation_rules`, `automation_runs`, `workflow_assignments`, `followup_rules`, `followup_runs`, `followup_templates` — no live channel.
- **Coaching:** `coaching_sessions`, `coaching_notes` — no live channel.
- **NIGO:** `nigo_items`, `nigos` — no live channel.

---

## C. `_emitMutation()` but no realtime channel (false-live mutations)

`data.jsx:838-840` defines `_emitMutation(table, kind, id)` as a thin wrapper that dispatches a local `data:mutated` CustomEvent. It does NOT touch the Supabase channel — it's purely a same-tab signaling mechanism so the page that just performed the write can re-render after its own optimistic update.

Tables that ONLY emit via `_emitMutation` (no realtime channel) — mutations are visible only on the writing tab:

| Table | `_emitMutation` site | Implication |
|---|---|---|
| `agencies` | `data.jsx` (admin config writes) | Another admin user editing the same agency won't see your changes until refresh |
| `agency_notifications` | `data.jsx:1762,1788` | NotificationsBell on `page-admin.jsx:735` listens for `data:realtime` filtered by `table === "agency_notifications"` — but no remote events ever fire. False-live UI. |
| `coaching_notes`, `coaching_sessions` | data.jsx coaching writes | Manager + coach won't see each other's notes live |
| `followup_runs`, `followup_templates` | data.jsx workflow writes | Template edits don't propagate cross-tab |
| `lead_quotes` | data.jsx:1920 | Cross-sell quote inserts don't sync |
| `messages` | data.jsx messaging writes | In-app chat is NOT live cross-tab; only via `data:hydrated` after a manual refresh |
| `nigo_items` | data.jsx:1268-1292 | NIGO board won't show another rep's new flag live |
| `notification_prefs` | data.jsx:1231 | User pref change in another session not visible |
| `onboarding_progress` | data.jsx:1378-1403 | First-run progress not synced cross-tab |
| `policies` | data.jsx:1025-1075 | Policy issuance NOT live (commissions ARE live; policies are not) |
| `recruiting_applicants`, `recruiting_campaigns`, `recruiting_messages` | data.jsx:1312-1353 | Recruiting board not live |
| `routing_rules`, `saved_views` | data.jsx:1538+, :1584 | Admin config writes not live |
| `sequence_enrollments` | data.jsx:1212 | Drip enrollments not live |
| `threads` | data.jsx threads writes | Same as messages |
| `tiering_overrides` | data.jsx:1198 | Manager override not live to rep |
| `vault_artifacts` | data.jsx:1245-1257 | Vault retention updates not live |
| `workflow_assignments` | data.jsx:1440 | Workflow assignment changes not live |
| `workflows` | data.jsx:1415 | Workflow definition edits not live (workflows IS in TABLE_TO_KEY; this row is duplicative) — re-check |

Special case: `workflows` IS in `TABLE_TO_KEY` (`data.jsx:861`). Its `_emitMutation` call at `data.jsx:1415` is redundant on the same tab but harmless; cross-tab updates DO arrive via realtime.

---

## D. Components that re-render on `data:realtime` but whose table has no live channel — confirmed false-live UI

Found by scanning every `window.addEventListener("data:realtime", …)` for an `if (e.detail?.table === "X")` filter (or a generic refresh) and cross-checking `X` against `TABLE_TO_KEY`.

| Listener | File:line | Filter | Channel for that table? | Verdict |
|---|---|---|---|---|
| Notifications bell | `page-admin.jsx:733-737` | `e.detail?.table === "agency_notifications"` | NO | **False-live.** Bell will never tick from a remote insert. Either add `agency_notifications` to `TABLE_TO_KEY` + the `supabase_realtime` publication, or remove the listener and document the manual-refresh expectation. |
| Agent ops runs panel | `page-ops.jsx:237-241` | `e.detail?.table === "agent_runs"` | YES | True-live. |
| Generic refresh in `useDripReady` | `page-leaddrip.jsx:5-19` | none (refreshes on every `data:realtime`) | Page reads from `sms_outbox`, `agency_lead_sources`, `agency_expenses`, `sequences`, `sequence_enrollments`, `lead_vendor_webhooks`, `agency_lead_sources`, `org_settings` | Mixed. Only `lead_vendor_webhooks` is live; others trigger refresh only on local mutations. UI feels live when in fact it's eventual-consistent. |
| Vendor list refresh | `page-leaddrip.jsx:415-416` | none (forces refresh) | only `lead_vendor_webhooks` from page's data set is live | Partially live. |
| Floor live indicator | `page-floor.jsx:113-114` | none | Reads `pipeline`, `queue`, `reps` — all live. | Live. |
| Messages list | `page-messages.jsx:25-35` | none | `messages` / `threads` / `thread_members` NOT live | **False-live.** New chat messages from another participant don't appear until manual refresh. Only same-tab mutations show. |
| Mobile refresh | `page-mobile.jsx:42-49` | none | mobile screens read `pipeline`, `queue`, `reps`, `policies`, `commissions`, `notifications` — pipeline/queue/reps/commissions/notifications are live; policies is NOT | Mostly live; policy issuance from another user doesn't appear. |
| Queue tab | `page-queue.jsx:1097-1102` | none | reads `pipeline`, `queue`, `reps` — all live | Live. |
| Vault tab listeners | `page-extras.jsx:220`, `:658`, `:801`, `:943` | none | vault tab reads `agency_scripts`, `agency_videos`, `agency_docs`, `agency_quick_links`, `vault_segments` — all live; ALSO reads `vault_artifacts` which is NOT live | Mostly live for static vault content; uploaded artifacts not live. |
| Vault carriers block | `page-extras.jsx:1874-1878` | none | reads `carrier_appointments`, `carriers` — neither live | **False-live.** Carrier-appointment status changes don't propagate. |
| VideosPane | `page-extras.jsx:2261-2265` | none | reads `agency_videos` (live) | Live. |
| ScriptsPane | `page-extras.jsx:2429-2433` | none | reads `agency_scripts` (live) | Live. |

---

## E. Risks summarized

**HIGH false-live risk** — components that visibly look live but aren't:
- `page-admin.jsx` notifications bell (table `agency_notifications` — no channel)
- `page-messages.jsx` chat (tables `messages`, `threads`, `thread_members` — no channel)
- `page-extras.jsx:1874` vault carriers block (tables `carrier_appointments`, `carriers` — no channel)

**MEDIUM** — pages that listen for `data:realtime` to re-render but the listener is essentially a no-op for cross-tab updates because the relevant tables have no channel: `page-leaddrip.jsx` (most lead-drip surfaces).

**LOW** — `data.jsx` `_emitMutation` provides same-tab optimistic UI for ~23 tables; cross-tab updates require manual refresh. Acceptable for write-light surfaces (`tiering_overrides`, `saved_views`, `routing_rules`, `notification_prefs`) but suspicious for tasks/messages/threads.

---

## F. Recommended next steps (NO CODE CHANGES IN THIS COMMIT)

1. Decide whether `agency_notifications`, `messages`/`threads`/`thread_members`, and `policies` should be added to `supabase_realtime` publication and `TABLE_TO_KEY`. If yes: new migration `<ts>_realtime_publication_phase2.sql`.
2. If the listeners are intentional but the channel isn't planned, change the components to fetch on a polling interval and remove the false `data:realtime` listener.
3. Audit `lead_vendor_webhooks`/`drip_log` together — webhook config IS live but the actual inbound traffic (`drip_log`) is not.
4. TODO: confirm the `supabase_realtime` PUBLICATION in production has every table the client subscribes to — `0018_realtime_publication.sql` only explicitly adds `notifications` and `commissions`; the rest depend on dashboard-side wiring. A clean re-deploy may lose realtime for the other 18 tables.
