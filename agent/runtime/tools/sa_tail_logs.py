"""sa_tail_logs — returns recent log lines and audit rows.

Reads local agent.log + install.log, then fetches recent audit rows
from /api/agent/audit.

Payload:
  { "lines": 50 }   # optional, default 50, capped at 200

Returns:
  {
    ok: true,
    log_lines: [...],
    install_log_lines: [...],
    audit_rows: [...],
  }
"""
from __future__ import annotations
from pathlib import Path
import requests as _r

REQUIRED_CAPS: list[str] = []

_REPFLOW_HOME = Path.home() / ".repflow"


def _tail_lines(path: Path, n: int) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text.splitlines()[-n:]
    except Exception:
        return []


def run(payload: dict, ctx: dict) -> dict:
    n = min(int(payload.get("lines") or 50), 200)

    log_lines = _tail_lines(_REPFLOW_HOME / "agent.log", n)
    install_log_lines = _tail_lines(_REPFLOW_HOME / "agent" / "install.log", n)

    audit_rows: list = []
    try:
        r = _r.get(
            f"{ctx['api_base']}/api/agent/audit",
            headers={"x-agent-token": ctx["token"]},
            params={"limit": n},
            timeout=15,
        )
        if r.status_code == 200:
            data = r.json()
            audit_rows = data if isinstance(data, list) else data.get("rows", [])
    except Exception as exc:
        audit_rows = [{"error": str(exc)}]

    return {
        "ok": True,
        "log_lines": log_lines,
        "install_log_lines": install_log_lines,
        "audit_rows": audit_rows,
    }
