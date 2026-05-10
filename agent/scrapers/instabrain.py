"""Instabrain producer-tooling scraper.

Instabrain is a multi-carrier instant quote engine — input one profile, get
back a ranked list of carriers' rates. The producer logs in once, then
quotes hit Instabrain's aggregated tier across many carriers.
"""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Instabrain"
LOGIN_URL = "https://www.instabrain.ai/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Dashboard'), [data-testid*='agent']"
QUOTE_URL = "https://www.instabrain.ai/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        try: page.wait_for_load_state("networkidle", timeout=8000)
        except Exception: pass
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Instabrain login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{1,3}(?:\.\d{2})?)\s*(?:/mo|/month|monthly)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Aggregator", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "Instabrain scraper needs selector mapping — run `inspect instabrain`", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
