#!/usr/bin/env python3
"""Smoke for quote_agent.py wiring — pure-Python, no browser, no network.

Covers the Phase-1 functional-wiring changes:
  • resolve_creds prefers the local credentials.json over the vault
  • connector_exchange no-ops cleanly when no agent_token is configured
  • _detect_logged_in handles substring / selector: / callable indicators
  • ensure_logged_in short-circuits for carriers that don't require login

Run: python3 agent/tests/test_quote_agent_wiring.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import quote_agent as qa  # noqa: E402


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        raise SystemExit(1)


# resolve_creds: local file wins, no network touched.
local = {"humana": {"username": "u", "password": "p"}}
check("resolve_creds prefers local file",
      qa.resolve_creds("humana", local, {"agent_token": None}) == local["humana"])

# resolve_creds: no local + no token → None (vault unreachable, no crash).
check("resolve_creds returns None without token or local",
      qa.resolve_creds("aetna", {}, {"agent_token": None}) is None)

# connector_exchange: missing token short-circuits to None without a request.
check("connector_exchange no-ops without agent_token",
      qa.connector_exchange("aetna", {}) is None)


# _detect_logged_in: fake page objects.
class FakePage:
    def __init__(self, url="", has_selector=False):
        self.url = url
        self._has = has_selector
    def query_selector(self, sel):
        return object() if self._has else None


check("logged-in by URL substring",
      qa._detect_logged_in(FakePage(url="https://x/dashboard"), "/dashboard") is True)
check("not logged-in by URL substring",
      qa._detect_logged_in(FakePage(url="https://x/sign-in"), "/dashboard") is False)
check("logged-in by selector present",
      qa._detect_logged_in(FakePage(has_selector=True), "selector:a.signout") is True)
check("not logged-in by selector absent",
      qa._detect_logged_in(FakePage(has_selector=False), "selector:a.signout") is False)
check("logged-in by callable",
      qa._detect_logged_in(FakePage(url="/home"), lambda p: "/home" in p.url) is True)


# ensure_logged_in: carrier that doesn't require login is always ok.
class NoLoginScraper:
    REQUIRES_LOGIN = False


check("ensure_logged_in ok when REQUIRES_LOGIN is False",
      qa.ensure_logged_in(FakePage(), NoLoginScraper(), "x", None) == {"ok": True})

print("\nall quote_agent wiring smokes passed")
