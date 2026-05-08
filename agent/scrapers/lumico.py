"""Lumico Life producer-portal scraper (Final Expense)."""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Lumico"
LOGIN_URL = "https://lumico.com/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Logout')"
QUOTE_URL = "https://lumico.com/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        page.wait_for_load_state("networkidle", timeout=15000)
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Lumico login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|monthly|per month)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Std", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "Lumico scraper needs selector mapping — run `inspect lumico` after capturing session", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
