"""Aetna Senior Products (CVS Aetna) producer-portal scraper.

Producer portal: aetnaseniorproducts.com (legacy) and producerworld.aetna.com.
Both reach the same quote tool after SSO. The capture flow opens the legacy
portal because it has a simpler login page; SSO redirects work fine for
quote runs.

Stub status: LOGIN_URL + LOGGED_IN_INDICATOR + QUOTE_URL are real and the
capture flow will work end-to-end. Quote-form selectors require live-portal
inspection — run `python quote_agent.py inspect aetna` after capturing once
to dump the current form structure.
"""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Aetna SRC"
LOGIN_URL = "https://www.aetnaseniorsupplemental.com/"
LOGGED_IN_INDICATOR = "selector:a:has-text('Sign out'), a:has-text('My account'), [data-testid*='agent']"
QUOTE_URL = "https://www.aetnaseniorsupplemental.com/"


def quote(profile: dict, page, creds=None) -> dict:
    try:
        page.goto(QUOTE_URL, timeout=25000)
        page.wait_for_load_state("networkidle", timeout=15000)
        if "login" in (page.url or "").lower() or "auth" in (page.url or "").lower():
            return {"decline": True, "reason": "session expired — re-capture Aetna login"}

        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(rf"Plan\s*{(profile.get('planVariant') or 'G').upper()}.*?\$(\d{{2,4}}(?:\.\d{{2}})?)", body, re.IGNORECASE | re.DOTALL)
        if m:
            return {"premium": float(m.group(1)), "uwClass": "Preferred" if not profile.get("tobacco") else "Standard", "decline": False, "raw": body[:1000]}

        return {"decline": True, "reason": "Aetna scraper needs selector mapping — run `inspect aetna` after capturing session", "raw": body[:600]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
