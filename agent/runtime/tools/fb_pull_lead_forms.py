"""fb_pull_lead_forms — pull recent leadgen submissions from FB Lead Ads.

Payload: { ad_account_id?: str, since_iso?: str, limit?: int }
Returns: { leads: [{ id, created_time, form_id, ad_id, field_data: {...}, ... }] }
"""
from __future__ import annotations
import datetime as _dt
import requests as _r

REQUIRED_CAPS = ["db.read_own_pipeline"]


def _exchange(api_base: str, token: str) -> dict:
    r = _r.post(
        f"{api_base}/api/agent/connector-exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": "fb_ads"}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"fb_ads exchange failed HTTP {r.status_code}")
    return r.json()


def run(payload, ctx):
    creds = _exchange(ctx["api_base"], ctx["token"])
    token = creds.get("access_token") or creds.get("api_key")
    if not token: raise RuntimeError("fb access_token missing")

    ad_account = payload.get("ad_account_id") or ((creds.get("ad_accounts") or [None])[0])
    if not ad_account: raise ValueError("ad_account_id required (or set in connector metadata)")
    since = payload.get("since_iso")
    if not since:
        since = (_dt.datetime.utcnow() - _dt.timedelta(days=7)).isoformat() + "Z"
    limit = int(payload.get("limit") or 50)

    url = f"https://graph.facebook.com/v18.0/{ad_account}/leadgen"
    params = {
        "access_token": token,
        "fields": "id,created_time,form_id,ad_id,campaign_id,field_data",
        "limit": limit,
        "filtering": f'[{{"field":"time_created","operator":"GREATER_THAN","value":"{since}"}}]',
    }
    r = _r.get(url, params=params, timeout=20)
    if r.status_code >= 300:
        # Fall back to per-form leadgen if /leadgen on ad account isn't allowed
        return {"leads": [], "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    data = r.json().get("data", [])
    out = []
    for lead in data:
        fd = {f.get("name"): (f.get("values") or [None])[0] for f in (lead.get("field_data") or [])}
        out.append({
            "id": lead.get("id"),
            "created_time": lead.get("created_time"),
            "form_id": lead.get("form_id"),
            "ad_id": lead.get("ad_id"),
            "campaign_id": lead.get("campaign_id"),
            "fields": fd,
        })
    return {"leads": out, "count": len(out), "since": since}
