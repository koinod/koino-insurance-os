"""sa_inspect_db — run a read-only SQL query via the agent API.

LOCAL regex guard runs BEFORE any HTTP request: if the SQL contains a
write/DDL keyword the tool returns an error immediately, nothing is
sent to the server.

Payload:
  { "sql": "SELECT count(*) FROM public.reps" }

Returns:
  { ok, rows: [...], row_count: N }   (row shape mirrors /api/agent/inspect-db)
"""
from __future__ import annotations
import re
import requests as _r

REQUIRED_CAPS: list[str] = []

# Guard: reject any SQL that contains a write or DDL keyword.
# Applied locally before any network call.
_WRITE_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|EXECUTE)\b",
    re.IGNORECASE,
)


def run(payload: dict, ctx: dict) -> dict:
    sql = (payload.get("sql") or "").strip()
    if not sql:
        return {"ok": False, "error": "sql_required"}

    # Local guard — no network call if this fires
    if _WRITE_RE.search(sql):
        return {"ok": False, "error": "read_only_query_required"}

    r = _r.post(
        f"{ctx['api_base']}/api/agent/inspect-db",
        headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
        json={"sql": sql},
        timeout=30,
    )
    if r.status_code >= 300:
        return {
            "ok": False,
            "error": f"inspect-db failed: HTTP {r.status_code}: {r.text[:300]}",
        }
    data = r.json()
    # Ensure ok flag is present
    if "ok" not in data:
        data["ok"] = True
    return data
