"""draft_sms — generate an SMS draft via local LLM, persist to workspace
for human review (or auto-send via twilio_send_sms / sendblue_send if the
caller passes auto_send=true AND the role's confirm-required allows).

Payload:
  {
    lead: { name, last_message?, context? },
    intent: 'pre_call' | 'follow_up' | 'pre_appt' | 'reschedule' | 'cold_open',
    auto_send: false,                  # default false; if true → posts confirmation request
    channel: 'twilio' | 'sendblue' | 'auto',
    persona_hint: '...'                # optional voice/tone steer
  }

Returns:
  { draft_text, draft_id, reasoning, would_send_via }
"""
from __future__ import annotations
import json, time, uuid
from pathlib import Path
import requests as _r

REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"

WORKSPACE = Path.home() / ".repflow" / "agent" / "workspace" / "drafts"

PROMPT_TEMPLATE = """You write SMS messages for an insurance agent. Goal: {intent}.
Constraints: max 160 chars, friendly but professional, ONE clear ask, no emoji unless lead used one.
{persona}

Lead: {lead_name}
Last message from lead: {last_message}
Context: {context}

Write ONE SMS. No quotes, no explanation, just the SMS body.
"""


def _ollama(prompt: str, model: str = "qwen2.5:3b") -> str:
    r = _r.post("http://127.0.0.1:11434/api/generate",
                json={"model": model, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.4, "num_predict": 80}},
                timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"ollama generate failed: HTTP {r.status_code}")
    return (r.json().get("response") or "").strip().strip('"').strip("'")


def run(payload: dict, ctx: dict) -> dict:
    lead = payload.get("lead") or {}
    intent = payload.get("intent") or "follow_up"
    persona = payload.get("persona_hint") or ""

    prompt = PROMPT_TEMPLATE.format(
        intent=intent,
        persona=f"Voice/tone: {persona}" if persona else "",
        lead_name=lead.get("name") or "Lead",
        last_message=lead.get("last_message") or "(none)",
        context=lead.get("context") or "(none)",
    )

    # Pick model by what's loaded; prefer 3b for speed.
    cfg = ctx.get("cfg") or {}
    model = cfg.get("default_model") or "qwen2.5:3b"
    text = _ollama(prompt, model=model)
    text = text[:160]  # hard cap; carriers reject longer SMS

    WORKSPACE.mkdir(parents=True, exist_ok=True)
    did = str(uuid.uuid4())
    drft = WORKSPACE / f"{did}.json"
    drft.write_text(json.dumps({
        "id": did, "intent": intent, "lead": lead, "draft_text": text,
        "model": model, "created_at": time.time(),
    }, indent=2))

    out = {
        "draft_text": text,
        "draft_id": did,
        "would_send_via": payload.get("channel") or "auto",
        "model": model,
    }

    auto_send = bool(payload.get("auto_send"))
    if auto_send:
        # Don't actually send — high-risk action. Post a confirmation
        # request instead; web UI / OS push / SMS prompts the user.
        try:
            r = _r.post(
                f"{ctx['api_base']}/api/agent/confirmation-request",
                headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
                json={
                    "action": "send_real_sms",
                    "description": f"Send SMS to {lead.get('name') or 'lead'}: {text!r}",
                    "args_redacted": {"channel": out["would_send_via"], "draft_id": did, "to_name": lead.get("name")},
                    "channel": "any",
                },
                timeout=8,
            )
            if r.status_code == 200:
                out["confirmation_id"] = r.json().get("confirmation_id")
                out["status"] = "awaiting_confirmation"
        except Exception as e:
            out["confirmation_error"] = str(e)[:200]

    return out
