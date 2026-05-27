"""sa_replay_failed — re-runs the most recently failed command.

Fetches the last 100 audit rows, finds the most recent failure
(status == "error" or result.error present), imports that tool module
from agent/runtime/tools/{kind}.py, and calls run(payload, ctx) with
full traceback capture.

Payload: {} (no inputs required)

Returns:
  {
    ok: true,
    replayed_kind: "...",
    result: { ... },
    traceback: null | "...",
  }
  or { ok: false, error: "no_failed_command_found" }
"""
from __future__ import annotations
import importlib.util, os, sys, traceback as _tb
from pathlib import Path
import requests as _r

REQUIRED_CAPS: list[str] = []

_TOOLS_DIR = Path(__file__).parent


def _find_most_recent_failure(rows: list) -> dict | None:
    for row in rows:
        status = row.get("status") or ""
        result = row.get("result") or {}
        if status == "error" or result.get("error"):
            return row
    return None


def _load_tool(kind: str):
    """Import and return the tool module for the given kind, or None."""
    mod_path = _TOOLS_DIR / f"{kind}.py"
    if not mod_path.exists():
        return None
    spec = importlib.util.spec_from_file_location(f"tools.{kind}", str(mod_path))
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def run(payload: dict, ctx: dict) -> dict:
    api_base = ctx["api_base"]
    token = ctx["token"]

    # Fetch recent audit rows
    try:
        r = _r.get(
            f"{api_base}/api/agent/audit",
            headers={"x-agent-token": token},
            params={"limit": 100},
            timeout=15,
        )
        if r.status_code != 200:
            return {
                "ok": False,
                "error": f"audit fetch failed: HTTP {r.status_code}: {r.text[:200]}",
            }
        raw = r.json()
        rows: list = raw if isinstance(raw, list) else raw.get("rows", [])
    except Exception as exc:
        return {"ok": False, "error": f"audit fetch error: {exc}"}

    failed_row = _find_most_recent_failure(rows)
    if failed_row is None:
        return {"ok": False, "error": "no_failed_command_found"}

    kind: str = failed_row.get("kind") or ""
    original_payload: dict = failed_row.get("payload") or {}

    if not kind:
        return {"ok": False, "error": "failed_row_has_no_kind"}

    mod = _load_tool(kind)
    if mod is None:
        return {
            "ok": False,
            "error": f"tool_module_not_found: {kind}",
            "replayed_kind": kind,
        }

    result: object = None
    tb_str: str | None = None
    try:
        result = mod.run(original_payload, ctx)
    except Exception:
        tb_str = _tb.format_exc()
        result = {"ok": False, "error": "replay_raised_exception"}

    return {
        "ok": True,
        "replayed_kind": kind,
        "result": result,
        "traceback": tb_str,
    }
