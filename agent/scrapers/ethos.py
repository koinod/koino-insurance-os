"""Ethos Life producer-portal scraper (Term)."""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Ethos"
LOGIN_URL = "https://agents.ethoslife.com/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Dashboard'), [data-testid*='agent-dashboard']"
QUOTE_URL = "https://agents.ethoslife.com/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        try: page.wait_for_load_state("networkidle", timeout=8000)
        except Exception: pass
        if "login" in (page.url or "").lower() or "signin" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Ethos login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{1,3}(?:\.\d{2})?)\s*(?:/mo|/month|monthly)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Std" if profile.get("tobacco") else "Preferred", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "Ethos scraper needs selector mapping — run `inspect ethos` after capturing session", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
