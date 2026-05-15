"""phone_link_inspect — dump Phone Link's UIA element tree.

One-shot diagnostic tool. Agent runs it, posts the tree as result. We use
the output to find the real AutomationId / Name of Phone Link's dialer
Edit + Call button + Calls tab so phone_link_dial.py can target them
deterministically (no focus-state dependency).

Payload: { max_depth?: 8 }
Returns: { elements: [{depth, control_type, name, automation_id, class_name, rect}, ...] }
"""
from __future__ import annotations
import sys, time, os, subprocess

REQUIRED_CAPS = ["local.dial_twilio"]


def _open_phone_link():
    try:
        os.startfile("ms-phone:")
    except OSError:
        pass
    try:
        subprocess.Popen(
            ["explorer.exe", "shell:AppsFolder\\Microsoft.YourPhone_8wekyb3d8bbwe!App"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass
    time.sleep(2)


def run(payload, ctx):
    if sys.platform != "win32":
        return {"status": "platform_unsupported"}

    try:
        from pywinauto import Application
    except ImportError:
        return {"status": "no_pywinauto"}

    _open_phone_link()
    max_depth = int(payload.get("max_depth") or 8)

    try:
        app = Application(backend="uia").connect(title="Phone Link", timeout=8)
        win = app.window(title="Phone Link")
    except Exception as e:
        return {"status": "phone_link_window_not_found", "error": str(e)}

    # Empirically learned 2026-05-15: Phone Link tabs use AutomationIds
    #   ChatNodeAutomationId (Messages) | CallingNodeAutomationId (Calls)
    # Default-launched view is Messages — click Calls so the inspector
    # captures the dialer Edit, Call button, and call-history list.
    nav_to = (payload.get("navigate_to") or "calls").lower()
    nav_id = {"calls": "CallingNodeAutomationId",
              "messages": "ChatNodeAutomationId",
              "settings": "SettingsNodeAutomationId"}.get(nav_to)
    nav_status = "skipped"
    if nav_id:
        try:
            tab = win.child_window(auto_id=nav_id, control_type="TabItem")
            tab.wait("exists enabled visible", timeout=4)
            tab.click_input()
            time.sleep(1.5)
            nav_status = f"clicked {nav_id}"
        except Exception as e:
            nav_status = f"navigate failed: {str(e)[:120]}"

    elements = []
    def _walk(node, depth):
        if depth > max_depth: return
        try:
            info = node.element_info
            elements.append({
                "depth": depth,
                "control_type": str(getattr(info, "control_type", "") or ""),
                "name": str(getattr(info, "name", "") or "")[:120],
                "automation_id": str(getattr(info, "automation_id", "") or "")[:120],
                "class_name": str(getattr(info, "class_name", "") or "")[:80],
                "rect": _rect(getattr(info, "rectangle", None)),
            })
        except Exception:
            return
        try:
            for c in node.children():
                _walk(c, depth + 1)
        except Exception:
            return

    def _rect(r):
        try: return [r.left, r.top, r.right, r.bottom]
        except Exception: return None

    try:
        _walk(win, 0)
    except Exception as e:
        return {"status": "walk_failed", "error": str(e), "partial": len(elements)}

    # Filter to interesting elements (Edit, Button, TabItem) — full dump can
    # be huge. Keep the rest as count-only so the agent's response stays
    # under reasonable size.
    interesting = [
        e for e in elements
        if e["control_type"] in ("Edit", "Button", "TabItem", "ListItem", "Hyperlink")
        or "dial" in e["name"].lower()
        or "call" in e["name"].lower()
        or "search" in e["name"].lower()
    ]
    return {
        "status": "ok",
        "navigate_to": nav_to,
        "navigation": nav_status,
        "total_elements": len(elements),
        "interesting_elements": interesting,
        "note": "interesting_elements filtered to Edit/Button/TabItem/ListItem/Hyperlink + anything with dial/call/search in the name",
    }
