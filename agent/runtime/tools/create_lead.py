"""create_lead — actually creates a row in public.pipeline. The first
real "make a deal" tool.

Payload:
  {
    name: "Sarah Lopez",
    phone: "+15125551234",
    email: "sarah@example.com",
    state: "TX",
    age: 45,
    product: "term_life",
    source: "agent",
    notes: "Inbound DM on IG, asked about $250k coverage",
    stage: "New",       # default New; or "Contacted","Quoted","App In","Issued"
    heat: "warm",       # fresh|warm|hot
    consent: "verbal",  # none|verbal|verified
    ap: 0               # annual premium estimate
  }

Returns:
  { lead_id, stage, agency_id, owner_rep_id, created_at }

Requires the rba_installs row to have an agency_id we can write to.
Inserts via service-role exchange (REST PostgREST with x-agent-token →
fetch agency_id from /api/agent/lead-create endpoint that uses service
role to bypass RLS — for tonight's test we use the legacy direct
service-role pattern).
"""
from __future__ import annotations
import datetime as _dt, json, os
import requests as _r

REQUIRED_CAPS = ["db.read_own_pipeline"]
RATE_BUCKET = None  # not rate-limited, gated by caps + idempotency at API layer


def run(payload, ctx):
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("name required")
    phone   = payload.get("phone") or ""
    email   = payload.get("email") or ""
    state   = payload.get("state") or ""
    age     = payload.get("age")
    product = payload.get("product") or "term_life"
    source  = payload.get("source") or "agent"
    notes   = payload.get("notes") or ""
    stage   = payload.get("stage") or "New"
    heat    = payload.get("heat") or "fresh"
    consent = payload.get("consent") or "none"
    ap      = payload.get("ap") or 0

    # Talk to the platform via a thin endpoint so we don't need service-role
    # creds on the agent. /api/agent/lead-create uses x-agent-token to
    # resolve agency_id + owner_rep_id, then does the insert with the
    # service role server-side.
    r = _r.post(
        f"{ctx['api_base']}/api/agent/lead-create",
        headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
        json={
            "lead": name, "phone": phone, "email": email, "state": state,
            "age": age, "product": product, "source": source, "notes": notes,
            "stage": stage, "heat": heat, "consent": consent, "ap": ap,
        }, timeout=15,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"lead-create failed: HTTP {r.status_code}: {r.text[:300]}")
    return r.json()
