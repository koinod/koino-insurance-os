"""twilio_dial — place an outbound call via Twilio Programmable Voice.

Auth model: connector_vault holds the user's Twilio credentials. The agent
calls /api/agent/connector/exchange to swap its agent_token for a
short-lived per-request bearer that pulls the decrypted token. Token never
touches disk.

Payload:
  {
    to_number:   "+15551234567",
    from_number: "+15559876543",   # one of user's Twilio numbers; if absent, picks first
    lead_id:     "uuid",
    record:      true,             # always-record on pickup is the default
    state_match: true,             # if true, picks a from_number with same area code as to_number
  }

Returns:
  { call_sid, status, from_number, to_number, recording_will_start_on_pickup }
"""
from __future__ import annotations
import os, time
import requests as _r

REQUIRED_CAPS = ["local.dial_twilio"]
RATE_BUCKET = "dial"


def _exchange_token(api_base: str, token: str, provider: str) -> dict:
    """Hit /api/agent/connector/exchange to get the per-call decrypted creds.
    Returns {api_key, api_secret, account_sid, ...} or raises."""
    r = _r.post(
        f"{api_base}/api/agent/connector/exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": provider}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"connector exchange failed: HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def _pick_from_number(numbers: list[str], to_number: str, prefer_match: bool) -> str:
    if not numbers:
        raise RuntimeError("no Twilio phone numbers in connector_vault.account_metadata")
    if not prefer_match or not to_number.startswith("+1") or len(to_number) < 5:
        return numbers[0]
    target_area = to_number[2:5]
    for n in numbers:
        if n.startswith("+1") and len(n) >= 5 and n[2:5] == target_area:
            return n
    return numbers[0]


def run(payload: dict, ctx: dict) -> dict:
    to_number = payload.get("to_number")
    if not to_number:
        raise ValueError("to_number required")
    record = payload.get("record", True)
    state_match = payload.get("state_match", True)

    creds = _exchange_token(ctx["api_base"], ctx["token"], "twilio")
    sid     = creds.get("account_sid")
    api_key = creds.get("api_key") or sid
    api_sec = creds.get("api_secret") or creds.get("auth_token")
    numbers = creds.get("phone_numbers") or []
    if not all([sid, api_sec]):
        raise RuntimeError("twilio creds missing account_sid / auth_token")

    from_number = payload.get("from_number") or _pick_from_number(numbers, to_number, state_match)

    # Twilio create-call REST. Use the agent's own webhook URL so post-call
    # status + recording lands back on Repflow.
    cb_base = ctx["api_base"]
    twiml_url = f"{cb_base}/api/twilio-twiml?lead_id={payload.get('lead_id') or ''}"
    body = {
        "To": to_number,
        "From": from_number,
        "Url": twiml_url,
        "StatusCallback": f"{cb_base}/api/twilio-app",
        "StatusCallbackEvent": "initiated ringing answered completed".split(),
        "StatusCallbackMethod": "POST",
    }
    if record:
        body["Record"] = "true"
        body["RecordingStatusCallback"] = f"{cb_base}/api/twilio-recording"
        body["RecordingStatusCallbackEvent"] = "in-progress completed absent".split()
        body["Trim"] = "trim-silence"

    r = _r.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json",
        auth=(api_key, api_sec),
        data=body,
        timeout=10,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"twilio call failed: HTTP {r.status_code}: {r.text[:300]}")
    data = r.json()
    return {
        "call_sid": data.get("sid"),
        "status": data.get("status"),
        "from_number": from_number,
        "to_number": to_number,
        "recording_will_start_on_pickup": bool(record),
    }
