"""Humana producer-portal scraper (requires producer login).

Humana's Vantage producer portal is at https://my.humana.com/agent/. For
quoting, producers use the eApp / Quote tool inside the portal.

This is a STUB with the login + quote flow scaffolded. The actual selectors
need verification against the live portal — they change roughly quarterly.
"""

REQUIRES_LOGIN = True
CARRIER_NAME = "Humana"
LOGIN_URL = "https://my.humana.com/agent/sign-in"
QUOTE_URL = "https://my.humana.com/agent/quote/medsupp"


def quote(profile: dict, page, creds: dict | None) -> dict:
    if not creds or not creds.get("username") or not creds.get("password"):
        return {"decline": True, "reason": "missing Humana producer credentials"}

    try:
        page.goto(LOGIN_URL, timeout=20000)
        page.wait_for_load_state("networkidle", timeout=15000)

        # Login flow — selectors are placeholder; inspect & update when wiring up live
        username_input = page.query_selector('input[name="username"], input[type="email"]')
        password_input = page.query_selector('input[name="password"], input[type="password"]')
        if username_input and password_input:
            username_input.fill(creds["username"])
            password_input.fill(creds["password"])
            login_btn = page.query_selector('button[type="submit"], button:has-text("Sign in")')
            if login_btn:
                login_btn.click()
                page.wait_for_load_state("networkidle", timeout=20000)

        # MFA detection — bail with a meaningful error if challenged
        body = page.locator("body").inner_text(timeout=3000)
        if "verification code" in body.lower() or "two-step" in body.lower():
            return {"decline": True, "reason": "MFA challenge — Humana requires 2FA, agent can't bypass. Use App password if available, else manual quote."}

        # Navigate to quote tool. Selectors below are intentionally generic;
        # this scraper will fail-safe with a clear reason until the operator
        # wires up the actual portal layout.
        page.goto(QUOTE_URL, timeout=20000)
        page.wait_for_load_state("networkidle", timeout=15000)

        return {
            "decline": True,
            "reason": "Humana portal scraper not yet wired up — log in once via headed mode to inspect selectors, then update agent/scrapers/humana.py",
            "raw": (page.locator("body").inner_text(timeout=2000) or "")[:500],
        }
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
