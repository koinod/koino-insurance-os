"""AIG / Corebridge Financial producer-portal scraper (FE + Term)."""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "AIG (Corebridge)"
LOGIN_URL = "https://www.corebridgefinancial.com/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Logout'), [data-testid*='dashboard']"
QUOTE_URL = "https://www.corebridgefinancial.com/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        page.wait_for_load_state("networkidle", timeout=15000)
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture AIG/Corebridge login"}
        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|monthly|per month)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Preferred" if not profile.get("tobacco") else "Standard", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "AIG scraper needs selector mapping — run `inspect aig` after capturing session", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
