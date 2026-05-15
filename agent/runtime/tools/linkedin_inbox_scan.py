"""linkedin_inbox_scan — pull unread LinkedIn DMs for triage."""
from ._stubs import make_stub
REQUIRED_CAPS = ["local.browser_general"]
RATE_BUCKET = "browser"
run = make_stub("linkedin", "inbox_scan", REQUIRED_CAPS, RATE_BUCKET)
