"""fathom_pull_notes — pull most recent Fathom meetings (with notes + summary).

Payload:
  {
    since: "2026-05-14T00:00:00Z" | null,   # default: last 7 days
    lead_external_id?: str                    # filter to this lead's email/phone
    limit?: int                               # default 25
  }

Returns:
  { meetings: [{ id, title, start_time, summary, notes_md, attendees, recording_url, ... }] }
"""
from __future__ import annotations
import datetime as _dt
import requests as _r

REQUIRED_CAPS = ["local.draft_email"]


def _exchange(api_base: str, token: str) -> dict:
    r = _r.post(
        f"{api_base}/api/agent/connector-exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": "fathom"}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"fathom exchange failed: HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def run(payload, ctx):
    creds = _exchange(ctx["api_base"], ctx["token"])
    key = creds.get("api_key") or creds.get("access_token")
    if not key:
        raise RuntimeError("fathom api_key missing")

    since = payload.get("since")
    if not since:
        since = (_dt.datetime.utcnow() - _dt.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    limit = int(payload.get("limit") or 25)

    params = {"start_after": since, "limit": limit}
    if payload.get("lead_external_id"):
        params["search"] = payload["lead_external_id"]

    r = _r.get("https://api.fathom.video/v1/meetings",
               headers={"authorization": f"Bearer {key}"},
               params=params, timeout=20)
    if r.status_code >= 300:
        raise RuntimeError(f"fathom list failed: HTTP {r.status_code}: {r.text[:300]}")
    raw = r.json()
    items = raw.get("items") or raw.get("meetings") or raw if isinstance(raw, list) else []

    out = []
    for m in (items or [])[:limit]:
        out.append({
            "id": m.get("id") or m.get("meeting_id"),
            "title": m.get("title") or m.get("name"),
            "start_time": m.get("start_time") or m.get("scheduled_start_time"),
            "duration_sec": m.get("duration") or m.get("duration_seconds"),
            "summary": m.get("summary") or (m.get("notes") or {}).get("summary"),
            "notes_md": m.get("notes_markdown") or (m.get("notes") or {}).get("markdown"),
            "attendees": [a.get("email") for a in (m.get("attendees") or []) if a.get("email")],
            "recording_url": m.get("recording_url") or m.get("share_url"),
        })
    return {"meetings": out, "since": since, "count": len(out)}
