"""ig_dm_reply — auto-reply to inbound IG DMs via Meta Graph API.

Payload: { since_iso?: str, intent?: str, auto_send: false }
Pulls recent unread IG conversations, for each one drafts a reply via
local LLM (intent), and either posts confirmations or sends if auto_send.
"""
from __future__ import annotations
import datetime as _dt
import requests as _r

REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"

PROMPT = """You're an insurance agent's assistant. Reply to this Instagram DM in 1-2 short sentences.
Friendly, casual, ask one clarifying question.
Intent: {intent}

Their message: {msg}

Reply:"""


def _exchange(api_base: str, token: str) -> dict:
    r = _r.post(
        f"{api_base}/api/agent/connector-exchange",
        headers={"x-agent-token": token, "content-type": "application/json"},
        json={"provider": "ig_business"}, timeout=8,
    )
    if r.status_code != 200:
        raise RuntimeError(f"ig_business exchange failed HTTP {r.status_code}")
    return r.json()


def _ollama(prompt, model, base_url):
    r = _r.post(base_url.rstrip("/") + "/api/generate",
                json={"model": model, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.5, "num_predict": 100}}, timeout=120)
    return (r.json().get("response") or "").strip().strip('"')


def run(payload, ctx):
    creds = _exchange(ctx["api_base"], ctx["token"])
    token = creds.get("access_token") or creds.get("api_key")
    page_id = (creds.get("page_ids") or [None])[0]
    if not (token and page_id):
        raise RuntimeError("ig_business: page_id + token required")

    # Pull recent conversations
    url = f"https://graph.facebook.com/v18.0/{page_id}/conversations"
    r = _r.get(url, params={"access_token": token, "platform": "instagram", "fields": "id,participants,messages.limit(1){from,message,created_time}", "limit": 25}, timeout=15)
    if r.status_code >= 300:
        return {"replies": [], "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    convs = r.json().get("data", [])
    intent = payload.get("intent") or "qualify"
    cfg = ctx.get("cfg") or {}
    model = cfg.get("default_model") or "qwen2.5:1.5b"

    drafts = []
    for c in convs[:10]:
        msgs = (c.get("messages") or {}).get("data") or []
        if not msgs: continue
        last = msgs[0]
        # Skip if last msg was from us
        if last.get("from", {}).get("id") == page_id: continue
        text = last.get("message", "")
        if not text: continue
        reply = _ollama(PROMPT.format(intent=intent, msg=text), model, (cfg.get("ollama_url") or "http://127.0.0.1:11434"))
        drafts.append({
            "conversation_id": c.get("id"),
            "their_msg": text,
            "draft_reply": reply,
            "from_id": last.get("from", {}).get("id"),
        })

    if not bool(payload.get("auto_send")):
        return {"drafts": drafts, "count": len(drafts), "status": "drafts_only"}

    # Post confirmations for each
    confs = []
    for d in drafts:
        cr = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",
                "description": f"IG reply to '{d['their_msg'][:60]}': {d['draft_reply'][:80]}",
                "args_redacted": {"channel": "ig", "conv": d["conversation_id"]},
                "channel": "any",
            }, timeout=8,
        )
        if cr.status_code == 200:
            confs.append({"draft": d, "confirmation_id": cr.json().get("confirmation_id")})
    return {"drafts": drafts, "confirmations": confs, "count": len(confs)}
