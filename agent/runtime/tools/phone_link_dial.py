"""phone_link_dial — outbound call(s) via Microsoft Phone Link.

Production-grade implementation:
  1. Open Phone Link (ms-phone: + AUMID launch).
  2. UIA-navigate to Calls tab via auto_id 'CallingNodeAutomationId'
     (learned from phone_link_inspect 2026-05-15).
  3. Locate the dialer Edit (provider-version-tolerant: tries multiple
     selectors), type the number, click Call (or press Enter).
  4. If multi-dial requested: loop dial_count times, sleeping
     dial_interval_seconds between attempts, polling rba_commands
     for a `cancel_dial` request that targets this command.

Payload:
  {
    to_number:       "+19312522222",
    lead_id?:        "uuid",
    auto_dial:       false,         # default false → posts confirmation first
    method?:         "auto",        # auto | uia | sendinput | uri_only
    dial_count?:     1,             # 1-5: how many attempts
    dial_interval_seconds?: 15,     # 5-120: gap between attempts
    stop_on?:        "manual"       # manual (only stop on cancel) — call
                                    # status feedback isn't available from
                                    # Phone Link, so 'answered' would be a
                                    # lie. Just 'manual' for now.
  }

Returns:
  { status, attempts: [{ at, result, error? }, ...], final_status,
    cancelled, to_number, method_used }

Cancellation:
  Caller posts a separate rba_command with kind='cancel_dial' and
  payload={dial_command_id: <this command's id>}. Between attempts the
  tool checks for a queued cancel_dial via the
  /api/agent/cancel-check endpoint.
"""
from __future__ import annotations
import os, re, sys, time, subprocess
import requests as _r

REQUIRED_CAPS = ["local.dial_twilio"]
RATE_BUCKET = "dial"

E164_RE = re.compile(r"^\+?[1-9]\d{6,14}$")

# Verified via phone_link_inspect on PLATINUM 2026-05-15
PHONE_LINK_TAB_IDS = {
    "calls":    "CallingNodeAutomationId",
    "messages": "ChatNodeAutomationId",
    "settings": "SettingsNodeAutomationId",
}


def _normalize(num: str) -> str | None:
    if not num: return None
    s = re.sub(r"[^\d+]", "", num)
    if s.startswith("+") and E164_RE.match(s): return s
    if len(s) == 10: return "+1" + s
    if len(s) == 11 and s.startswith("1"): return "+" + s
    return None


def _phone_link_hwnd():
    """Find Phone Link window. Returns hwnd or None.
    Tries exact match first, then substring match — Windows updates have
    been known to suffix the title with notification counts, document
    state, etc. (`'Phone Link - Calls'`, `'(2) Phone Link'`)."""
    import ctypes
    user32 = ctypes.windll.user32
    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    exact = []; partial = []
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd): return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n == 0: return True
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        t = buf.value
        if t == "Phone Link":
            exact.append(hwnd)
        elif "Phone Link" in t:
            partial.append((hwnd, t))
        return True
    user32.EnumWindows(EnumWindowsProc(cb), 0)
    if exact: return exact[0]
    if partial: return partial[0][0]
    return None


