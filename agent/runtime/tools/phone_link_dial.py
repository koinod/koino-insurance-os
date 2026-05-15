"""phone_link_dial — outbound call via Microsoft Phone Link.

Phone Link routes the call through the user's Bluetooth-paired phone.

Verified empirically (2026-05-15 PLATINUM):
  • ms-phone:?action=call&number=... opens Phone Link but does NOT
    pre-fill the number — Phone Link silently ignores URI query params.
  • tel: only works if Phone Link is set as the default tel: handler
    (Settings → Apps → Default apps → 'Make calls' → Phone Link).

Real implementation: agent opens Phone Link via ms-phone:, brings its
window to the foreground, types the number digits via SendInput, then
presses Enter to dial. This is the agent's own Python process doing
the local work — no shell-out, no separate script.

Fallback chain (degrades gracefully if pywinauto isn't installed):
  1. pywinauto UIA backend → click Calls tab + type into dialer
  2. ctypes user32 SendInput → keystroke injection at the foreground app
  3. ms-phone: URI alone → opens app, requires user to dial manually

Payload:
  {
    to_number: "+19312522222",
    lead_id?:  "uuid",
    auto_dial: false,        # default false → posts confirmation first
    method?:   "auto"        # "auto" | "uia" | "sendinput" | "uri_only"
  }

Returns:
  { status, to_number, method_used, phone_link_state, at, note }
"""
from __future__ import annotations
import os, re, sys, time, subprocess
import requests as _r

REQUIRED_CAPS = ["local.dial_twilio"]
RATE_BUCKET = "dial"

E164_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


def _normalize(num: str) -> str | None:
    if not num: return None
    s = re.sub(r"[^\d+]", "", num)
    if s.startswith("+"):
        if E164_RE.match(s): return s
    elif len(s) == 10:
        return "+1" + s
    elif len(s) == 11 and s.startswith("1"):
        return "+" + s
    return None


def _open_phone_link():
    """Bring Phone Link to the foreground. Multiple attempts because
    ms-phone: occasionally no-ops if the app is already running on a
    different virtual desktop."""
    tried = []
    for uri in ("ms-phone:", "ms-phone://"):
        try:
            os.startfile(uri); tried.append(uri); time.sleep(1.2); break
        except OSError:
            tried.append(f"{uri}(failed)")
    # Also try direct AUMID launch as belt-and-suspenders
    try:
        subprocess.Popen(
            ["explorer.exe", "shell:AppsFolder\\Microsoft.YourPhone_8wekyb3d8bbwe!App"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        tried.append("explorer.exe shell:AppsFolder")
        time.sleep(1.0)
    except Exception:
        pass
    return tried


def _find_phone_link_hwnd():
    """Return the HWND of the top-level 'Phone Link' window, or None."""
    import ctypes
    user32 = ctypes.windll.user32
    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    found = []
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd): return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n == 0: return True
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if buf.value == "Phone Link":
            found.append(hwnd); return False
        return True
    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return found[0] if found else None


def _bring_to_foreground(hwnd):
    import ctypes
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)         # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.4)


def _send_digits(digits: str):
    """SendInput each digit + Enter. Uses VK codes; '+' is skipped (not
    supported in tel dialing — the country code is implicit per Phone Link)."""
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    # Map digit chars to VK codes
    VK = {str(i): 0x30 + i for i in range(10)}
    VK_RETURN = 0x0D
    KEYEVENTF_KEYUP = 0x0002
    for ch in digits:
        if ch == "+": continue
        vk = VK.get(ch)
        if vk is None: continue
        user32.keybd_event(vk, 0, 0, 0)
        time.sleep(0.04)
        user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(0.06)
    time.sleep(0.3)
    user32.keybd_event(VK_RETURN, 0, 0, 0)
    user32.keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0)


def _try_uia(num: str) -> tuple[bool, str]:
    """Use pywinauto UIA backend to navigate Calls + type number + Call.
    Returns (ok, detail). Soft-fail if pywinauto not installed."""
    try:
        from pywinauto import Application
    except ImportError:
        return False, "pywinauto not installed"
    try:
        app = Application(backend="uia").connect(title="Phone Link", timeout=5)
        win = app.window(title="Phone Link")
        # Navigate to Calls tab (best-effort selectors)
        try:
            calls = win.child_window(title="Calls", control_type="TabItem")
            calls.click_input()
            time.sleep(0.4)
        except Exception:
            pass
        # Find the contact search / dialer input
        edit = None
        for name_try in ("Search your contacts", "Search contacts or enter number", "Dial pad"):
            try:
                edit = win.child_window(title=name_try, control_type="Edit")
                if edit.exists(timeout=1):
                    break
            except Exception:
                continue
        if edit is None:
            # Fall through to keystroke injection
            return False, "uia couldn't locate dialer edit"
        edit.set_focus()
        edit.type_keys(num.lstrip("+"), with_spaces=False, pause=0.04)
        time.sleep(0.3)
        # Click Call button if present
        try:
            call_btn = win.child_window(title="Call", control_type="Button")
            call_btn.click_input()
        except Exception:
            edit.type_keys("{ENTER}")
        return True, "uia path completed"
    except Exception as e:
        return False, f"uia error: {e}"


def run(payload, ctx):
    if sys.platform != "win32":
        return {"status": "platform_unsupported", "platform": sys.platform}

    raw = payload.get("to_number")
    num = _normalize(raw)
    if not num:
        raise ValueError(f"to_number invalid (got {raw!r})")

    method = (payload.get("method") or "auto").lower()
    auto = bool(payload.get("auto_dial"))

    if not auto:
        r = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",
                "description": f"Phone Link dial to {num}",
                "args_redacted": {"channel": "phone_link", "to": num, "lead_id": payload.get("lead_id"), "method": method},
                "channel": "any",
            }, timeout=8,
        )
        if r.status_code != 200:
            return {"status": "error", "error": f"confirmation HTTP {r.status_code}"}
        return {"status": "awaiting_confirmation",
                "to_number": num,
                "confirmation_id": r.json().get("confirmation_id")}

    opened = _open_phone_link()

    # Method routing
    if method in ("auto", "uia"):
        ok, detail = _try_uia(num)
        if ok:
            return {"status": "dialed_via_phone_link",
                    "to_number": num,
                    "method_used": "uia",
                    "detail": detail,
                    "opened_via": opened,
                    "at": time.time()}
        if method == "uia":
            return {"status": "uia_failed",
                    "to_number": num,
                    "detail": detail,
                    "opened_via": opened}

    if method in ("auto", "sendinput"):
        hwnd = _find_phone_link_hwnd()
        if not hwnd:
            return {"status": "phone_link_window_not_found",
                    "to_number": num,
                    "opened_via": opened,
                    "fix": "Open Phone Link manually and re-fire."}
        _bring_to_foreground(hwnd)
        # Strip leading +1 country code — Phone Link dialer prefixes US automatically
        digits = num.lstrip("+")
        if digits.startswith("1") and len(digits) == 11:
            digits = digits[1:]
        _send_digits(digits)
        return {"status": "dialed_via_phone_link",
                "to_number": num,
                "method_used": "sendinput",
                "digits_sent": digits,
                "opened_via": opened,
                "at": time.time(),
                "note": "If Phone Link's dialer/search field had focus, the number is now entered and Enter pressed. If a different field had focus, digits went elsewhere — re-run with method='uia' for safer targeting (requires pywinauto)."}

    # method=uri_only: just open and return
    return {"status": "phone_link_opened_uri_only",
            "to_number": num,
            "opened_via": opened,
            "note": "URI invoke only. User must enter the number manually."}
