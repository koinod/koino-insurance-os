"""linkedin_send — outbound LinkedIn DM via cookie session.
PRD §6 highest legal/ToS risk; multi-week build. Stubbed pending the
chrome-extension cookie bridge."""
from ._stubs import make_stub
REQUIRED_CAPS = ["local.browser_general"]
RATE_BUCKET = "browser"
run = make_stub("linkedin", "send", REQUIRED_CAPS, RATE_BUCKET)
