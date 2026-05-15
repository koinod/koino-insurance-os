"""meta_dm_send — send DM via Meta Graph API.
Works for both Facebook Pages (PSID recipient) and Instagram Business
accounts (IGSID recipient). Requires user-scoped page access token in
connector_vault.

Payload:
  { recipient_id: "<psid|igsid>", body: "...", page_id?: "<pageId>",
    auto_send: false }
"""
from __future__ import annotations
import requests as _r

REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"


def _exchange(api_base: str, token: str, provider: str) -> dict:
    r = _r.post(
        f"{api_base}/api/agent/connector-exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": provider}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"{provider} exchange failed HTTP {r.status_code}")
    return r.json()


def run(payload, ctx):
    body = payload.get("body")
    rid  = payload.get("recipient_id")
    if not (body and rid): raise ValueError("body + recipient_id required")
    auto = bool(payload.get("auto_send"))

    if not auto:
        r = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",
                "description": f"Meta DM to {rid}: {body[:120]}",
                "args_redacted": {"channel": "meta_dm", "to": rid, "len": len(body)},
                "channel": "any",
            }, timeout=8,
        )
        if r.status_code != 200:
            return {"status": "error", "error": f"confirmation request failed HTTP {r.status_code}"}
        return {"status": "awaiting_confirmation", "confirmation_id": r.json().get("confirmation_id")}

    # Try meta_dm provider first, fall back to ig_business / fb_ads.
    creds = None; provider = None
    for p in ("meta_dm", "ig_business", "fb_ads"):
        try:
            creds = _exchange(ctx["api_base"], ctx["token"], p)
            provider = p
            break
        except Exception:
            continue
    if not creds: raise RuntimeError("no meta connector available (meta_dm/ig_business/fb_ads)")

    page_id = payload.get("page_id") or ((creds.get("page_ids") or [None])[0])
    if not page_id: raise ValueError("page_id required (or set in connector metadata)")
    token = creds.get("access_token") or creds.get("api_key")

    url = f"https://graph.facebook.com/v18.0/{page_id}/messages"
    r = _r.post(url, params={"access_token": token},
                json={"recipient": {"id": rid},
                      "message": {"text": body},
                      "messaging_type": "MESSAGE_TAG",
                      "tag": "ACCOUNT_UPDATE"},
                timeout=15)
    if r.status_code >= 300:
        raise RuntimeError(f"meta dm send failed HTTP {r.status_code}: {r.text[:300]}")
    return {"status": "sent", "provider": provider, "page_id": page_id, "response": r.json()}
