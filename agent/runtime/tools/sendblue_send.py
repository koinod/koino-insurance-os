"""sendblue_send — outbound iMessage via SendBlue API.

Payload:
  {
    to_number: "+15551234567",
    body: "Hey Dan, following up on our chat...",
    lead_id?: "uuid",
    auto_send: false   # default false → posts confirmation_request first
  }

Returns:
  { message_uuid, status, sent_at }   on success
  { status: "awaiting_confirmation", confirmation_id }  if auto_send=false
"""
from __future__ import annotations
import requests as _r

REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"


def _exchange(api_base: str, token: str) -> dict:
    r = _r.post(
        f"{api_base}/api/agent/connector-exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": "sendblue"}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"sendblue exchange failed: HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def run(payload, ctx):
    to = payload.get("to_number")
    body = payload.get("body")
    if not to or not body:
        raise ValueError("to_number + body required")

    auto = bool(payload.get("auto_send"))
    if not auto:
        # High-risk: real outbound to a real lead. Post confirmation, return.
        r = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",
                "description": f"SendBlue to {to}: {body[:120]}",
                "args_redacted": {"channel": "sendblue", "to_masked": to[:5] + "***", "len": len(body)},
                "channel": "any",
            }, timeout=8,
        )
        if r.status_code != 200:
            return {"status": "error", "error": f"confirmation request failed HTTP {r.status_code}"}
        return {"status": "awaiting_confirmation", "confirmation_id": r.json().get("confirmation_id")}

    creds = _exchange(ctx["api_base"], ctx["token"])
    key_id = (creds.get("api_key_id") or "")
    secret = (creds.get("api_key") or creds.get("access_token") or "")
    sender = (creds.get("sender_phone") or "")
    if not all([key_id, secret, sender]):
        raise RuntimeError("sendblue creds missing api_key_id / api_key / sender_phone")

    r = _r.post(
        "https://api.sendblue.co/api/send-message",
        headers={
            "sb-api-key-id": key_id,
            "sb-api-secret-key": secret,
            "content-type": "application/json",
        },
        json={"number": to, "content": body, "from_number": sender},
        timeout=15,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"sendblue send failed: HTTP {r.status_code}: {r.text[:300]}")
    data = r.json()
    return {
        "message_uuid": data.get("message_uuid"),
        "status": data.get("status") or "queued",
        "to_number": to,
        "from_number": sender,
    }
