"""Carrier scrapers for the Auto Quoter local agent.

Each module in this directory must export:
  • REQUIRES_LOGIN: bool — True if rep credentials are required
  • quote(profile: dict, page: playwright.Page, creds: dict | None) -> dict
      Returns: {"premium": float | None, "uwClass": str, "decline": bool,
               "reason": str | None, "raw": str | None}

Profile shape matches lib/rate-engine.js:
  {age, state, gender, tobacco, heightInches, weightLbs, bmi,
   product, planVariant, healthDetail: {diabetesType, bpHigh, ...}}

The carrier_id used by Auto Quoter UI must match this filename.
"""
