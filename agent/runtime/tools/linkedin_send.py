"""linkedin_send — outbound LinkedIn DM via Voyager API (cookie-based).

⚠ LinkedIn doesn't sanction this. Use sparingly. Cookies expire ~weekly.

Payload:
  {
    profile_urn: "urn:li:fsd_profile:ACoAA...",   # OR profile_url
    profile_url: "https://linkedin.com/in/<slug>",
    body:        "Hey there, ...",
    auto_send:   false                             # default: confirmation
  }
"""
from __future__ import annotations
import json, re
import requests as _r

REQUIRED_CAPS = ["local.browser_general"]
RATE_BUCKET = "browser"


def _exchange(api_base: str, token: str) -> dict:
    r = _r.post(
        f"{api_base}/api/agent/connector-exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": "linkedin"}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"linkedin exchange failed: HTTP {r.status_code}")
    return r.json()


def _resolve_profile_urn(li_at: str, csrf: str, url: str) -> str | None:
    """Best-effort: scrape the profile page and pull the dash_profile id.
    LI's HTML changes often; this is brittle by design."""
    page = _r.get(url, headers={
        "cookie": f"li_at={li_at}; JSESSIONID={csrf}",
        "user-agent": "Mozilla/5.0",
    }, timeout=15)
    if page.status_code != 200:
        return None
    m = re.search(r'urn:li:fsd_profile:[A-Za-z0-9_\-]+', page.text)
    return m.group(0) if m else None


def run(payload, ctx):
    body = payload.get("body")
    if not body: raise ValueError("body required")
    auto = bool(payload.get("auto_send"))

    if not auto:
        # Always confirm — LI is high-risk
        r = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",  # treat as high-risk for routing
                "description": f"LinkedIn DM: {body[:120]}",
                "args_redacted": {"channel": "linkedin", "to": payload.get("profile_url"), "len": len(body)},
                "channel": "any",
            }, timeout=8,
        )
        if r.status_code != 200:
            return {"status": "error", "error": f"confirmation request failed HTTP {r.status_code}"}
        return {"status": "awaiting_confirmation", "confirmation_id": r.json().get("confirmation_id")}

    creds = _exchange(ctx["api_base"], ctx["token"])
    li_at = creds.get("access_token") or creds.get("api_key")
    csrf  = (creds.get("csrf_token")) or (creds.get("account_metadata") or {}).get("csrf_token") or ""
    if not li_at:
        raise RuntimeError("linkedin li_at cookie missing")

    profile_urn = payload.get("profile_urn")
    if not profile_urn:
        url = payload.get("profile_url")
        if not url: raise ValueError("profile_urn or profile_url required")
        profile_urn = _resolve_profile_urn(li_at, csrf, url)
        if not profile_urn:
            raise RuntimeError("could not resolve profile URN")

    headers = {
        "cookie": f"li_at={li_at}" + (f"; JSESSIONID={csrf}" if csrf else ""),
        "csrf-token": csrf.replace('"',''),
        "x-restli-protocol-version": "2.0.0",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0",
    }
    msg_body = {
        "message": {
            "body": body,
            "renderContentUnions": [],
            "conversationCreate": {
                "eventCreate": {
                    "value": {
                        "com.linkedin.voyager.messaging.create.MessageCreate": {
                            "attributedBody": {"text": body, "attributes": []},
                            "attachments": [],
                        }
                    }
                },
                "subtype": "MEMBER_TO_MEMBER",
                "recipients": [profile_urn],
            },
        },
    }
    url = "https://www.linkedin.com/voyager/api/messaging/conversations?action=create"
    r = _r.post(url, headers=headers, data=json.dumps(msg_body), timeout=20)
    if r.status_code >= 300:
        raise RuntimeError(f"linkedin send failed: HTTP {r.status_code}: {r.text[:300]}")
    return {"status": "sent", "profile_urn": profile_urn, "response": r.json() if r.text else None}
