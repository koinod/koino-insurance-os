"""sa_snapshot_state — captures the agent's local state snapshot.

No credentials required. Reads local cache/log files and collects
platform metadata. Sanitizes anything that looks like a token/key
(values matching [A-Za-z0-9]{40,} are redacted).

Payload: {} (no inputs required)

Returns:
  {
    platform: { system, version, python, pid, cwd },
    capability_cache: { keys: [...], sizes: {...} },
    rate_limits: { ... },
    last_log_lines: [...],
  }
"""
from __future__ import annotations
import json, os, re, sys, platform
from pathlib import Path

REQUIRED_CAPS: list[str] = []

_TOKEN_RE = re.compile(r"[A-Za-z0-9]{40,}")
_REPFLOW_HOME = Path.home() / ".repflow"


def _redact(value: object) -> object:
    """Recursively redact token-like strings in dicts/lists/strings."""
    if isinstance(value, str):
        return _TOKEN_RE.sub("[REDACTED]", value)
    if isinstance(value, dict):
        return {k: _redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _read_json_safe(path: Path) -> dict | None:
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


def run(payload: dict, ctx: dict) -> dict:
    # --- platform info ---
    plat = {
        "system": platform.system(),
        "version": platform.version(),
        "python": sys.version,
        "pid": os.getpid(),
        "cwd": os.getcwd(),
    }

    # --- capability_cache ---
    cap_path = _REPFLOW_HOME / "agent" / "runtime" / "capability_cache.json"
    cap_raw = _read_json_safe(cap_path)
    if cap_raw is not None:
        cap_info = {
            "keys": list(cap_raw.keys()) if isinstance(cap_raw, dict) else [],
            "sizes": {
                k: len(json.dumps(v)) for k, v in cap_raw.items()
            } if isinstance(cap_raw, dict) else {},
        }
    else:
        cap_info = None

    # --- rate_limits ---
    rl_path = _REPFLOW_HOME / "agent" / "runtime" / "rate_limits.json"
    rl_raw = _read_json_safe(rl_path)
    rate_limits = _redact(rl_raw) if rl_raw is not None else None

    # --- last 50 log lines ---
    log_path = _REPFLOW_HOME / "agent.log"
    log_lines = _tail_lines(log_path, 50)

    return {
        "ok": True,
        "platform": plat,
        "capability_cache": cap_info,
        "rate_limits": rate_limits,
        "last_log_lines": log_lines,
    }
