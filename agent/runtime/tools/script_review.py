"""script_review — autonomous: critique a sales script using local LLM.

Payload: { script_text, persona_hint?, focus?: 'objections'|'pacing'|'compliance'|'all' }
Returns: { critique_md, top_3_fixes }
"""
from __future__ import annotations
import requests as _r

REQUIRED_CAPS = ["local.draft_email"]    # reuse drafting cap; reading-only role still allowed


def run(payload, ctx):
    script = payload.get("script_text") or ""
    if not script.strip(): raise ValueError("script_text required")
    focus = payload.get("focus") or "all"
    persona = payload.get("persona_hint") or ""

    prompt = f"""You're a senior sales coach for life & health insurance agents.
Critique this script. Focus: {focus}. {('Voice context: ' + persona) if persona else ''}

SCRIPT:
{script}

Return JSON-ish: 'critique_md' = bullet list of issues, then 'top_3_fixes' = 3 most impactful changes (one line each).
"""
    cfg = ctx.get("cfg") or {}
    model = cfg.get("smart_model") or cfg.get("default_model") or "qwen2.5:1.5b"
    r = _r.post((ctx.get("cfg",{}).get("ollama_url") or "http://127.0.0.1:11434") + "/api/generate",
                json={"model": model, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.3, "num_predict": 600}}, timeout=90)
    if r.status_code != 200:
        raise RuntimeError(f"ollama generate failed: HTTP {r.status_code}")
    text = (r.json().get("response") or "").strip()
    return {"model": model, "critique_md": text}
