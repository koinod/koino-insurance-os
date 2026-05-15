"""ig_dm_reply — auto-reply to inbound IG DMs via Meta Graph API."""
from ._stubs import make_stub
REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"
run = make_stub("ig_business", "dm_reply", REQUIRED_CAPS, RATE_BUCKET)
