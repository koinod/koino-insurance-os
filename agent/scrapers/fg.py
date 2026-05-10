"""F&G Life producer-portal scraper (Annuity / IUL)."""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "F&G"
LOGIN_URL = "https://saleslink.fglife.com/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Logout')"
QUOTE_URL = "https://saleslink.fglife.com/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        page.wait_for_load_state("networkidle", timeout=15000)
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture F&G login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        # Annuities are quoted as APY; pick that up if present.
        m = re.search(r"(\d\.\d{1,2})\s*%\s*(?:APY|effective)", body, re.IGNORECASE)
        if m:
            return {"premium": None, "uwClass": f"{m.group(1)}% APY", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "F&G scraper needs selector mapping — run `inspect fg` after capturing session", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
