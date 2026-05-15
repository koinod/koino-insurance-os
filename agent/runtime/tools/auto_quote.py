"""auto_quote — bridge from RBA command channel into the existing
quote_agent.py auto-quoter.

Payload:
  {
    case_payload: {...},   # passed to /api/carrier-recommend for ordering
    profile: {...},        # carrier-portal scraper profile
    carriers: ['uhc', ...] # optional override of enabled carriers
  }

Returns:
  { results: [{carrier_id, status, premium_cents, uw_class, error}, ...],
    declined: ['carrier_id', ...] }
"""
from __future__ import annotations
import importlib, json, sys, time
from pathlib import Path

REQUIRED_CAPS = ["local.browser_carrier_portal"]
RATE_BUCKET = "browser"


def _load_qa():
    """Import quote_agent.py at runtime — it lives at agent/quote_agent.py
    not under runtime/, so we add agent/ to sys.path."""
    agent_dir = Path(__file__).resolve().parents[2]   # …/agent/
    if str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))
    return importlib.import_module("quote_agent")


def run(payload: dict, ctx: dict) -> dict:
    qa = _load_qa()
    case = payload.get("case_payload") or {}
    profile = payload.get("profile") or {}
    enabled = payload.get("carriers") or []

    scrapers = qa.load_scrapers()
    creds = qa.load_credentials()
    settings = qa.load_settings()

    candidate = enabled or list(scrapers.keys())
    declined = []
    if case:
        ordered, declined = qa.recommend_carrier_order(case, candidate)
        if ordered:
            candidate = ordered

    results = []
    for cid in candidate:
        scraper = scrapers.get(cid)
        if not scraper:
            results.append({"carrier_id": cid, "status": "no_scraper"})
            continue
        carrier_creds = creds.get(cid) if scraper.REQUIRES_LOGIN else None
        if scraper.REQUIRES_LOGIN and not qa.has_session(cid) and not carrier_creds:
            results.append({"carrier_id": cid, "status": "no_creds"})
            continue
        try:
            p, context = qa.get_browser(headless=bool(settings.get("headless", True)),
                                        carrier=cid, persistent=True)
            try:
                page = context.new_page()
                r = scraper.quote(profile, page, creds=carrier_creds)
                results.append({
                    "carrier_id": cid,
                    "status": "decline" if r.get("decline") else "ok",
                    "premium_cents": int(r.get("premium", 0) * 100) if r.get("premium") else None,
                    "uw_class": r.get("uwClass"),
                    "error": r.get("reason") if r.get("decline") else None,
                })
            finally:
                context.close()
                p.stop()
        except Exception as e:
            results.append({"carrier_id": cid, "status": "error", "error": str(e)[:300]})

    return {"results": results, "declined": declined}
