"""sa_export_local_state — dumps local cache files as a clean export.

Reads capability_cache.json, rate_limits.json, connector_cache.json
(redacted), and lists all files under ~/.repflow/ with their sizes.

Payload: {} (no inputs required)

Returns:
  {
    ok: true,
    capability_cache: { ... },
    rate_limits: { ... },
    connector_cache_redacted: { ... },
    file_tree: [ { path: "...", size_bytes: N }, ... ],
  }
"""
from __future__ import annotations
import json, re
from pathlib import Path

REQUIRED_CAPS: list[str] = []

_REPFLOW_HOME = Path.home() / ".repflow"
_TOKEN_RE = re.compile(r"[A-Za-z0-9]{40,}")


def _redact(value: object) -> object:
    """Recursively redact token-like strings."""
    if isinstance(value, str):
        return _TOKEN_RE.sub("[REDACTED]", value)
    if isinstance(value, dict):
        return {k: _redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _read_json_safe(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _file_tree(root: Path) -> list[dict]:
    entries: list[dict] = []
    try:
        for p in sorted(root.rglob("*")):
            if p.is_file():
                try:
                    size = p.stat().st_size
                except OSError:
                    size = -1
                entries.append({"path": str(p), "size_bytes": size})
    except Exception:
        pass
    return entries


def run(payload: dict, ctx: dict) -> dict:
    runtime_dir = _REPFLOW_HOME / "agent" / "runtime"

    cap_raw = _read_json_safe(runtime_dir / "capability_cache.json")
    rl_raw = _read_json_safe(runtime_dir / "rate_limits.json")

    conn_raw = _read_json_safe(runtime_dir / "connector_cache.json")
    conn_redacted = _redact(conn_raw) if conn_raw is not None else None

    file_tree = _file_tree(_REPFLOW_HOME)

    return {
        "ok": True,
        "capability_cache": cap_raw,
        "rate_limits": rl_raw,
        "connector_cache_redacted": conn_redacted,
        "file_tree": file_tree,
    }
