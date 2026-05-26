# Dialer Fix — 2026-05-26

## Root cause of the hang

`FloorDialerCockpit.startSession()` in `page-floor.jsx` called
`/api/dial/start`, which proxies to a `POWER_DIALER_URL` worker
(a separate microservice not yet deployed). Two failure modes:

1. **`POWER_DIALER_URL` not set** → edge fn returns 503 immediately with
   `{ error: "power_dialer_unconfigured" }`. The toast would fire but the
   UX was confusing ("Set POWER_DIALER_URL in Vercel env").

2. **`POWER_DIALER_URL` set but worker dead** → edge fn hangs waiting for
   the worker to respond. Vercel edge fn timeout is ~25s. Client had
   **no AbortController** so the UI showed "Starting…" for the full
   25 seconds with no feedback — perceived as "hung forever."

Neither path fell back to the existing `AutoDialBar` + `autodial:start`
queue system, which is fully functional without any worker.

## What was changed

### `page-floor.jsx` (v104 → v105)
- `FloorDialerCockpit.startSession()`: added 10s `AbortController` timeout;
  on 503/`power_dialer_unconfigured` falls back to dispatching
  `autodial:start` with the floor's ranked queue (AutoDialBar takes over);
  `console.error` + toast at every failure point.
- Added `dialProvider` state (session-level override, seeds from
  `window.__agentSettings.default_dial_provider`).
- Added `DialProviderChips` component: 4-option chip selector above the
  Start button. Shows OS-detected "recommended for you" badge.

### `page-platform.jsx` (v75 → v76)
- `window.repflowCall` now branches on
  `window.__dialProviderSession || window.__agentSettings.default_dial_provider`:
  - `twilio` → existing `/api/dial/outbound` REST bridge (unchanged)
  - `phone_link` → `window.rba_post_command({ kind: "twilio_dial", payload: { via: "phone_link" } })`
    with fallback to Twilio if RBA agent not running
  - `bluetooth_phone` → toast + fall back to Twilio (agent tool not yet wired)
  - `sendblue` → hard stop "SendBlue is SMS, not voice"

### `page-extras.jsx` (v102 → v103)
- `AgentSettingsEditor`: replaces the simple `<Shared.Select>` for
  `default_dial_provider` with `DialProviderSelector` — a card group with
  all 4 options, OS-detected "recommended for you" badge, experimental
  warning on SendBlue.
- Both `load` and `save` publish `window.__agentSettings` and dispatch
  `agent_settings:loaded` so the Floor cockpit's chip selector seeds
  correctly on page load.

## What is still stubbed

- **`bluetooth_phone` agent tool**: The macOS Bluetooth / FaceTime
  Continuity dial path in `window.repflowCall` falls back to Twilio with a
  toast. The agent-side tool (`bluetooth_phone_dial.py`) would need to be
  built on the RBA agent to close the loop.
- **Power Dialer worker** (`POWER_DIALER_URL`): The multi-line power
  dialer (parallel legs, LiveKit audio, AI voicemail drop) still requires
  a deployed worker. When set up, the 503 fallback path disables and the
  full session UI activates.
- **`phone_link` end-to-end**: Client-side routing is wired; the RBA
  agent runtime needs `phone_link_dial.py` to handle the dispatched command.

## Verification screenshots
See `audits/screenshots/dialer-fix/`.
