"""Humana producer-portal scraper.

Login + quote flow runs against my.humana.com/agent/. Selectors below are
the structure as of late-2025; if Humana redesigns, run:

    python quote_agent.py inspect humana

to dump current form selectors and update.

Capture-then-quote pattern: the rep runs `Capture login session` once from
the Auto Quoter Setup tab. The agent opens a headed browser, the rep types
their producer email/password (and any MFA), the agent detects the
post-login URL pattern below and saves storage_state. Subsequent quote runs
reuse that storage_state in headless mode — no re-login per quote.
"""
import re

REQUIRES_LOGIN = True
CARRIER_NAME = "Humana"
# Verified entry point. Once headed Chromium opens, click "Sign In" and the
# producer types creds. Humana SSO lands them on humana.com/agent/dashboard.
LOGIN_URL = "https://www.humana.com/agent"
LOGGED_IN_INDICATOR = "selector:a[href*='dashboard'], a:has-text('My account'), a:has-text('Sign out')"
QUOTE_URL = "https://www.humana.com/agent"  # producer navigates from dashboard; scraper post-capture finds the quote link


def quote(profile: dict, page, creds=None) -> dict:
    age = profile.get("age")
    state = profile.get("state")
    gender = (profile.get("gender") or "F").upper()
    tobacco = bool(profile.get("tobacco"))
    plan = (profile.get("planVariant") or "G").upper()
    if not age or not state:
        return {"decline": True, "reason": "missing age or state"}

    try:
        page.goto(QUOTE_URL, timeout=25000)
        page.wait_for_load_state("networkidle", timeout=15000)

        # If we got bounced to login, the captured session is stale.
        if "/sign-in" in (page.url or ""):
            return {"decline": True, "reason": "session expired — re-capture Humana login from Auto Quoter Setup"}

        # ── Fill the quote form ──────────────────────────────────────────
        # State + ZIP — Humana asks for both. If profile has a ZIP use it,
        # else fall back to a state-centroid ZIP.
        zip_code = profile.get("zip") or _state_zip(state)
        for sel in ['input[name="zip"]', 'input[id*="zip" i]']:
            el = page.query_selector(sel)
            if el:
                el.fill(zip_code); break
        for sel in ['select[name="state"]', 'select[id*="state" i]']:
            el = page.query_selector(sel)
            if el:
                el.select_option(state); break

        # DOB or age — Humana switched between fields. Try both.
        age_el = page.query_selector('input[name*="age" i], input[id*="age" i][type="number"]')
        if age_el:
            age_el.fill(str(age))

        # Gender + tobacco
        for sel in [f'input[name="gender"][value="{gender}"]',
                    f'input[name*="gender" i][value*="{gender.lower()}" i]']:
            el = page.query_selector(sel)
            if el:
                el.click(); break
        tv = "yes" if tobacco else "no"
        for sel in [f'input[name="tobacco"][value*="{tv}" i]',
                    f'input[name*="tobacco" i][value*="{tv}" i]']:
            el = page.query_selector(sel)
            if el:
                el.click(); break

        # Plan G / Plan N
        for sel in [f'input[name="plan"][value="{plan}"]',
                    f'input[name*="plan" i][value*="{plan}" i]']:
            el = page.query_selector(sel)
            if el:
                el.click(); break

        submit = page.query_selector('button[type="submit"], button:has-text("Get rate"), button:has-text("Calculate")')
        if submit:
            submit.click()
        page.wait_for_load_state("networkidle", timeout=20000)
        page.wait_for_timeout(1500)

        body = page.locator("body").inner_text(timeout=3000) or ""
        m = re.search(rf"Plan\s*{plan}.*?\$(\d{{2,4}}(?:\.\d{{2}})?)", body, re.IGNORECASE | re.DOTALL)
        if not m:
            m = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|per month|monthly)", body, re.IGNORECASE)
        if not m:
            return {"decline": True, "reason": "could not parse Humana premium — run `inspect humana` to refresh selectors", "raw": body[:600]}

        premium = float(m.group(1))
        return {"premium": premium, "uwClass": "Standard" if tobacco else "Preferred", "decline": False, "raw": body[:1000]}
    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}


def _state_zip(state: str) -> str:
    return {
        "TX": "75201", "GA": "30303", "FL": "33101", "CA": "90001", "NY": "10001",
        "AZ": "85001", "PA": "19103", "IL": "60601", "OH": "44101", "MI": "48201",
    }.get(state, "75201")
