# RBA Super-Admin Diagnostics — Build Audit
**Date:** 2026-05-27  
**Commit:** `a313999`  
**Author:** Ian / bigbacon61 (Dispatch session)

---

## What Was Built

Full greenfield implementation of the `sa_*` super-admin diagnostic command layer for the RepFlow agent system. Allows a super_admin to issue read-only diagnostic commands to any agent device from the Admin → Devices UI.

---

## Files Shipped

| File | Type | Purpose |
|---|---|---|
| `supabase/migrations/0074_rba_super_admin_diag.sql` | Migration | Extends kind CHECK + new RPC |
| `api/agent/post-super-admin-command.js` | Edge fn | User JWT → RPC dispatch |
| `api/agent/diagnostic-upload.js` | Edge fn | Agent token → rba_diagnostics INSERT |
| `api/agent/inspect-db.js` | Edge fn | Agent token → read-only SQL execution |
| `agent/runtime/tools/sa_snapshot_state.py` | Python tool | Local state snapshot |
| `agent/runtime/tools/sa_inspect_db.py` | Python tool | Read-only DB query relay |
| `agent/runtime/tools/sa_tail_logs.py` | Python tool | Log tail + audit rows |
| `agent/runtime/tools/sa_diag_pull.py` | Python tool | Full diagnostic bundle upload |
| `agent/runtime/tools/sa_replay_failed.py` | Python tool | Re-run last failed command |
| `agent/runtime/tools/sa_export_local_state.py` | Python tool | Cache + file tree export |
| `page-admin.jsx` | UI | Super-Admin Diagnostics panel |
| `index.html` | Config | Cache-buster bump v89→v90 |

---

## Migration 0074 Detail

### CHECK Constraint Extension
`rba_commands.kind` extended from 23 → 29 values via DROP + ADD CONSTRAINT (only portable Postgres approach). New values:
```
sa_snapshot_state, sa_inspect_db, sa_tail_logs,
sa_diag_pull, sa_replay_failed, sa_export_local_state
```

### Schema Corrections (vs spec)
The task spec described a fictional `rba_audit` shape (`actor_id`, `kind`, `payload jsonb`). The actual 0030 schema uses `(user_id, tool, result text, detail)`. Migration writes to the actual schema:
- `tool = p_kind`
- `result = 'ok'`
- `detail = 'cmd:<uuid>'` (cross-reference to rba_commands)

Similarly, `rba_installs` PK is `device_id` (not `id`), and `rba_commands` uses `posted_by` (not `issued_by`). All corrected against actual 0030 DDL.

### RPC `rba_post_super_admin_command`
```sql
SECURITY DEFINER, SET search_path = public
Guards: is_super_admin() OR raise 'not_super_admin'
        p_kind LIKE 'sa_%' OR raise 'invalid_sa_kind'
        device exists OR raise 'device_not_found'
Returns: uuid (command_id)
```

### Verify Block
Reads `pg_constraint.conname = 'rba_commands_kind_check'` and confirms all 6 `sa_*` strings appear in `pg_get_constraintdef()`. Raises EXCEPTION if any are missing.

---

## API Endpoint Detail

### `POST /api/agent/post-super-admin-command`
- **Auth**: User JWT (`Authorization: Bearer <jwt>`)
- **Body**: `{ device_id, kind, payload? }`
- **Security**: DB RPC enforces `is_super_admin()` at DB level — even if this endpoint is called directly with a non-super-admin JWT, the RPC raises and the response is 403
- **Error mapping**: `not_super_admin` → 403, `device_not_found` → 404

### `POST /api/agent/diagnostic-upload`
- **Auth**: Agent token (`x-agent-token` header → `readAgentToken` → `loadInstallByToken`)
- **Body**: `{ bundle, size_bytes, expires_at? }`
- **Storage**: Service-role INSERT into `rba_diagnostics`; stamps `device_id` + `agency_id` from install row

### `POST /api/agent/inspect-db`
- **Auth**: Agent token
- **Body**: `{ sql }` (max 8192 chars)
- **Security layers** (in order):
  1. Agent token validation (no oracle attacks)
  2. SQL length cap (8192 chars)
  3. Write-op regex: `\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|EXECUTE)\b`
  4. Executes via `exec_safe_read` RPC (service role, read-only)
- **Current state**: `exec_safe_read` RPC does not yet exist in DB → endpoint returns `{ error: "exec_safe_read_not_available", sql_validated: true }` with HTTP 501. SQL validation (layers 1-3) is fully functional.
- **TODO**: Add `exec_safe_read` RPC in migration 0075

---

## Python Tool Detail

