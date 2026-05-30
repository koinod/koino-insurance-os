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

CALL_BUTTON_EXACT = {
    "call",
    "call number",
    "call now",
    "place call",
    "dial",
}

CALL_STATE_RX = re.compile(
    r"\b(calling|dialing|ringing|connecting|connected|in call|call in progress|"
    r"end call|hang up|disconnect)\b",
    re.IGNORECASE,
)


def _norm_text(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _snapshot_tree(node, max_depth: int = 4):
    elements = []

    def _walk(cur, depth):
        if depth > max_depth:
            return
        try:
            info = cur.element_info
            elements.append({
                "depth": depth,
                "control_type": _norm_text(getattr(info, "control_type", "")),
                "name": _norm_text(getattr(info, "name", "")),
                "automation_id": _norm_text(getattr(info, "automation_id", "")),
                "class_name": _norm_text(getattr(info, "class_name", "")),
            })
        except Exception:
            return
        try:
            for child in cur.children():
                _walk(child, depth + 1)
        except Exception:
            return

    _walk(node, 0)
    return elements


def _summarize_snapshot(elements):
    summary = {
        "call_buttons": [],
        "call_state_hits": [],
        "edit_hits": [],
        "tabs": [],
    }
    for el in elements or []:
        ctype = _norm_text(el.get("control_type")).lower()
        name = _norm_text(el.get("name"))
        aid = _norm_text(el.get("automation_id"))
        class_name = _norm_text(el.get("class_name"))
        hay = " ".join([name, aid, class_name]).strip()
        hay_l = hay.lower()

        if ctype == "button":
            if name.lower() in CALL_BUTTON_EXACT:
                summary["call_buttons"].append(el)
            elif "call" in hay_l and "end call" not in hay_l and "hang up" not in hay_l:
                summary["call_buttons"].append(el)

        if ctype == "edit":
            summary["edit_hits"].append(el)

        if "callingnodeautomationid" in aid.lower():
            summary["tabs"].append(el)

        if CALL_STATE_RX.search(hay):
            summary["call_state_hits"].append(el)

    summary["verified"] = bool(summary["call_state_hits"])
    summary["best_call_button"] = summary["call_buttons"][0] if summary["call_buttons"] else None
    return summary


def _best_call_button(win):
    try:
        buttons = win.descendants(control_type="Button")
    except Exception:
        buttons = []
    scored = []
    for btn in buttons:
        try:
            info = btn.element_info
            name = _norm_text(getattr(info, "name", ""))
            aid = _norm_text(getattr(info, "automation_id", ""))
            hay = f"{name} {aid}".strip().lower()
        except Exception:
            continue
        score = 0
        if name.lower() in CALL_BUTTON_EXACT:
            score = 100
        elif "call" in hay and "end call" not in hay and "hang up" not in hay:
            score = 80
        elif "dial" in hay:
            score = 60
        if score > 0:
            scored.append((score, name, btn))
    if not scored:
        return None, None
    scored.sort(key=lambda item: (-item[0], item[1]))
    top = scored[0][2]
    return top, scored[0][1]


def _activate_control(control):
    if control is None:
        raise ValueError("missing control")
    for method_name in ("invoke", "click_input"):
        try:
            method = getattr(control, method_name)
            method()
            return method_name
        except Exception:
            continue
    try:
        control.set_focus()
        control.type_keys("{ENTER}")
        return "enter"
    except Exception as e:
        raise RuntimeError(str(e))


def _verify_call_started(win, timeout_s: float = 5.0):
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        snapshot = _snapshot_tree(win, max_depth=4)
        summary = _summarize_snapshot(snapshot)
        last = summary
        if summary["verified"]:
            return True, f"call state detected: {summary['call_state_hits'][0].get('name') or summary['call_state_hits'][0].get('automation_id')}", summary
        time.sleep(0.35)
    return False, "no call-state indicator found after activation", last or {"verified": False}


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
    """Ensure Phone Link has a *visible, foreground* window ready for UIA.

    The subtlety that produced 'phone_link_window_not_found' failures
    (verified empirically on PLATINUM 2026-05-29): when PhoneExperienceHost
    is already running but minimized to the system tray, its only top-level
    window is an INVISIBLE 'GDI+ Window (PhoneExperienceHost.exe)'. There is
    no visible window titled 'Phone Link' to drive, so an early
    `if _phone_link_hwnd() is not None: return True` check both (a) returns
    True off a stale/invisible match and (b) never surfaces the real UI.

    Fix: ALWAYS re-summon the UI via the ms-phone: protocol — it's
    idempotent (focuses the running instance, never hangs up an active
    call) and reliably materializes the visible 'Phone Link' window from a
    tray-docked instance. Cold UI spin-up regularly exceeds 6s, so we poll
    up to 15s, then bring the window to the foreground so the subsequent
    click_input/type_keys land on it instead of whatever was focused (the
    browser)."""
    # Always nudge the app — surfaces the window whether cold-started or
    # tray-docked. Do NOT early-return on a pre-existing hwnd: a tray
    # instance's only window is the invisible GDI+ surrogate.
    try:
        os.startfile("ms-phone:")
    except OSError:
        try:
            subprocess.Popen(
                ["explorer.exe", "shell:AppsFolder\\Microsoft.YourPhone_8wekyb3d8bbwe!App"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass
    deadline = time.time() + 15.0   # cold UI spin-up regularly exceeds 6s
    while time.time() < deadline:
        if _phone_link_hwnd() is not None:
            time.sleep(0.6)            # let UI settle past splash
            _bring_to_foreground()     # so click_input/type_keys hit it
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


def _find_dialer_edit(win):
    """Locate the Calls-tab dial field. Returns (edit, label) or (None, None).
    Phone Link's selector stability is version-sketchy, so we try named
    candidates first, then fall back to the first Edit descendant."""
    for label in ("Search your contacts", "Search contacts or enter number",
                  "Search contacts, enter number", "Dial pad"):
        try:
            cand = win.child_window(title=label, control_type="Edit")
            if cand.exists(timeout=1):
                return cand, f"title='{label}'"
        except Exception:
            continue
    try:
        for e in win.descendants(control_type="Edit"):
            return e, "first descendant Edit"
    except Exception:
        pass
    return None, None


# Markers Phone Link shows when its Bluetooth voice link to the phone has
# dropped — the Calls tab then renders this state INSTEAD of the dial pad,
# so there is no Edit to type into. Verified live on PLATINUM 2026-05-29:
# "We weren't able to connect to your mobile device" + a "Try again" button.
_CALLING_DISCONNECT_RX = re.compile(
    r"(weren.?t able to connect|couldn.?t connect|unable to connect|"
    r"resume set.?up|toggling bluetooth|reconnect|not connected to)",
    re.IGNORECASE,
)


def _calling_disconnected(win) -> bool:
    try:
        for el in _snapshot_tree(win, max_depth=6) or []:
            if _CALLING_DISCONNECT_RX.search(_norm_text(el.get("name"))):
                return True
    except Exception:
        pass
    return False


def _try_reconnect_calling(win) -> bool:
    """When the Calls panel is in the disconnected state, click 'Try again'
    once to re-establish the Bluetooth calling link. Returns True if a
    reconnect button was activated."""
    if not _calling_disconnected(win):
        return False
    for name in ("Try again", "Try Again", "Reconnect", "Retry"):
        try:
            btn = win.child_window(title=name, control_type="Button")
            if btn.exists(timeout=1):
                try:
                    btn.click_input()
                except Exception:
                    try:
                        btn.invoke()
                    except Exception:
                        continue
                return True
        except Exception:
            continue
    return False


def _try_uia(num: str) -> tuple[bool, str, str, dict, str]:
    """Returns (ok, method_detail, button_used, verification, stage)."""
    try:
        from pywinauto import Application
    except ImportError:
        return False, "pywinauto not installed", "", {"verified": False}, "preflight_failed"

    try:
        app = Application(backend="uia").connect(title="Phone Link", timeout=5)
        win = app.window(title="Phone Link")
    except Exception as e:
        return False, f"connect failed: {e}", "", {"verified": False}, "preflight_failed"

    # 1. Click Calls tab
    try:
        tab = win.child_window(auto_id=PHONE_LINK_TAB_IDS["calls"], control_type="TabItem")
        tab.wait("exists enabled visible", timeout=4)
        tab.click_input()
        time.sleep(1.0)
    except Exception as e:
        return False, f"calls tab click failed: {e}", "", {"verified": False}, "preflight_failed"

    # 2. Find the dialer Edit, polling across a settle window. The Calls
    # panel renders the dial field lazily, and — critically — does NOT
    # render it at all when Phone Link's Bluetooth voice link to the phone
    # has dropped (it shows a "We weren't able to connect / Try again"
    # state instead). So: poll for the Edit; if we instead see the
    # disconnected state, click "Try again" once and keep polling.
    edit = None
    edit_label = None
    tried_reconnect = False
    deadline = time.time() + 12.0
    while time.time() < deadline:
        edit, edit_label = _find_dialer_edit(win)
        if edit is not None:
            break
        if not tried_reconnect and _try_reconnect_calling(win):
            tried_reconnect = True
            time.sleep(3.0)   # give the reconnect a beat to render the pad
            continue
        time.sleep(0.6)
    if edit is None:
        if _calling_disconnected(win):
            return (False,
                    "Phone Link calling is disconnected from the phone — no "
                    "dial pad rendered ('Try again' state shown)"
                    + (", reconnect attempted" if tried_reconnect else ""),
                    "", {"verified": False}, "calling_disconnected")
        return False, "couldn't find dialer Edit", "", {"verified": False}, "preflight_failed"

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
        return False, f"type failed via {edit_label}: {e}", edit_label, {"verified": False}, "preflight_failed"

    # 4. Commit the typed number, then click Call if present.
    # Phone Link often needs Enter first so the typed contact/number is
    # accepted before the Call button becomes active.
    btn_used = "enter"
    verification = {"verified": False}
    try:
        for target in (edit, win):
            try:
                target.type_keys("{ENTER}")
                time.sleep(0.25)
            except Exception:
                pass

        btn, btn_name = _best_call_button(win)
        if btn is None:
            # Give the UI a brief beat to enable the call action after Enter.
            time.sleep(0.8)
            btn, btn_name = _best_call_button(win)
        if btn is None:
            return False, f"couldn't find callable dial button after Enter via {edit_label}", edit_label, {"verified": False}, "preflight_failed"

        btn_used = f"button '{btn_name}'"
        activation = _activate_control(btn)
        time.sleep(0.5)
        ok, detail, verification = _verify_call_started(win, timeout_s=5.0)
        if not ok:
            return False, f"call button activated via {activation} but no call state detected: {detail}", btn_used, verification, "verify_failed"
        return True, f"uia: dialer found via {edit_label}, dialed via {btn_used} ({activation}); {detail}", btn_used, verification, "dialed"
    except Exception as e:
        return False, f"call button click failed: {e}", btn_used, verification, "preflight_failed"


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


# ── Power-dialer outcome monitoring ────────────────────────────────────────
# Phone Link reports NO call status via API — but its UIA tree does. When a
# call connects, an "End call"/"Hang up"/"Mute"/"Keypad"/"Speaker" control or a
# running m:ss duration timer appears; when the call ends, the view returns to
# the idle dialer. We read that so the web autodialer can auto-advance the
# list. Bias is deliberately conservative: we only return "no_answer" on a
# HIGH-CONFIDENCE signal (the call view closed back to the dialer without ever
# connecting). Anything ambiguous → "connected", which makes the rep
# disposition it by hand — we never auto-skip a call that might be live.

_CONNECTED_RX = re.compile(
    r"\b(end call|hang ?up|mute|unmute|keypad|dial ?pad|speaker|add call|"
    r"hold|in call|call in progress|connected)\b", re.IGNORECASE)
_DURATION_RX = re.compile(r"\b\d{1,2}:\d{2}\b")   # 0:07 / 12:43 live call timer


def _connected_now(win) -> bool:
    """True if Phone Link currently shows an ACTIVE/connected call."""
    try:
        els = _snapshot_tree(win, max_depth=5)
    except Exception:
        return False
    for el in els or []:
        hay = " ".join([_norm_text(el.get("name")), _norm_text(el.get("automation_id"))])
        if _CONNECTED_RX.search(hay):
            return True
        if _norm_text(el.get("control_type")).lower() == "text" and _DURATION_RX.search(hay):
            return True
    return False


def _monitor_outcome(win, answer_timeout: float = 35.0) -> str:
    """Watch the call UI right after a dial is placed. Returns
    'connected' | 'no_answer' | 'unknown'. Conservative — ambiguous maps to
    'connected' so a human dispositions; we never auto-skip a possibly-live
    call."""
    start = time.time()
    deadline = start + answer_timeout
    saw_call_ui = False
    while time.time() < deadline:
        try:
            if _connected_now(win):
                return "connected"
            saw_call_ui = saw_call_ui or _connected_now(win)
            edit, _lbl = _find_dialer_edit(win)
        except Exception:
            edit = None
        # High-confidence no-answer: after a few seconds of ring the call view
        # has closed back to the dialer field without ever connecting.
        if edit is not None and (time.time() - start) > 7:
            return "no_answer"
        time.sleep(0.8)
    # Rang the whole window with no detectable connect AND no return-to-dialer:
    # ambiguous (some PL layouts keep the dialer hidden mid-ring). Let a human
    # decide rather than risk skipping a live call.
    return "unknown"


def _dial_once(num: str, method: str, monitor: bool = False) -> dict:
    if not _open_phone_link():
        return {"status": "phone_link_launch_failed",
                "fix": "Open Microsoft Phone Link manually once — agent then keeps it warm."}
    if method in ("auto", "uia"):
        ok, detail, _, verification, stage = _try_uia(num)
        if ok:
            res = {"status": "dialed_via_phone_link", "method_used": "uia", "detail": detail, "verification": verification}
            if monitor:
                try:
                    from pywinauto import Application
                    app = Application(backend="uia").connect(title="Phone Link", timeout=4)
                    res["outcome_hint"] = _monitor_outcome(app.window(title="Phone Link"))
                except Exception as e:
                    res["outcome_hint"] = "unknown"
                    res["monitor_error"] = str(e)
            return res
        # Bluetooth calling link down — sendinput can't help (no dial pad
        # exists). Surface a crisp, actionable error instead of falling through.
        if stage == "calling_disconnected":
            return {"status": "phone_link_calling_disconnected", "detail": detail,
                    "fix": "Phone Link can't reach your phone's calling over Bluetooth. "
                           "Keep the phone nearby and unlocked, toggle its Bluetooth off/on, "
                           "then click 'Try again' on the Phone Link Calls tab."}
        if method == "uia":
            return {"status": "uia_failed", "detail": detail, "verification": verification, "stage": stage}
        if stage != "preflight_failed":
            return {"status": "verification_failed", "detail": detail, "verification": verification, "stage": stage}
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
    monitor = bool(payload.get("monitor"))   # power-dialer: watch call outcome

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
    any_success = False
    outcome_hint = None
    for i in range(count):
        if i > 0:
            # sleep in 1s slices so cancel-check is responsive
            for _ in range(interval):
                if _check_cancel(ctx["api_base"], ctx["token"], dial_command_id):
                    cancelled = True; break
                time.sleep(1)
            if cancelled: break
        attempt = _dial_once(num, method, monitor=monitor)
        attempt["at"] = time.time()
        attempt["attempt_number"] = i + 1
        attempts.append(attempt)
        status = attempt.get("status")
        if status in ("dialed_via_phone_link", "phone_link_opened_uri_only"):
            any_success = True
        elif status in ("phone_link_launch_failed", "phone_link_window_not_found", "uia_failed", "platform_unsupported", "phone_link_calling_disconnected"):
            # Setup/launch failures are fatal. A later retry won't help.
            break
        # Smart retry for back-to-back multi-dial: only ring again if NOBODY
        # picked up. If the call connected, stop — never dial over a live call.
        if monitor:
            hint = attempt.get("outcome_hint")
            if hint:
                outcome_hint = hint
            if hint == "connected":
                break

    return {
        "status": "cancelled" if cancelled else ("dialed_via_phone_link" if any_success else "failed"),
        "to_number": num,
        "method_requested": method,
        "method_used": attempts[-1].get("method_used") if attempts else None,
        "dial_count_requested": count,
        "dial_interval_seconds": interval,
        "attempts": attempts,
        "cancelled": cancelled,
        "outcome_hint": outcome_hint,   # connected | no_answer | unknown | None
    }
