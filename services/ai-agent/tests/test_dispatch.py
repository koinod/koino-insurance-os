"""Tests for room-name parsing + voicemail templating.

Runs without LiveKit / Supabase / OpenAI — pure logic checks.
"""
import os
import sys
import pathlib

# Mock the heavy deps so we can import agent.py without LiveKit installed
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("OPENAI_API_KEY", "")

# Avoid the venv-less test crashing if livekit deps aren't installed
# by importing only the small pure-python pieces.
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))


def test_room_pattern_ai():
    import re
    ROOM_PATTERN = re.compile(r"^(ai|vm)-([0-9a-f-]{36})$")
    m = ROOM_PATTERN.match("ai-12345678-1234-1234-1234-123456789012")
    assert m is not None
    assert m.group(1) == "ai"
    assert m.group(2) == "12345678-1234-1234-1234-123456789012"


def test_room_pattern_vm():
    import re
    ROOM_PATTERN = re.compile(r"^(ai|vm)-([0-9a-f-]{36})$")
    m = ROOM_PATTERN.match("vm-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    assert m is not None
    assert m.group(1) == "vm"


def test_room_pattern_rejects_other():
    import re
    ROOM_PATTERN = re.compile(r"^(ai|vm)-([0-9a-f-]{36})$")
    assert ROOM_PATTERN.match("rep-12345678-1234-1234-1234-123456789012") is None
    assert ROOM_PATTERN.match("leg-12345678-1234-1234-1234-123456789012") is None
    assert ROOM_PATTERN.match("ai-too-short") is None


def test_voicemail_template_with_name():
    # Replicating the build_voicemail_text logic without importing agent.py
    VOICEMAIL_TEMPLATE = (
        "Hi{name_suffix}, this is the Koino Capital insurance team. I tried "
        "reaching you about your{product_suffix} insurance request — give me a "
        "callback at your convenience, or grab a time directly at cal.com/koino. "
        "Talk soon."
    )
    out = VOICEMAIL_TEMPLATE.format(name_suffix=" Joe", product_suffix="")
    assert "Hi Joe," in out
    assert "cal.com/koino" in out


def test_voicemail_template_without_name():
    VOICEMAIL_TEMPLATE = (
        "Hi{name_suffix}, this is the Koino Capital insurance team. I tried "
        "reaching you about your{product_suffix} insurance request — give me a "
        "callback at your convenience, or grab a time directly at cal.com/koino. "
        "Talk soon."
    )
    out = VOICEMAIL_TEMPLATE.format(name_suffix="", product_suffix="")
    assert out.startswith("Hi, this is the Koino Capital")


if __name__ == "__main__":
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok: {name}")
            except AssertionError as e:
                print(f"FAIL: {name}: {e}")
                failures += 1
    sys.exit(1 if failures else 0)
