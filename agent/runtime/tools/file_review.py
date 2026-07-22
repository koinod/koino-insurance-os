"""file_review — autonomous: read a file from workspace/ and summarize."""
from __future__ import annotations
from pathlib import Path
import requests as _r

REQUIRED_CAPS = ["local.draft_email"]
WORKSPACE = Path.home() / ".repflow" / "agent" / "workspace"


def run(payload, ctx):
    rel = payload.get("path")
    if not rel: raise ValueError("path required (relative to workspace/)")
    target = (WORKSPACE / rel).resolve()
    # Defense in depth: never read outside workspace.
    if not str(target).startswith(str(WORKSPACE.resolve())):
        raise ValueError("path escapes workspace")
    if not target.exists():
        raise FileNotFoundError(rel)
    text = target.read_text(errors="replace")[:20000]

    cfg = ctx.get("cfg") or {}
    model = cfg.get("smart_model") or cfg.get("default_model") or "qwen2.5:1.5b"
    r = _r.post((ctx.get("cfg",{}).get("ollama_url") or "http://127.0.0.1:11434") + "/api/generate",
                json={"model": model, "prompt": f"Summarize this file in 3-5 bullets, then list any action items:\n\n{text}",
                      "stream": False, "options": {"num_predict": 600}}, timeout=90)
    if r.status_code != 200:
        raise RuntimeError(f"ollama failed HTTP {r.status_code}")
    return {"path": rel, "summary": (r.json().get("response") or "").strip(), "model": model}
