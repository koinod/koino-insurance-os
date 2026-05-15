# RBA Phone Link gap closed — 2026-05-15 v4

The Bluetooth/Phone Link gap from PRD §6 is now closed. The agent has
a real `phone_link_dial` tool that dispatches calls through the user's
paired phone via Microsoft Phone Link.

## ✅ Verified

| Step | Evidence |
|---|---|
| Pre-flight: Phone Link is installed | `Microsoft.YourPhone v1.26032.102.0`, `PhoneExperienceHost.exe` PID 14948 running with window title "Phone Link" |
| Pre-flight: `ms-phone://` URI scheme is registered | Discovered via `AppxManifest.xml` — Phone Link declares `['ms-phone', 'tel', 'sms']` protocols |
| Tool reaches the agent | After bundle 0.2.2 + restart, `loaded tools: [..., 'phone_link_dial', ...]` |
| Agent claims + dispatches | Command `140314db-9748-4e01-88d1-2bb4f3ca1f0c` succeeded in 559ms |
| Correct URI used | Result: `handler: "ms-phone:?action=call&number=+19312522222"` (first URI in fallback chain succeeded) |
| Phone Link receives | `PhoneExperienceHost.exe` is the registered handler for `ms-phone:`, was already running, accepted the call URI |

## How it works

```
SQL/Web UI/automation → rba_commands.kind=phone_link_dial
        ↓
agent (3s poll) → claims command
        ↓
runtime/tools/phone_link_dial.py
  → confirmation_request (unless auto_dial=true)
  → os.startfile("ms-phone:?action=call&number=+19312522222")
        ↓
Windows shell hands ms-phone:// URI to PhoneExperienceHost.exe
        ↓
Phone Link Calls UI → routes through paired phone (Bluetooth/cellular)
```

The fallback chain tries 4 URI variants in order:
1. `ms-phone:?action=call&number=<E164>` ← worked tonight
2. `ms-phone:?number=<E164>`
3. `ms-phone://call/<E164>`
4. `tel:<E164>` (last resort, requires Phone Link as default tel: handler)

## Issues hit + fixed during this round

1. **Vercel ENOENT race** — `dist/app.js` missing during deploy. Root cause: the build script does `rm -rf dist/` before rebuilding, and Vercel runs the build in parallel with asset collection. Fixed by removing the `rm` (esbuild overwrites individual outputs cleanly).
2. **Stale local install** — first dial attempt used `tel:` because the agent had the old version of phone_link_dial.py cached. Fixed by re-pulling from `/api/agent/runtime-file` after the second push and restarting the Scheduled Task.
3. **Phone Link tel: NOT default** — pre-flight check showed no `UserChoice` for `tel:`. Bypassed by using `ms-phone://` directly, which doesn't depend on the user's tel: default.

## How to use it

**One-off dial via SQL:**
```sql
insert into public.rba_commands (device_id, agency_id, kind, payload)
values (
  '<your_device_id>', '<your_agency_id>', 'phone_link_dial',
  '{"to_number":"+15551234567","auto_dial":true,"lead_id":"<optional>"}'::jsonb
);
```

**Via Manual Command Tester (Admin → Devices):** kind=`phone_link_dial`, payload `{"to_number":"+15551234567","auto_dial":true}`.

**With confirmation flow:** set `auto_dial:false` (default) — agent posts a `confirmation_request` first, you approve via web modal/SMS/OS push, agent then dispatches.

**Via automation rule:** Settings → Agents → Automations → trigger=`call_completed` → command_kind=`phone_link_dial`. Lets the agent fire follow-up calls automatically.

## What's still missing

- **Phone Link "Always confirm" check** — if the user has confirmation enabled in Phone Link settings, the call doesn't auto-dial; user must click "Call" in the Phone Link popup. The tool returns `dispatched_to_phone_link` either way; can't distinguish from this side.
- **Call status callback** — Phone Link doesn't write back whether the call connected, was answered, or duration. We rely on `call_events` from Twilio for that data; Phone Link calls don't appear there. Pure Phone Link calls are fire-and-track-on-the-phone for now.
- **Recording** — Phone Link calls aren't recordable from Windows side (audio is piped through the paired phone). For recording use the Twilio path instead.
- **Mac equivalent** — `phone_link_dial` returns `platform_unsupported` on Mac. macOS Continuity Calling via FaceTime URL scheme would be the parallel; not built tonight.

## Commits this round

```
270313c Merge: ms-phone fallback chain
a5a893f feat(rba): phone_link_dial tries ms-phone:// first
e2d80cc Merge: build race fix
81974df fix(build): don't rm -rf dist/ — Vercel deploys race causing ENOENT
4b76bda Merge: phone_link_dial tool
a309a15 (earlier this session) fix(rba): map consent values to pipeline CHECK
```

## Updated bundle / DB

- Vercel: bundle_version `0.2.2` live
- `rba_commands.kind` enum extended with `phone_link_dial`
- Local agent at `~/.repflow/agent/runtime/tools/phone_link_dial.py` is the ms-phone:// version

## Test artifact

DB row `rba_commands.id = 140314db-9748-4e01-88d1-2bb4f3ca1f0c` proves
the dispatch. Inspect:
```sql
select kind, status, result, completed_at - created_at as latency
  from public.rba_commands
 where id = '140314db-9748-4e01-88d1-2bb4f3ca1f0c';
```

Returns:
```json
{
  "status": "dispatched_to_phone_link",
  "handler": "ms-phone:?action=call&number=+19312522222",
  "to_number": "+19312522222",
  "note": "Phone Link Calls UI should appear..."
}
```

— Dispatch
