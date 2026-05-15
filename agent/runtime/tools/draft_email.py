"""draft_email — generate an email draft (Ollama local LLM)."""
from __future__ import annotations
import json, time, uuid
from pathlib import Path
import requests as _r

REQUIRED_CAPS = ["local.draft_email"]
RATE_BUCKET = "draft"

WORKSPACE = Path.home() / ".repflow" / "agent" / "workspace" / "drafts"
PROMPT = """Write a {intent} email for an insurance agent.
Tone: warm, professional, concise. Subject + body. No sign-off block; we add it.
{persona}

Lead: {lead_name}
Context: {context}
Last message: {last_message}

Format:
SUBJECT: ...
BODY:
...
"""


def run(payload, ctx):
    lead = payload.get("lead") or {}
    intent = payload.get("intent") or "follow_up"
    persona = payload.get("persona_hint") or ""
    cfg = ctx.get("cfg") or {}
    model = cfg.get("default_model") or "qwen2.5:3b"

    prompt = PROMPT.format(intent=intent,
                           persona=f"Voice: {persona}" if persona else "",
                           lead_name=lead.get("name") or "Lead",
                           context=lead.get("context") or "(none)",
                           last_message=lead.get("last_message") or "(none)")

    r = _r.post((ctx.get("cfg",{}).get("ollama_url") or "http://127.0.0.1:11434") + "/api/generate",
                json={"model": model, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.5, "num_predict": 350}},
                timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"ollama generate failed: HTTP {r.status_code}")
    text = (r.json().get("response") or "").strip()

    subject, body = "", text
    if text.upper().startswith("SUBJECT:"):
        first, _, rest = text.partition("\n")
        subject = first.split(":", 1)[1].strip()
        body = rest.lstrip()
        if body.upper().startswith("BODY:"):
            body = body.split(":", 1)[1].lstrip()

    WORKSPACE.mkdir(parents=True, exist_ok=True)
    did = str(uuid.uuid4())
    (WORKSPACE / f"{did}.json").write_text(json.dumps({
        "id": did, "kind": "email", "intent": intent, "lead": lead,
        "subject": subject, "body": body, "model": model, "created_at": time.time(),
    }, indent=2))

    return {"draft_id": did, "subject": subject, "body": body, "model": model}
