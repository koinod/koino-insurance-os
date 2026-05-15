"""linkedin_inbox_scan — pull unread / recent LinkedIn DMs via Voyager.

Payload: { since_iso?: str, limit?: int }
Returns: { conversations: [{ id, last_msg_at, last_msg_preview, sender_urn, sender_name, unread }] }
"""
from __future__ import annotations
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


def run(payload, ctx):
    creds = _exchange(ctx["api_base"], ctx["token"])
    li_at = creds.get("access_token") or creds.get("api_key")
    csrf  = (creds.get("csrf_token")) or (creds.get("account_metadata") or {}).get("csrf_token") or ""
    if not li_at: raise RuntimeError("linkedin li_at missing")

    headers = {
        "cookie": f"li_at={li_at}" + (f"; JSESSIONID={csrf}" if csrf else ""),
        "csrf-token": csrf.replace('"',''),
        "x-restli-protocol-version": "2.0.0",
        "user-agent": "Mozilla/5.0",
    }
    limit = int(payload.get("limit") or 20)
    url = f"https://www.linkedin.com/voyager/api/messaging/conversations?keyVersion=LEGACY_INBOX&q=hostUrnAndCriteria&start=0&count={limit}"
    r = _r.get(url, headers=headers, timeout=20)
    if r.status_code >= 300:
        raise RuntimeError(f"linkedin inbox failed HTTP {r.status_code}")
    j = r.json()
    convs = []
    for c in j.get("elements", []) or []:
        last = ((c.get("events") or [{}])[0]).get("eventContent", {})
        text = last.get("com.linkedin.voyager.messaging.event.MessageEvent", {}).get("attributedBody", {}).get("text", "")
        convs.append({
            "id": c.get("entityUrn"),
            "last_msg_preview": text[:140],
            "unread": (c.get("readReceipts") or {}).get("status") == "unread",
        })
    return {"conversations": convs, "count": len(convs)}
