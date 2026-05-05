#!/usr/bin/env python3
"""
smoke_demo.py — Playwright-driven walk of every page in koino-insurance-os
                /?demo=1 for each of the three sidebar roles.

For each (role, page) pair, captures:
  * screenshot at smoke-artifacts/{role}_{page}.png
  * console errors / warnings
  * any network requests that returned >= 400
  * JS exceptions raised during render

Writes a final markdown report to smoke-artifacts/SMOKE-REPORT.md.

Role switching is done by walking the React fiber tree to find the App's
`useTweaks` setter (no app code change required). Page navigation uses the
exposed `window.gotoPage(id)` helper.

Usage:
  python3 scripts/smoke_demo.py [--url <base>] [--headed]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

from playwright.sync_api import (
    Browser,
    BrowserContext,
    ConsoleMessage,
    Page,
    Request,
    Response,
    sync_playwright,
)

DEFAULT_URL = "https://koino-insurance-os.vercel.app/?demo=1"

# Mirrors NAV in shared.jsx exactly (verified 2026-05-04).
NAV = {
    # Mirrors shared.jsx NAV (post-2026-05-05 restructure).
    "rep": [
        ("today", "Today"),
        ("floor", "Floor"),
        ("messages", "Messages"),
        ("leaderboard", "Leaderboard"),
        ("library", "Library"),
    ],
    "manager": [
        ("today", "Today"),
        ("floor", "Floor"),
        ("crm", "CRM"),
        ("messages", "Messages"),
        ("team", "Team"),
        ("nigo", "NIGO Queue"),
        ("recruiting", "Recruiting"),
        ("pay", "Pay"),
        ("library", "Library"),
    ],
    "owner": [
        ("admin", "Admin"),
        ("pnl", "P&L"),
        ("org", "Org"),
        ("book", "Book"),
        ("floor", "Floor"),
        ("crm", "CRM"),
        ("recruiting", "Recruiting"),
        ("compliance", "Compliance"),
        ("library", "Library"),
    ],
    "ops": [
        ("connections", "Connections"),
    ],
}

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "smoke-artifacts"

# Find the App's useTweaks setter via the React fiber attached to <#root>.
#
# In React 18, the root DOM node is decorated with a __reactContainer$<randomKey>
# property that points at the FiberRootNode. From there:
#   FiberRootNode.current → HostRoot fiber
#     .child → AuthGate fiber (function component)
#       (walk children) → App fiber
# The App fiber's memoizedState is a singly-linked list of hooks. The first
# useState/useReducer/useCallback hook lives at memoizedState; .next chains the
# rest. useTweaks's `setValues` is the second hook on App (after the
# `[values, setValues] = React.useState(defaults)` call inside useTweaks).
#
# We tag the dispatcher with `setTweakKey(role, value)` once found and cache it
# on window for fast subsequent calls.
ROLE_INJECT_JS = r"""
(() => {
  if (window.__smokeSetTweak) return "cached";
  const root = document.getElementById("root");
  if (!root) return "no-root";
  const containerKey = Object.keys(root).find(k => k.startsWith("__reactContainer$"));
  if (!containerKey) return "no-container";
  // In React 18 createRoot, __reactContainer$<key> on the host node points
  // directly at the HostRoot fiber — not a FiberRootNode wrapper.
  const fiber = root[containerKey];
  if (!fiber) return "no-host-fiber";

  // BFS for a fiber whose memoizedState chain has ≥6 useState slots and one
  // of them holds an object with a "role" property (the tweaks values bag).
  const queue = [fiber];
  const seen = new Set();
  while (queue.length) {
    const f = queue.shift();
    if (!f || seen.has(f)) continue;
    seen.add(f);

    let hook = f.memoizedState;
    let idx = 0;
    while (hook && idx < 32) {
      const v = hook.memoizedState;
      if (v && typeof v === "object" && "role" in v && "page" in v) {
        // hook.queue.dispatch is the setter for this useState
        const dispatch = hook.queue && hook.queue.dispatch;
        if (typeof dispatch === "function") {
          window.__smokeSetTweak = (key, val) =>
            dispatch(prev => ({ ...prev, [key]: val }));
          return "ok";
        }
      }
      hook = hook.next;
      idx++;
    }
    if (f.child) queue.push(f.child);
    if (f.sibling) queue.push(f.sibling);
  }
  return "not-found";
})();
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--headed", action="store_true")
    parser.add_argument(
        "--page-settle-ms", type=int, default=1500,
        help="ms to wait after navigation before screenshot",
    )
    parser.add_argument(
        "--initial-load-ms", type=int, default=4500,
        help="ms to wait after first paint for in-browser Babel to compile",
    )
    args = parser.parse_args()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    findings: dict[tuple[str, str], dict] = {}

    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(
            headless=not args.headed,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx: BrowserContext = browser.new_context(
            viewport={"width": 1440, "height": 900},
            ignore_https_errors=True,
        )
        page: Page = ctx.new_page()

        active = {"role": None, "page": None}
        bucket: dict[str, list[str]] = defaultdict(list)

        def cell_key() -> str | None:
            r, p_ = active["role"], active["page"]
            return f"{r}/{p_}" if r and p_ else None

        def on_console(msg: ConsoleMessage) -> None:
            if msg.type not in ("error", "warning"):
                return
            ck = cell_key()
            if not ck:
                return
            text = msg.text
            # Filter noisy transient warnings the harness can't avoid.
            if "ResizeObserver loop" in text:
                return
            if "Babel" in text and "compiled" in text:
                return
            bucket[f"console:{ck}:{msg.type}"].append(text[:500])

        def on_pageerror(exc: Exception) -> None:
            ck = cell_key()
            if not ck:
                return
            bucket[f"pageerror:{ck}"].append(str(exc)[:500])

        def on_response(resp: Response) -> None:
            try:
                if resp.status >= 400:
                    ck = cell_key()
                    if not ck:
                        return
                    url = resp.url
                    # ignore third-party noise
                    if "vercel.app" not in url and "supabase.co" not in url:
                        return
                    bucket[f"net:{ck}"].append(f"{resp.status} {resp.request.method} {url[:200]}")
            except Exception:
                pass

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("response", on_response)

        print(f">> navigating to {args.url}")
        page.goto(args.url, wait_until="networkidle", timeout=45_000)

        # Wait for the demo identity hydration + Babel compile of all pages.
        # `window.me()` becomes non-null when /api/me returns; that's our gate.
        page.wait_for_function(
            "() => window.me && window.me() && window.me().rep_id",
            timeout=20_000,
        )
        # Give Babel a beat to finish compiling all the script[type=text/babel]
        # bundles. Babel compile is sequential; on a cold load this can take a
        # few seconds before window.gotoPage is wired up.
        page.wait_for_function(
            "() => typeof window.gotoPage === 'function'",
            timeout=20_000,
        )
        time.sleep(args.initial_load_ms / 1000.0)

        # Inject the role setter once.
        inject_status = page.evaluate(ROLE_INJECT_JS)
        print(f">> tweak-setter injection status: {inject_status}")
        if inject_status not in ("ok", "cached"):
            print(f"!! could not locate App tweaks setter ({inject_status}); "
                  "role switch will be skipped, smoke runs as owner only")

        roles_to_test = ["owner"]
        if inject_status in ("ok", "cached"):
            roles_to_test = ["owner", "manager", "rep"]

        for role in roles_to_test:
            print(f"\n>> role: {role}")
            if inject_status in ("ok", "cached"):
                page.evaluate(f"window.__smokeSetTweak('role', {role!r})")
                time.sleep(0.4)
            for pid, label in NAV[role]:
                active["role"] = role
                active["page"] = pid

                t0 = time.time()
                try:
                    page.evaluate(f"window.gotoPage({pid!r})")
                except Exception as e:
                    bucket[f"nav-error:{role}/{pid}"].append(str(e)[:300])

                # quick settle wait
                page.wait_for_load_state("networkidle", timeout=8_000)
                time.sleep(args.page_settle_ms / 1000.0)

                # Screenshot
                shot = ARTIFACT_DIR / f"{role}_{pid}.png"
                try:
                    page.screenshot(path=str(shot), full_page=False)
                except Exception as e:
                    bucket[f"screenshot-error:{role}/{pid}"].append(str(e)[:200])

                # Page text length sanity (catches blank renders)
                try:
                    text_len = page.evaluate("() => (document.querySelector('main')?.innerText || '').length")
                except Exception:
                    text_len = -1

                ms = int((time.time() - t0) * 1000)
                ck = f"{role}/{pid}"
                findings[(role, pid)] = {
                    "label": label,
                    "ms": ms,
                    "text_len": text_len,
                    "screenshot": str(shot.relative_to(ARTIFACT_DIR.parent)),
                    "errors": bucket.get(f"pageerror:{ck}", []),
                    "console_errors": bucket.get(f"console:{ck}:error", []),
                    "console_warnings": bucket.get(f"console:{ck}:warning", []),
                    "network_failures": bucket.get(f"net:{ck}", []),
                    "nav_error": bucket.get(f"nav-error:{ck}", []),
                }
                marker = "✓" if (
                    not findings[(role, pid)]["errors"]
                    and not findings[(role, pid)]["console_errors"]
                    and not findings[(role, pid)]["nav_error"]
                    and text_len and text_len > 60
                ) else "✗"
                print(f"   {marker} {role}/{pid:<14} {ms:>5}ms text={text_len}")

        browser.close()

    # ── Report ───────────────────────────────────────────────────────────
    report = ARTIFACT_DIR / "SMOKE-REPORT.md"
    with report.open("w") as f:
        f.write("# Insurance OS — Demo Mode Smoke Report\n\n")
        f.write(f"URL: `{args.url}`\n\n")
        f.write(f"Run at: {time.strftime('%Y-%m-%d %H:%M:%S %Z')}\n\n")

        passes = sum(
            1 for k, v in findings.items()
            if not v["errors"] and not v["console_errors"] and not v["nav_error"]
            and v.get("text_len", 0) > 60
        )
        total = len(findings)
        f.write(f"**Pass: {passes}/{total}**\n\n")

        for role in ("owner", "manager", "rep"):
            cells = [(pid, label) for (r, pid), v in findings.items()
                     if r == role for label in [v["label"]]]
            if not cells:
                continue
            f.write(f"## Role: `{role}`\n\n")
            f.write("| Page | ms | text_len | console err | net err | page err | screenshot |\n")
            f.write("|---|---:|---:|---:|---:|---:|---|\n")
            for pid, label in cells:
                v = findings[(role, pid)]
                f.write(
                    f"| `{pid}` ({label}) | {v['ms']} | {v['text_len']} | "
                    f"{len(v['console_errors'])} | {len(v['network_failures'])} | "
                    f"{len(v['errors'])} | `{v['screenshot']}` |\n"
                )
            f.write("\n")

        # Sample of errors found
        f.write("## Sampled errors\n\n")
        any_err = False
        for (role, pid), v in findings.items():
            for err in v.get("errors", [])[:2]:
                f.write(f"- **{role}/{pid}** pageerror: `{err}`\n")
                any_err = True
            for err in v.get("console_errors", [])[:2]:
                f.write(f"- **{role}/{pid}** console: `{err}`\n")
                any_err = True
            for err in v.get("network_failures", [])[:3]:
                f.write(f"- **{role}/{pid}** net: `{err}`\n")
                any_err = True
        if not any_err:
            f.write("_No errors captured during run._\n")

    print(f"\n>> report written to {report}")
    print(f">> screenshots in {ARTIFACT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
