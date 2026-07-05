"""Americo Financial Life producer-portal scraper (FE, Term, IUL, Annuity).

Domain: agent.americo.com (Americo Producer Portal).
"""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Americo Financial"
LOGIN_URL = "https://agent.americo.com"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Logout'), a:has-text('Sign Out')"
QUOTE_URL = "https://agent.americo.com"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Americo login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|monthly|per month)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Std", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "Americo scraper needs selector mapping — run `inspect americo`", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
