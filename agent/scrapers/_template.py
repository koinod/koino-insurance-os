"""Carrier scraper template — copy to scrapers/<carrier_id>.py and adapt.

Set REQUIRES_LOGIN to True if the carrier needs producer credentials.
The `quote()` function gets a Playwright `page` ready to navigate, plus
optional `creds` (only when REQUIRES_LOGIN). Return shape:

    {
      "premium": 142.30,           # monthly $ as float, or None
      "uwClass": "Preferred",      # carrier UW class lead falls into
      "decline": False,            # True if carrier rejects this profile
      "reason": "BMI > 40.5",      # required when decline=True
      "raw": "<html excerpt>",     # last few KB of result page for debugging
    }
"""

REQUIRES_LOGIN = False
CARRIER_NAME = "Template"


def quote(profile: dict, page, creds=None) -> dict:
    return {"decline": True, "reason": "scraper not implemented for this carrier"}