def _open_phone_link():
    """Ensure Phone Link is visible. If already running, skip launch.
    Otherwise try ms-phone: URI then the AppsFolder shell command, polling
    up to 6s for the window to appear."""
    if _phone_link_hwnd() is not None:
        return True
    try: os.startfile("ms-phone:")
    except OSError: pass
    try:
        subprocess.Popen(
            ["explorer.exe", "shell:AppsFolder\\Microsoft.YourPhone_8wekyb3d8bbwe!App"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception: pass
    deadline = time.time() + 6.0
    while time.time() < deadline:
        if _phone_link_hwnd() is not None:
            time.sleep(0.4)   # let UI settle past splash
            return True
        time.sleep(0.25)
    return False


def _check_cancel(api_base: str, token: str, dial_command_id: str | None) -> bool:
    """Poll the cancel endpoint. Returns True if a cancel_dial command
    targeting dial_command_id is queued (and we should stop)."""
    if not dial_command_id: return False
    try:
        r = _r.get(
            f"{api_base}/api/agent/cancel-check",
            headers={"x-agent-token": token},
            params={"dial_command_id": dial_command_id},
            timeout=5,
        )
        if r.status_code == 200:
            return bool(r.json().get("cancelled"))
    except Exception:
        pass
    return False


def _try_uia(num: str) -> tuple[bool, str, str]:
    """Returns (ok, method_detail, button_used)."""
    try:
        from pywinauto import Application
    except ImportError:
        return False, "pywinauto not installed", ""

    try:
        app = Application(backend="uia").connect(title="Phone Link", timeout=5)
        win = app.window(title="Phone Link")
    except Exception as e:
        return False, f"connect failed: {e}", ""

    # 1. Click Calls tab
    try:
        tab = win.child_window(auto_id=PHONE_LINK_TAB_IDS["calls"], control_type="TabItem")
        tab.wait("exists enabled visible", timeout=4)
        tab.click_input()
        time.sleep(1.0)
    except Exception as e:
        return False, f"calls tab click failed: {e}", ""

    # 2. Find the dialer Edit. Try multiple selectors — Phone Link's
    # version-to-version stability is sketchy. Targets in order of preference:
    #   - title="Search your contacts" / "Search contacts or enter number"
    #   - any Edit child of the Calls panel
    edit = None
    edit_label = None
    for label in ("Search your contacts", "Search contacts or enter number",
                  "Search contacts, enter number", "Dial pad"):
        try:
            cand = win.child_window(title=label, control_type="Edit")
            if cand.exists(timeout=1):
                edit = cand; edit_label = f"title='{label}'"
                break
        except Exception:
            continue
    if edit is None:
        # Fallback: find ANY Edit on the Calls panel
        try:
            for e in win.descendants(control_type="Edit"):
                edit = e; edit_label = "first descendant Edit"
                break
        except Exception:
            pass
    if edit is None:
        return False, "couldn't find dialer Edit", ""

    # 3. Focus + type the number
    try:
        edit.set_focus()
        time.sleep(0.2)
        # Clear any previous text (select-all + delete)
        try: edit.type_keys("^a", with_spaces=False, pause=0.05)
        except Exception: pass
        try: edit.type_keys("{DELETE}", pause=0.05)
        except Exception: pass
        edit.type_keys(num.lstrip("+"), with_spaces=False, pause=0.04)
        time.sleep(0.3)
    except Exception as e:
        return False, f"type failed via {edit_label}: {e}", edit_label

    # 4. Click Call button if present, else press Enter
    btn_used = "enter"
    try:
        for btn_label in ("Call", "Call number", "Place call"):
            try:
                btn = win.child_window(title=btn_label, control_type="Button")
                if btn.exists(timeout=1):
                    btn.click_input(); btn_used = f"button '{btn_label}'"
                    return True, f"uia: dialer found via {edit_label}, dialed via {btn_used}", btn_used
            except Exception:
                continue
        # Fallback: press Enter on the focused dialer
        edit.type_keys("{ENTER}")
        return True, f"uia: dialer found via {edit_label}, dialed via Enter", btn_used
    except Exception as e:
        return False, f"call button click failed: {e}", btn_used


def _bring_to_foreground():
    import ctypes
    hwnd = _phone_link_hwnd()
    if hwnd is None: return False
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)              # SW_RESTORE
    # SetForegroundWindow can fail when the calling process isn't
    # foreground itself — works fine from a Scheduled-Task python.
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.4)
    return True


