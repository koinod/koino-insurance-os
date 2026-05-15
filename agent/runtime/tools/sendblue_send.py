"""sendblue_send — iMessage outbound via SendBlue API.
Stubbed: connector_vault.sendblue OAuth flow + send-message endpoint not
yet shipped. See PRD §6 follow-on builds.
"""
from ._stubs import make_stub

REQUIRED_CAPS = ["local.draft_sms"]
RATE_BUCKET = "draft"
run = make_stub("sendblue", "send", REQUIRED_CAPS, RATE_BUCKET)
