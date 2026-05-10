"""Cigna (American Retirement Life Insurance Company / ARLIC) scraper.

Producer portal: agent.cignaforhcp.com. Cigna's Med Supp business is
underwritten by Loyal American / ARLIC under the Cigna Healthcare brand;
the producer portal is shared with Cigna for HCP.

Stub: capture flow lands fine; quote-form selectors await live inspection.
"""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Cigna (ARLIC)"
LOGIN_URL = "https://www.cignaforhcp.com/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('Logout'), [data-test*='dashboard']"
QUOTE_URL = "https://www.cignaforhcp.com/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        page.wait_for_load_state("networkidle", timeout=15000)
        if "login" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Cigna login"}

        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|monthly|per month)", body, re.IGNORECASE)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Preferred" if not profile.get("tobacco") else "Standard", "decline": False, "raw": body[:1000]}
        return {"decline": True, "reason": "Cigna scraper needs selector mapping — run `inspect cigna` after capturing session", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
