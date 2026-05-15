"""meta_dm_send — send DM via Meta Graph API (FB Page or IG Business)."""
from ._stubs import make_stub
REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"
run = make_stub("meta_dm", "send", REQUIRED_CAPS, RATE_BUCKET)
