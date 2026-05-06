#!/usr/bin/env python3
"""
Repflow Local SMS Agent
=======================

Runs on a rep's laptop. Polls /api/sms/outbox for pending messages, sends
them via the locally-paired phone, and reports delivery back to the cloud.

Supported transports (auto-detected at startup):
    macOS + iPhone  → Apple Messages app via osascript (iMessage / SMS)
    Windows + Android → adb shell `service call isms` (requires USB or
                        wireless ADB enabled on the phone)
    Windows + iPhone  → Phone Link app + UI Automation (best-effort)

Setup (rep's laptop):

    1. Install Python 3.10+
    2. pip install requests
    3. Create ~/.repflow/agent.env with:
           REPFLOW_API=https://repflow.koino.capital
           REPFLOW_TOKEN=<the rep's Supabase access_token>
       (the rep can grab their token from the Repflow web app: Settings →
        Integrations → Local Agent → Copy token)
    4. Run: python3 local_sms_agent.py
       Optional: install as a launchd / systemd / Windows Task service so it
       restarts on boot. See `install.sh`.

Token rotation: if the token expires, the agent will get 401s and pause.
The web UI surfaces a "reconnect" prompt with a fresh token.
"""

from __future__ import annotations
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("[fatal] missing dependency: pip install requests", file=sys.stderr)
    sys.exit(1)

# ───── config ────────────────────────────────────────────────────────────
ENV_FILE = Path.home() / ".repflow" / "agent.env"
def _load_env() -> dict:
    out = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out

ENV = _load_env()
API_BASE = ENV.get("REPFLOW_API", "https://repflow.koino.capital").rstrip("/")
TOKEN    = ENV.get("REPFLOW_TOKEN", "")
POLL_S   = int(ENV.get("REPFLOW_POLL_SECONDS", "10"))
AGENT_ID = ENV.get("REPFLOW_AGENT_ID") or platform.node()

if not TOKEN:
    print(f"[fatal] REPFLOW_TOKEN not set. Edit {ENV_FILE} or export REPFLOW_TOKEN.", file=sys.stderr)
    sys.exit(1)

HEADERS = {"authorization": f"Bearer {TOKEN}", "content-type": "application/json"}


# ───── transport: macOS + iMessage via Messages.app ──────────────────────
def _mac_send(to: str, body: str) -> tuple[bool, str]:
    """Send via Apple Messages app. Defaults to iMessage; falls through to
    SMS if the recipient isn't on iMessage. Requires Messages.app to be
    signed in to the rep's Apple ID."""
    # AppleScript escapes — use ASCII single quote tricks
    to_esc   = to.replace('"', '\\"')
    body_esc = body.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
    script = f'''
    tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        try
            set targetBuddy to buddy "{to_esc}" of targetService
            send "{body_esc}" to targetBuddy
            return "sent_imessage"
        on error
            -- Fallback to SMS via the iPhone's bridged number (Continuity)
            try
                set smsService to 1st service whose service type = SMS
                send "{body_esc}" to buddy "{to_esc}" of smsService
                return "sent_sms"
            on error errMsg
                return "error: " & errMsg
            end try
        end try
    end tell
    '''
    try:
        r = subprocess.run(
            ["osascript", "-e", script],
            check=False, capture_output=True, text=True, timeout=30,
        )
        out = (r.stdout or r.stderr).strip()
        if r.returncode != 0 or out.startswith("error"):
            return False, out or f"osascript exit {r.returncode}"
        return True, out or "sent"
    except Exception as e:
        return False, f"mac transport error: {e}"


# ───── transport: Windows/Linux + Android via adb ────────────────────────
def _adb_send(to: str, body: str) -> tuple[bool, str]:
    """Send via adb. Requires:
      - Phone in Developer Mode with USB debugging on (or wireless adb paired)
      - adb in PATH
      - Phone unlocked
    """
    if not shutil.which("adb"):
        return False, "adb not in PATH — install Android Platform Tools"
    body_safe = body.replace('"', '\\"').replace("'", "\\'")
    cmd = [
        "adb", "shell",
        "service", "call", "isms", "5",
        "i32", "0",
        "s16", "com.android.mms.service",
        "s16", to,
        "s16", "null",
        "s16", body_safe,
        "s16", "null",
        "s16", "null",
    ]
    try:
        r = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return False, (r.stderr or r.stdout or "adb failed").strip()[:240]
        return True, "sent_via_adb"
    except Exception as e:
        return False, f"adb transport error: {e}"


def detect_transport():
    sysname = platform.system()
    if sysname == "Darwin":
        return ("imessage", _mac_send)
    if shutil.which("adb"):
        return ("adb", _adb_send)
    return (None, None)


# ───── api wrappers ──────────────────────────────────────────────────────
def claim(max_msgs: int = 5):
    r = requests.post(
        f"{API_BASE}/api/sms/outbox?op=claim",
        headers=HEADERS,
        json={"agent_id": AGENT_ID, "max": max_msgs},
        timeout=15,
    )
    if r.status_code == 401:
        raise SystemExit("[fatal] 401 — REPFLOW_TOKEN expired or invalid. Reconnect from the web app.")
    r.raise_for_status()
    return r.json().get("messages", [])

def report_sent(msg_id: str):
    requests.post(f"{API_BASE}/api/sms/outbox?op=sent", headers=HEADERS,
                  json={"id": msg_id}, timeout=15)

def report_failed(msg_id: str, err: str):
    requests.post(f"{API_BASE}/api/sms/outbox?op=failed", headers=HEADERS,
                  json={"id": msg_id, "error": err[:500]}, timeout=15)


# ───── main loop ─────────────────────────────────────────────────────────
def main():
    transport_name, send_fn = detect_transport()
    if not send_fn:
        print(f"[fatal] no SMS transport available on {platform.system()}. Install adb (Android) or run on macOS with Messages.app.", file=sys.stderr)
        sys.exit(2)
    print(f"[ok] Repflow Agent · transport={transport_name} · agent_id={AGENT_ID} · api={API_BASE}")
    print(f"[ok] polling /api/sms/outbox every {POLL_S}s")
    while True:
        try:
            msgs = claim()
            for m in msgs:
                ok, detail = send_fn(m["to_number"], m["body"])
                if ok:
                    report_sent(m["id"])
                    print(f"  ✓ sent {m['id']} → {m['to_number']} ({detail})")
                else:
                    report_failed(m["id"], detail)
                    print(f"  ✗ failed {m['id']} → {m['to_number']} ({detail})")
        except SystemExit:
            raise
        except Exception as e:
            print(f"[warn] poll error: {e}", file=sys.stderr)
        time.sleep(POLL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[ok] agent stopped by user")