def _send_digits(digits: str):
    import ctypes
    user32 = ctypes.windll.user32
    VK = {str(i): 0x30 + i for i in range(10)}
    for ch in digits:
        if ch == "+": continue
        vk = VK.get(ch)
        if vk is None: continue
        user32.keybd_event(vk, 0, 0, 0); time.sleep(0.04)
        user32.keybd_event(vk, 0, 0x0002, 0); time.sleep(0.06)
    time.sleep(0.3)
    user32.keybd_event(0x0D, 0, 0, 0)
    user32.keybd_event(0x0D, 0, 0x0002, 0)


def _dial_once(num: str, method: str) -> dict:
    if not _open_phone_link():
        return {"status": "phone_link_launch_failed",
                "fix": "Open Microsoft Phone Link manually once — agent then keeps it warm."}
    if method in ("auto", "uia"):
        ok, detail, _ = _try_uia(num)
        if ok:
            return {"status": "dialed_via_phone_link", "method_used": "uia", "detail": detail}
        if method == "uia":
            return {"status": "uia_failed", "detail": detail}
    if method in ("auto", "sendinput"):
        if not _bring_to_foreground():
            return {"status": "phone_link_window_not_found"}
        digits = num.lstrip("+")
        if digits.startswith("1") and len(digits) == 11:
            digits = digits[1:]
        _send_digits(digits)
        return {"status": "dialed_via_phone_link", "method_used": "sendinput",
                "digits_sent": digits,
                "note": "sendinput is best-effort — call connects only if Phone Link's dialer field had focus when keystrokes arrived"}
    return {"status": "phone_link_opened_uri_only"}


def run(payload, ctx):
    if sys.platform != "win32":
        return {"status": "platform_unsupported"}

    raw = payload.get("to_number")
    num = _normalize(raw)
    if not num:
        raise ValueError(f"to_number invalid (got {raw!r})")

    method = (payload.get("method") or "auto").lower()
    auto = bool(payload.get("auto_dial"))
    count = max(1, min(5, int(payload.get("dial_count") or 1)))
    interval = max(5, min(120, int(payload.get("dial_interval_seconds") or 15)))

    if not auto:
        r = _r.post(
            f"{ctx['api_base']}/api/agent/confirmation-request",
            headers={"x-agent-token": ctx["token"], "content-type": "application/json"},
            json={
                "action": "send_real_sms",   # treated as high-risk for routing
                "description": (f"Phone Link dial to {num}" +
                                (f" ({count}× every {interval}s)" if count > 1 else "")),
                "args_redacted": {"channel": "phone_link", "to": num,
                                  "lead_id": payload.get("lead_id"),
                                  "method": method, "count": count, "interval_s": interval},
                "channel": "any",
            }, timeout=8,
        )
        if r.status_code != 200:
            return {"status": "error", "error": f"confirmation HTTP {r.status_code}"}
        return {"status": "awaiting_confirmation",
                "to_number": num,
                "confirmation_id": r.json().get("confirmation_id")}

    dial_command_id = payload.get("__command_id")  # injected by dispatcher; agent's runtime adds it
    attempts = []
    cancelled = False
    for i in range(count):
        if i > 0:
            # sleep in 1s slices so cancel-check is responsive
            for _ in range(interval):
                if _check_cancel(ctx["api_base"], ctx["token"], dial_command_id):
                    cancelled = True; break
                time.sleep(1)
            if cancelled: break
        attempt = _dial_once(num, method)
        attempt["at"] = time.time()
        attempt["attempt_number"] = i + 1
        attempts.append(attempt)
        # If the dial primitive itself errored, stop the loop early
        if attempt.get("status") not in ("dialed_via_phone_link", "phone_link_opened_uri_only"):
            break

    return {
        "status": "cancelled" if cancelled else (
            "dialed_via_phone_link" if attempts and attempts[-1].get("status") == "dialed_via_phone_link"
            else "failed"),
        "to_number": num,
        "method_requested": method,
        "method_used": attempts[-1].get("method_used") if attempts else None,
        "dial_count_requested": count,
        "dial_interval_seconds": interval,
        "attempts": attempts,
        "cancelled": cancelled,
    }
