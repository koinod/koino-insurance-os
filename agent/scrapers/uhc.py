"""UnitedHealthcare AARP Medicare Supplement scraper.

Uses the public consumer quoter at https://www.aarpmedicaresupplement.com/
which DOES NOT require producer login — anyone can pull a Plan G quote by
ZIP + age + gender + tobacco. So REQUIRES_LOGIN = False.

The consumer-facing quote is the same Plan G premium a producer would write
since UHC AARP rates are filed publicly per state. For producer-side
features (commission, Master Producer Number lookups), a producer-portal
scraper would be needed — that's a separate, REQUIRES_LOGIN=True module.
"""

REQUIRES_LOGIN = False
CARRIER_NAME = "UnitedHealthcare AARP"
LOGIN_URL = None  # public quoter, no login
LOGGED_IN_INDICATOR = None
# UHC retired aarpmedicaresupplement.com/get-rate-quote in 2026; the consumer
# entry point is now uhc.com's estimate flow, which submits ZIP → plan-summary.
# Plan G premiums are visible on the post-ZIP results page once the flow loads.
QUOTE_URL = "https://www.uhc.com/medicare/shop/estimate/ms-costs.html"


# Map state code → ZIP centroid (rough — AARP quoter is state-driven really
# but accepts any valid ZIP within the state). For more accuracy this should
# come from a USPS lookup; for now the largest metro per state.
STATE_ZIP_FALLBACK = {
    "TX": "75201", "GA": "30303", "FL": "33101", "CA": "90001", "NY": "10001",
    "AZ": "85001", "PA": "19103", "IL": "60601", "OH": "44101", "MI": "48201",
    "NC": "28201", "VA": "22101", "WA": "98101", "MA": "02101", "CO": "80201",
    "TN": "37201", "IN": "46201", "MO": "63101", "MD": "21201", "WI": "53201",
}


def quote(profile: dict, page, creds=None) -> dict:
    """Pull a Plan G monthly premium from the AARP public quoter.

    Returns {"premium": float, "uwClass": str, "decline": False} on success
    or {"decline": True, "reason": str} if the quoter rejects the inputs.
    """
    age = profile.get("age")
    state = profile.get("state")
    gender = (profile.get("gender") or "F").upper()
    tobacco = bool(profile.get("tobacco"))
    plan = (profile.get("planVariant") or "G").upper()

    if not age or not state:
        return {"decline": True, "reason": "missing age or state"}
    if profile.get("product") != "medsupp":
        return {"decline": True, "reason": "AARP Medicare Supplement only quotes Med Supp"}

    zip_code = STATE_ZIP_FALLBACK.get(state)
    if not zip_code:
        return {"decline": True, "reason": f"no ZIP fallback for state {state}"}

    try:
        # New 2026 flow: enter ZIP on the estimate landing page, get redirected to
        # plan-summary which lists Plan A–N with monthly premiums.
        page.goto(QUOTE_URL, timeout=20000)
        try: page.wait_for_load_state("networkidle", timeout=8000)
        except Exception: pass  # UHC has long-running tracking pixels; domcontentloaded is enough
        zip_field = page.query_selector('input[name="uhc-store-planfinderZipcode"], input[id*="planfinderZipcode" i]')
        if zip_field:
            zip_field.fill(zip_code)
            submit = page.query_selector('button[type="submit"], button:has-text("View plans")')
            if submit:
                submit.click()
                page.wait_for_load_state("networkidle", timeout=20000)
                page.wait_for_timeout(2000)

        # The quoter form has shifted layouts repeatedly. We try multiple
        # selectors (ZIP first then age) and tolerate either order.
        zip_input = page.query_selector('input[name="zipCode"], input[name="zip"], input[id*="zip" i]')
        if zip_input:
            zip_input.fill(zip_code)

        age_input = page.query_selector('input[name="age"], input[id*="age" i][type="number"]')
        if age_input:
            age_input.fill(str(age))

        # Gender + tobacco — usually radio buttons
        gender_radio = page.query_selector(f'input[type="radio"][value="{gender}"]') or \
                       page.query_selector(f'input[type="radio"][value="{gender.lower()}"]')
        if gender_radio:
            gender_radio.click()

        tobacco_value = "yes" if tobacco else "no"
        tobacco_radio = page.query_selector(f'input[name*="tobacco" i][value*="{tobacco_value}" i]')
        if tobacco_radio:
            tobacco_radio.click()

        submit = page.query_selector('button[type="submit"], input[type="submit"], button:has-text("Get Quote"), button:has-text("View Rates")')
        if submit:
            submit.click()
        page.wait_for_load_state("networkidle", timeout=20000)
        page.wait_for_timeout(1500)

        # The result page lists premiums. Look for Plan G specifically.
        plan_g_row = page.query_selector(f'tr:has-text("Plan {plan}"), li:has-text("Plan {plan}"), div:has-text("Plan {plan}")')
        body_text = page.locator("body").inner_text(timeout=3000) if page else ""
        if not body_text:
            return {"decline": True, "reason": "empty result page"}

        # Find first $XX/mo or $XXX/mo near "Plan G"
        import re
        match = re.search(rf"Plan\s*{plan}.*?\$(\d{{2,4}}(?:\.\d{{2}})?)\s*(?:/mo|per month|monthly)?", body_text, re.IGNORECASE | re.DOTALL)
        if not match:
            # Fallback — first $ amount in the result section
            match = re.search(r"\$(\d{2,4}(?:\.\d{2})?)\s*(?:/mo|per month|monthly)", body_text, re.IGNORECASE)
        if not match:
            return {"decline": True, "reason": "could not parse premium from result page", "raw": body_text[:600]}

        premium = float(match.group(1))
        uw_class = "Preferred" if not tobacco else "Standard"
        return {"premium": premium, "uwClass": uw_class, "decline": False, "raw": body_text[:1000]}

    except Exception as e:
        return {"decline": True, "reason": f"scraper error: {str(e)[:200]}"}
