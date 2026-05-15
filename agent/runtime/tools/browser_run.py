"""browser_run — open a URL via the agent's Playwright browser. Allowlist-gated.

Payload: { url, action: 'open'|'screenshot'|'extract_text', selector? }
"""
from __future__ import annotations
import sys
from pathlib import Path

REQUIRED_CAPS = ["local.browser_general"]
RATE_BUCKET = "browser"

ALLOWLIST_PREFIXES = (
    "https://app.fathom.video", "https://www.linkedin.com",
    "https://business.facebook.com", "https://business.instagram.com",
    "https://www.salesnav.com", "https://app.sendblue.co",
)


def run(payload, ctx):
    url = payload.get("url")
    if not url: raise ValueError("url required")
    if not any(url.startswith(p) for p in ALLOWLIST_PREFIXES):
        return {"status": "denied", "reason": f"url not on allowlist: {url}"}
    action = payload.get("action") or "open"

    # Reuse quote_agent's persistent browser primitive — it already handles
    # per-target storage_state.
    agent_dir = Path(__file__).resolve().parents[2]
    if str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))
    qa = __import__("quote_agent")

    target = url.split("/", 3)[2].replace(".", "_")
    p, context = qa.get_browser(headless=True, carrier=target, persistent=True)
    try:
        page = context.new_page()
        page.goto(url, timeout=30000)
        out = {"url": url, "title": page.title()}
        if action == "screenshot":
            shot_path = qa.BROWSER_STATE_DIR / target / "last.png"
            page.screenshot(path=str(shot_path))
            out["screenshot_path"] = str(shot_path)
        elif action == "extract_text":
            sel = payload.get("selector") or "body"
            try:
                out["text"] = page.locator(sel).inner_text(timeout=5000)[:5000]
            except Exception as e:
                out["text_error"] = str(e)[:200]
        return out
    finally:
        try: context.close()
        except Exception: pass
        try: p.stop()
        except Exception: pass
