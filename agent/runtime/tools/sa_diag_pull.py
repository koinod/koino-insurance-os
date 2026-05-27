"""sa_diag_pull — comprehensive diagnostic bundle.

Collects local state + remote audit/command history, uploads the
bundle to /api/agent/diagnostic-upload, and returns the diagnostic_id.

Payload: {} (no inputs required)

Returns:
  { ok, diagnostic_id, size_bytes }
"""
from __future__ import annotations
import json, os, sys, platform
from datetime import datetime, timedelta
from pathlib import Path
import requests as _r

REQUIRED_CAPS: list[str] = []

_REPFLOW_HOME = Path.home() / ".repflow"


def _read_json_safe(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _tail_lines(path: Path, n: int) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text.splitlines()[-n:]
    except Exception:
        return []


def _get_json(url: str, token: str, params: dict | None = None) -> object:
    try:
        r = _r.get(url, headers={"x-agent-token": token}, params=params, timeout=15)
        if r.status_code == 200:
            return r.json()
        return {"error": f"HTTP {r.status_code}", "body": r.text[:200]}
    except Exception as exc:
        return {"error": str(exc)}


def run(payload: dict, ctx: dict) -> dict:
    api_base = ctx["api_base"]
    token = ctx["token"]

    cap_raw = _read_json_safe(_REPFLOW_HOME / "agent" / "runtime" / "capability_cache.json")
    rl_raw = _read_json_safe(_REPFLOW_HOME / "agent" / "runtime" / "rate_limits.json")
    log_lines = _tail_lines(_REPFLOW_HOME / "agent.log", 50)
    install_log_lines = _tail_lines(_REPFLOW_HOME / "agent" / "install.log", 50)

    plat = {
        "system": platform.system(),
        "version": platform.version(),
        "python": sys.version,
        "pid": os.getpid(),
        "cwd": os.getcwd(),
    }

    audit_rows = _get_json(f"{api_base}/api/agent/audit", token, {"limit": 50})
    cmd_history = _get_json(f"{api_base}/api/agent/command-history", token, {"limit": 10})

    bundle = {
        "platform": plat,
        "capability_cache": cap_raw,
        "rate_limits": rl_raw,
        "log_lines": log_lines,
        "install_log_lines": install_log_lines,
        "audit_rows": audit_rows,
        "command_history": cmd_history,
    }

    size_bytes = len(json.dumps(bundle).encode("utf-8"))
    expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z"

    r = _r.post(
        f"{api_base}/api/agent/diagnostic-upload",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"bundle": bundle, "size_bytes": size_bytes, "expires_at": expires_at},
        timeout=30,
    )
    if r.status_code >= 300:
        return {
            "ok": False,
            "error": f"diagnostic-upload failed: HTTP {r.status_code}: {r.text[:300]}",
            "size_bytes": size_bytes,
        }
    data = r.json()
    return {
        "ok": True,
        "diagnostic_id": data.get("diagnostic_id") or data.get("id"),
        "size_bytes": size_bytes,
    }
