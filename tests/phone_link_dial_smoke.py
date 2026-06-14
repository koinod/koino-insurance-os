from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
MOD_PATH = ROOT / "agent" / "runtime" / "tools" / "phone_link_dial.py"


def load_module():
    spec = importlib.util.spec_from_file_location("phone_link_dial", MOD_PATH)
    if spec is None or spec.loader is None:
      raise RuntimeError(f"could not load {MOD_PATH}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class FakeInfo:
    def __init__(self, name="", automation_id="", control_type="Button", class_name=""):
        self.name = name
        self.automation_id = automation_id
        self.control_type = control_type
        self.class_name = class_name


class FakeButton:
    def __init__(self, name, automation_id=""):
        self.element_info = FakeInfo(name=name, automation_id=automation_id, control_type="Button")


class FakeWindow:
    def __init__(self, buttons):
        self._buttons = buttons

    def descendants(self, control_type=None):
        if control_type == "Button":
            return self._buttons
        return []


def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_normalize(mod):
    assert_true(mod._norm_text(None) == "", "None should normalize to empty string")
    assert_true(mod._norm_text("  Call\n now ") == "Call now", "whitespace should collapse")


def test_summary_detects_call_state(mod):
    snap = [
        {"control_type": "Button", "name": "Call", "automation_id": "callButton"},
        {"control_type": "Text", "name": "Ringing", "automation_id": ""},
        {"control_type": "Button", "name": "End call", "automation_id": ""},
    ]
    summary = mod._summarize_snapshot(snap)
    assert_true(summary["verified"] is True, "call-state snapshot should verify")
    assert_true(len(summary["call_buttons"]) >= 1, "call button should be detected")


def test_best_call_button_prefers_exact_label(mod):
    win = FakeWindow([
        FakeButton("Share"),
        FakeButton("Call now"),
        FakeButton("Call"),
        FakeButton("Dial"),
    ])
    button, label = mod._best_call_button(win)
    assert_true(label == "Call", f"expected exact Call button, got {label!r}")
    assert_true(button.element_info.name == "Call", "best button should be the exact call control")


def test_pad_aid_covers_all_dialables(mod):
    # The fix dials by driving the dial pad; every char we'd dial must map to
    # a real Phone Link dial-pad automation_id.
    for ch in "0123456789*#":
        assert_true(ch in mod._PAD_AID, f"pad mapping missing {ch!r}")
    assert_true(mod._PAD_AID["1"] == "Button1", "digit->Button<N> mapping wrong")
    assert_true(mod._PAD_AID["*"] == "ButtonStar" and mod._PAD_AID["#"] == "ButtonPound",
                "star/pound mapping wrong")


def test_digit_extraction_strips_plus(mod):
    # _dial_via_pad enters only chars present in _PAD_AID, so '+' / spaces drop
    # and a normalized E.164 becomes the exact digit string the pad receives.
    num = mod._normalize("+1 (404) 555-1212")
    digits = "".join(ch for ch in num if ch in mod._PAD_AID)
    assert_true(digits == "14045551212", f"expected 14045551212, got {digits!r}")


def main():
    mod = load_module()
    tests = [
        test_normalize,
        test_summary_detects_call_state,
        test_best_call_button_prefers_exact_label,
        test_pad_aid_covers_all_dialables,
        test_digit_extraction_strips_plus,
    ]
    for fn in tests:
        fn(mod)
        print(f"PASS {fn.__name__}")
    print("phone_link_dial smoke passed")


if __name__ == "__main__":
    main()
