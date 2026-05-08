"""Foresters Financial producer-portal scraper (Term + Whole Life)."""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Foresters"
LOGIN_URL = "https://www.foresters.com/agents"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Logout'), [data-testid*='dashboard']"
QUOTE_URL = "https://www.foresters.com/agents"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        try: page.wait_for_load_state("networkidle", timeout=8000)
        except Exception: pass
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Foresters login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|monthly|per month)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Std" if profile.get("tobacco") else "Preferred", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "Foresters scraper needs selector mapping — run `inspect foresters`", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
