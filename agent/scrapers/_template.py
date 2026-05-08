"""Carrier scraper template — copy to scrapers/<carrier_id>.py and adapt.

Each scraper declares the same module-level constants so the agent's capture
and inspect flows can drive it generically:

    REQUIRES_LOGIN        bool — does this carrier need a producer login?
    CARRIER_NAME          human-readable name
    LOGIN_URL             URL the headed capture flow opens to (None if no login)
    LOGGED_IN_INDICATOR   one of:
                            • a substring expected in the post-login URL
                              (e.g. "/dashboard")
                            • "selector:<css>" — present once logged in
                            • a callable(page) -> bool for complex cases
    QUOTE_URL             URL the inspect flow / quote scraper navigates to

The `quote()` function gets a Playwright `page` ready to navigate, plus
optional `creds` (only when REQUIRES_LOGIN). Return shape:

    {
      "premium": 142.30,           # monthly $ as float, or None
      "uwClass": "Preferred",      # carrier UW class lead falls into
      "decline": False,            # True if carrier rejects this profile
      "reason": "BMI > 40.5",      # required when decline=True
      "raw": "<html excerpt>",     # last few KB of result page for debugging
    }

Optional `inspect_form(page)` lets a scraper do prep navigation (dismiss
modals, click "New quote") before the agent dumps form selectors.
"""

REQUIRES_LOGIN = False
CARRIER_NAME = "Template"
LOGIN_URL = None
LOGGED_IN_INDICATOR = None
QUOTE_URL = None


def quote(profile: dict, page, creds=None) -> dict:
    return {"decline": True, "reason": "scraper not implemented for this carrier"}