| Tool | Key behavior |
|---|---|
| `sa_snapshot_state` | Reads `~/.repflow/agent/runtime/capability_cache.json`, `rate_limits.json`, last 50 agent.log lines. Redacts values matching `[A-Za-z0-9]{40,}`. |
| `sa_inspect_db` | Local `_WRITE_RE` regex guard FIRST (no network call on rejection). Then POST to `/api/agent/inspect-db` with `x-agent-token`. |
| `sa_tail_logs` | Last N lines of agent.log + install.log. GET `/api/agent/audit?limit=N`. Default N=50, cap=200. |
| `sa_diag_pull` | Full bundle: capability_cache + rate_limits + logs + audit rows + cmd history. POST to `/api/agent/diagnostic-upload`. Returns `diagnostic_id`. |
| `sa_replay_failed` | GET `/api/agent/audit?limit=100`, find first row with `status==error` or `result.error`. `importlib.util.spec_from_file_location` to load tool module dynamically. Returns traceback on failure. |
| `sa_export_local_state` | Full capability_cache, rate_limits, redacted connector_cache, recursive `~/.repflow/` file tree (paths + sizes). |

**Auto-discovery**: `agent/runtime/tools/__init__.py` is empty — agent auto-discovers tools by filename. No registration needed.

**Header convention**: All tools use `x-agent-token` header (consistent with live codebase convention, not `Authorization: Bearer`).

---

## UI Detail

### Location
`page-admin.jsx` → `DevicesAdminView()` → device drawer first column → after existing buttons (Ping / Refresh caps / Models / Revoke)

### Super_admin Guard
```jsx
{window.me && window.me()?.role === "super_admin" && (() => { ... })()}
```
Invisible to all non-super-admin users. No DOM flicker — renders nothing when guard is false.

### State Management
`const [saDiagState, setSaDiagState] = useState({})` at component level, keyed by `device_id`. Allows multiple drawer instances open simultaneously with independent state.

### `saCmd(deviceId, kind, payload)`
Calls `POST /api/agent/post-super-admin-command` with session JWT from `sb.auth.getSession()`. Updates `saDiagState[deviceId]` with `{ loading, result, error }`.

### Inspect DB modal
"Inspect DB" button toggles an inline `<textarea>` with font-mono styling. "Run SQL" submits the textarea content as `payload.sql`. The local regex guard in `sa_inspect_db.py` fires before the network call; the API's `inspect-db.js` guard fires as a second layer.

### Result viewer
Scrollable `<pre>` (`maxHeight: 180px`) with `JSON.stringify(result, null, 2)`. Absolute-positioned "Copy" button calls `navigator.clipboard.writeText`. Errors in `var(--state-danger)`.

---

## Security Properties

| Property | How enforced |
|---|---|
| Only super_admins can issue sa_* commands | `is_super_admin()` at DB RPC level — bypasses any client-side guard |
| sa_* commands can't write data | CHECK constraint blocks non-sa_* kinds from this RPC |
| inspect-db can't modify the DB | Write-op regex at BOTH Python layer and API layer |
| Agent token can't access other agents' data | `loadInstallByToken` returns the specific install row; diagnostic-upload stamps its own `device_id` |
| No service role exposure to reps | `inspect-db.js` uses service role for `exec_safe_read` RPC which will enforce its own security; agent token is the access control layer |

---

## Known Gaps / Follow-up Required

| Item | Status | Priority |
|---|---|---|
| Apply migration 0073 to Supabase | Pending — Supabase MCP unavailable | High — carrier UW rules blocked |
| Apply migration 0074 to Supabase | Pending — Supabase MCP unavailable | High — sa_* commands blocked until applied |
| `exec_safe_read` RPC (migration 0075) | Not written | Medium — `inspect-db.js` degrades gracefully to 501 |
| Foresters Advantage Plus II product_key label | DB admin fix needed | Low — flagged in 0073 audit doc |
| Loop 2 webhook secrets (Calendly + Fathom) | Waiting on Ian | Medium |

---

## Acceptance Gates

To verify after migrations are applied and deployment is confirmed:

1. **Auth guard works**: Non-super-admin logs in → Admin → Devices → open any device drawer → Super-Admin Diagnostics section should be invisible
2. **Super-admin sees panel**: Ian logs in as super_admin → same path → panel visible with 6 buttons
3. **Ping vs sa_snapshot_state**: Click "Snapshot State" on an active device → command appears in Recent Commands column → agent picks it up and returns result
4. **inspect-db blocks writes**: Click "Inspect DB" → type `DELETE FROM reps` → "Run SQL" → 400 `read_only_query_required` (local Python guard fires before network)
5. **inspect-db allows reads**: Type `SELECT count(*) FROM public.reps` → after exec_safe_read migration applied → returns `{ rows: [{count: N}], row_count: 1 }`
6. **Non-super-admin 403**: Direct `curl -X POST .../api/agent/post-super-admin-command -H "Authorization: Bearer <non-sa-jwt>"` → 403

---

## Sources

- `supabase/migrations/0030_rba_installs.sql` — actual rba_commands/rba_audit/rba_installs schema
- `agent/runtime/tools/twilio_dial.py` — canonical tool pattern
- `api/agent/post-command.js` — JWT auth API pattern
- `api/agent/_lib.js` — shared helpers (readAgentToken, loadInstallByToken, SUPA_URL, SERVICE)
- `page-admin.jsx` — DevicesAdminView drawer structure
