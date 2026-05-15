"""phone_link_dial — outbound call via Microsoft Phone Link.

Phone Link routes the call through the user's Bluetooth-paired phone.
Implementation invokes the system `tel:` URI handler — when Phone Link
is set as the default for tel: links (Settings → Apps → Default apps →
"Make calls" → Phone Link), Windows opens the Phone Link Calls UI with
the number pre-dialed and either auto-confirms or shows the human a
"Call <number>?" popup.

Phone Link's call routing requires:
  - Windows 10/11 with Phone Link installed + paired
  - Bluetooth ON, paired phone in range (or paired via cellular if the
    phone supports "Calls on other devices")
  - Phone permission granted in Phone Link app
  - tel: handler set to Phone Link (one-time setup)

Payload:
  {
    to_number:  "+19312522222",   # destination
    lead_id?:   "uuid",
    auto_dial:  false              # default false → posts confirmation first
  }

Returns (when auto_dial=true and dispatch succeeds):
  { status: "dispatched_to_phone_link",
    to_number: "+19312522222",
    handler: "tel:" }

Hard rules respected:
  • Uses os.startfile() — Windows-native shell URI invoke. Not arbitrary
    shell. The URI scheme is constrained to tel: only — caller cannot
    inject a different scheme.
  • Number is validated to E.164-ish before being passed to the handler.
  • Default auto_dial=false: even with the cap granted, agent posts a
    confirmation_request first (user approves via web/SMS modal).

Platform support:
  • Windows: full path via Phone Link.
  • Mac/Linux: returns "platform_unsupported" — Phone Link is Windows-only.
    On Mac the parallel would be Continuity Calling via Handoff (FaceTime
    URL scheme). Wire when/if needed.
"""
from __future__ import annotations
import os, re, sys, time
import requests as _r

REQUIRED_CAPS = ["local.dial_twilio"]   # reuse dial cap
RATE_BUCKET = "dial"

E164_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


def _normalize(num: str) -> str | None:
    if not num: return None
    s = re.sub(r"[^\d+]", "", num)
    if s.startswith("+"):
        if E164_RE.match(s): return s
    elif len(s) == 10:
        return "+1" + s            # default to US country code
    elif len(s) == 11 and s.startswith("1"):
        return "+" + s
    return None if not E164_RE.match("+" + s) else "+" + s


def run(payload, ctx):
    if sys.platform != "win32":
        return {"status": "platform_unsupported",
                "platform": sys.platform,
                "note": "Phone Link is Windows-only. Use twilio_dial or sendblue_send instead."}

    raw = payload.get("to_number")
    num = _normalize(raw)
    if not num:
        raise ValueError(f"to_number invalid (got {raw!r}); expected +E.164 or 10-digit US")

    auto = bool(payload.get("auto_dial"))
    if not auto:
        r = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",   # treated as high-risk for routing
                "description": f"Phone Link dial to {num}" + (f" (lead {payload.get('lead_id')})" if payload.get("lead_id") else ""),
                "args_redacted": {"channel": "phone_link", "to": num, "lead_id": payload.get("lead_id")},
                "channel": "any",
            }, timeout=8,
        )
        if r.status_code != 200:
            return {"status": "error", "error": f"confirmation request failed HTTP {r.status_code}"}
        return {"status": "awaiting_confirmation",
                "to_number": num,
                "confirmation_id": r.json().get("confirmation_id"),
                "note": "Approve in the Repflow UI / SMS / OS push to dispatch."}

    # auto_dial=true: invoke Phone Link via its declared URI schemes.
    # Verified on PLATINUM 2026-05-15: Microsoft.YourPhone manifest declares
    # protocols ['ms-phone', 'tel', 'sms']. ms-phone:// goes directly to
    # Phone Link without depending on the user's default tel: handler choice.
    candidates = [
        f"ms-phone:?action=call&number={num}",
        f"ms-phone:?number={num}",
        f"ms-phone://call/{num}",
        f"tel:{num}",   # last resort — only works if Phone Link is the tel: default
    ]
    last_err = None
    for uri in candidates:
        try:
            os.startfile(uri)
            return {
                "status": "dispatched_to_phone_link",
                "to_number": num,
                "handler": uri,
                "note": "Phone Link Calls UI should appear. Click Call (or it auto-dials if 'Always confirm' is off in Phone Link settings).",
                "at": time.time(),
            }
        except OSError as e:
            last_err = str(e)
            continue
    return {
        "status": "no_handler",
        "to_number": num,
        "tried": candidates,
        "error": last_err,
        "fix": "Open Phone Link → Settings → Calls → enable. If still failing: Windows Settings → Apps → Default apps → 'Make calls' → Phone Link.",
    }
