#!/usr/bin/env python3
"""koino-quote-agent — local Auto Quoter agent.

Runs on the rep's machine. Polls Supabase `auto_quote_requests` for jobs
issued by the Auto Quoter page. Three job types:

  • request_type = "quote"           (default) — drive Playwright through each
    enabled carrier's quote flow using the saved storage_state from a prior
    capture, return premiums.
  • request_type = "capture_session" — open a HEADED Chromium window to the
    carrier login URL. Wait for the producer to log in manually. Detect
    success (URL pattern or selector), save storage_state to disk, write a
    row into `carrier_sessions` so the UI shows "captured X ago".
  • request_type = "inspect_form"    — debug helper. Reuses captured session,
    navigates to the carrier quote form, dumps every input/select/button
    selector with its enclosing labels so we can update scrapers when a
    portal redesigns.

Critical design:
  • Producer credentials NEVER leave this machine. They live in
    ~/.koino/auto-quoter/credentials.json (chmod 600). Cookies/storage
    captured during login live in
    ~/.koino/auto-quoter/browser-state/<carrier>/storage.json.
  • Persistent browser context per carrier so login cookies survive across
    quotes (no re-login per lead).
  • Headless toggle is read from settings.json each poll; the rep can flip
    it from the UI without restarting the agent.
  • Each carrier scraper is scrapers/<carrier>.py implementing the same
    contract: REQUIRES_LOGIN, LOGIN_URL, LOGGED_IN_INDICATOR, QUOTE_URL,
    quote(profile, page, creds), and optionally inspect_form(page).

CLI subcommands (in addition to the polling daemon):
  python quote_agent.py                 # daemon, polls Supabase forever
  python quote_agent.py --once          # process one batch and exit
  python quote_agent.py capture humana  # local-only headed capture
  python quote_agent.py inspect humana  # dump form selectors locally
"""
from __future__ import annotations
import argparse, json, os, sys, time, traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

# When running outside the installed venv (dev mode), fall back to the host
# user-local site-packages so Scrapling/Playwright are still importable.
# Inside the installed venv (~/.koino/auto-quoter/venv) this is a no-op.
_user_sp = Path.home() / ".local/lib/python3.12/site-packages"
if _user_sp.exists() and str(_user_sp) not in sys.path:
    sys.path.insert(0, str(_user_sp))

CONFIG_DIR = Path.home() / ".koino/auto-quoter"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CREDS_PATH = CONFIG_DIR / "credentials.json"
SETTINGS_PATH = CONFIG_DIR / "settings.json"
BROWSER_STATE_DIR = CONFIG_DIR / "browser-state"
BROWSER_STATE_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = CONFIG_DIR / "agent.log"

POLL_INTERVAL_SEC = 3
SUPABASE_URL = os.environ.get("KOINO_SUPABASE_URL", "https://jfphwmzwteermalzwojp.supabase.co")
SUPABASE_ANON = os.environ.get("KOINO_SUPABASE_ANON", "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr")

# How long to wait, in seconds, for the human to complete a login during a
# headed capture. 5 min covers most MFA flows; can be overridden per request
# via payload.timeout_sec.
CAPTURE_TIMEOUT_SEC = 300

# Default session-expiry estimate per carrier when we save a storage_state
# (real carriers vary; this is informational for the UI's "expires in X days"
# chip). 30d is the typical SSO cookie lifetime.
DEFAULT_SESSION_TTL_DAYS = 30


def log(msg: str):
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with LOG_PATH.open("a") as f:
            f.write(line + "\n")
    except OSError:
        pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_credentials() -> dict:
    if not CREDS_PATH.exists():
        return {}
    try:
        return json.loads(CREDS_PATH.read_text())
    except json.JSONDecodeError:
        log(f"WARN: {CREDS_PATH} is not valid JSON; treating as empty")
        return {}


def load_settings() -> dict:
    defaults = {"headless": True, "rep_id": None, "agent_token": None}
    if not SETTINGS_PATH.exists():
        SETTINGS_PATH.write_text(json.dumps(defaults, indent=2))
        return defaults
    try:
        s = json.loads(SETTINGS_PATH.read_text())
        return {**defaults, **s}
    except json.JSONDecodeError:
        return defaults


def storage_path_for(carrier: str) -> Path:
    """Where we persist the post-login storage_state for a carrier."""
    d = BROWSER_STATE_DIR / carrier
    d.mkdir(parents=True, exist_ok=True)
    return d / "storage.json"


def has_session(carrier: str) -> bool:
    p = storage_path_for(carrier)
    return p.exists() and p.stat().st_size > 50  # non-empty


# ─── Supabase REST helpers ──────────────────────────────────────────────────


def supabase_get(path: str, params: dict | None = None) -> list:
    from scrapling.fetchers import Fetcher
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
    }
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        from urllib.parse import urlencode
        url = f"{url}?{urlencode(params)}"
    page = Fetcher.get(url, headers=headers)
    try:
        return json.loads(page.body)
    except Exception:
        return []


def supabase_patch(path: str, body: dict, eq_filter: dict) -> dict:
    """PATCH a row in Supabase REST. PostgREST uses HTTP PATCH for updates."""
    import requests as _r
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }
    from urllib.parse import urlencode
    url = f"{SUPABASE_URL}/rest/v1/{path}?{urlencode(eq_filter)}"
    try:
        resp = _r.patch(url, headers=headers, data=json.dumps(body), timeout=20)
        return resp.json() if resp.text else {}
    except Exception as e:
        log(f"supabase_patch error: {e}")
        return {}


def supabase_insert(path: str, body: dict) -> dict:
    from scrapling.fetchers import Fetcher
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    page = Fetcher.post(url, headers=headers, data=json.dumps(body))
    try:
        result = json.loads(page.body)
        return result[0] if isinstance(result, list) and result else {}
    except Exception:
        return {}


def supabase_upsert(path: str, body: dict, on_conflict: str) -> dict:
    """Upsert by primary key (e.g. on_conflict='rep_id,carrier_id')."""
    from scrapling.fetchers import Fetcher
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    url = f"{SUPABASE_URL}/rest/v1/{path}?on_conflict={on_conflict}"
    page = Fetcher.post(url, headers=headers, data=json.dumps(body))
    try:
        result = json.loads(page.body)
        return result[0] if isinstance(result, list) and result else {}
    except Exception:
        return {}


# ─── Browser context ────────────────────────────────────────────────────────


def get_browser(headless: bool, carrier: str, persistent: bool = True):
    """Return (playwright_handle, context).

    persistent=True uses launch_persistent_context with a per-carrier user
    data dir — best for production quote runs (cookies/storage survive across
    sessions, behaves identically to a real browser profile).

    persistent=False launches an ephemeral browser and loads
    storage_state.json from disk if it exists. We use this during capture
    flows where we explicitly want to write a fresh storage_state on success.
    """
    from playwright.sync_api import sync_playwright
    p = sync_playwright().start()
    args = ["--disable-blink-features=AutomationControlled"]
    if persistent:
        state_dir = BROWSER_STATE_DIR / carrier
        state_dir.mkdir(parents=True, exist_ok=True)
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(state_dir),
            headless=headless,
            viewport={"width": 1280, "height": 900},
            args=args,
        )
        return p, context
    else:
        browser = p.chromium.launch(headless=headless, args=args)
        storage = storage_path_for(carrier)
        ctx_kwargs = {"viewport": {"width": 1280, "height": 900}}
        if storage.exists():
            try:
                ctx_kwargs["storage_state"] = str(storage)
            except Exception:
                pass
        context = browser.new_context(**ctx_kwargs)
        return p, context


def load_scrapers() -> dict:
    """Discover scrapers/<carrier>.py — return {carrier_id: module}."""
    scrapers_dir = Path(__file__).parent / "scrapers"
    out = {}
    if not scrapers_dir.exists():
        return out
    sys.path.insert(0, str(scrapers_dir.parent))
    for f in scrapers_dir.glob("*.py"):
        if f.name.startswith("_"):
            continue
        mod_name = f"scrapers.{f.stem}"
        try:
            import importlib
            mod = importlib.import_module(mod_name)
            if hasattr(mod, "quote"):
                out[f.stem] = mod
        except Exception as e:
            log(f"FAIL load scraper {f.stem}: {e}")
    return out


# ─── Session-capture flow ──────────────────────────────────────────────────


def _detect_logged_in(page, indicator) -> bool:
    """`indicator` may be a substring (URL match), a selector starting with
    `selector:`, or a callable. Returns True if the page currently looks
    logged-in."""
    try:
        if callable(indicator):
            return bool(indicator(page))
        if not indicator:
            return False
        if isinstance(indicator, str) and indicator.startswith("selector:"):
            sel = indicator[len("selector:"):]
            return page.query_selector(sel) is not None
        # Default: substring of current URL
        return indicator in (page.url or "")
    except Exception:
        return False


def capture_session(carrier_id: str, scraper, settings: dict, payload: dict | None = None) -> dict:
    """Open a headed browser to the carrier login URL. Wait for the human to
    log in. Once logged in (per scraper's LOGGED_IN_INDICATOR), save
    storage_state to disk. Returns {ok, captured_at, error}."""
    if not getattr(scraper, "LOGIN_URL", None):
        return {"ok": False, "error": f"{carrier_id} scraper has no LOGIN_URL — can't capture"}

    timeout_sec = (payload or {}).get("timeout_sec") or CAPTURE_TIMEOUT_SEC
    indicator = getattr(scraper, "LOGGED_IN_INDICATOR", None)
    if not indicator:
        # Fall back: assume login is "done" once URL changes off the login page.
        login_origin = scraper.LOGIN_URL.split("?")[0]
        indicator = lambda page: page.url and not page.url.startswith(login_origin)

    log(f"CAPTURE {carrier_id}: opening {scraper.LOGIN_URL} (headed) — waiting up to {timeout_sec}s for login")

    # We force headed for capture regardless of settings — the whole point is
    # for the producer to see the window and type their password / handle MFA.
    p, context = get_browser(headless=False, carrier=carrier_id, persistent=True)
    try:
        page = context.new_page()
        page.goto(scraper.LOGIN_URL, timeout=30000)

        deadline = time.time() + timeout_sec
        captured = False
        while time.time() < deadline:
            if _detect_logged_in(page, indicator):
                captured = True
                break
            try:
                page.wait_for_timeout(1000)
            except Exception:
                break

        if not captured:
            return {"ok": False, "error": f"login not detected within {timeout_sec}s — close the browser and try again"}

        # Capture storage_state to disk so headless runs can reuse it.
        storage = storage_path_for(carrier_id)
        try:
            context.storage_state(path=str(storage))
        except Exception as e:
            return {"ok": False, "error": f"login looked good but storage_state failed: {e}"}

        log(f"CAPTURE {carrier_id}: SUCCESS · storage_state written to {storage}")
        # Hold the window open briefly so the producer sees confirmation
        try:
            page.wait_for_timeout(1500)
        except Exception:
            pass
        return {"ok": True, "captured_at": now_iso(), "storage_path": str(storage)}
    except Exception as e:
        return {"ok": False, "error": f"capture error: {e}"}
    finally:
        try:
            context.close()
        except Exception:
            pass
        try:
            p.stop()
        except Exception:
            pass


def inspect_form(carrier_id: str, scraper, settings: dict, payload: dict | None = None) -> dict:
    """Reuse captured session, navigate to QUOTE_URL, dump every form
    control on the page so we can author/repair selectors. Returns a JSON
    blob of {fields:[...], buttons:[...]} keyed by best-effort label."""
    if not getattr(scraper, "QUOTE_URL", None):
        return {"ok": False, "error": f"{carrier_id} scraper has no QUOTE_URL — nothing to inspect"}

    headless = bool(settings.get("headless", True))
    p, context = get_browser(headless=headless, carrier=carrier_id, persistent=True)
    try:
        page = context.new_page()
        page.goto(scraper.QUOTE_URL, timeout=30000)
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(1500)

        # Allow each scraper to do navigation steps post-arrival before we
        # dump (e.g. dismiss a modal, click "New quote"). Optional.
        prep = getattr(scraper, "inspect_form", None)
        if callable(prep):
            try:
                prep(page)
            except Exception as e:
                log(f"inspect prep for {carrier_id} raised: {e}")

        dump = page.evaluate(
            """() => {
                const out = { fields: [], buttons: [], url: location.href, title: document.title };
                const labelFor = (el) => {
                    if (!el) return null;
                    if (el.id) {
                        const lbl = document.querySelector(`label[for="${el.id}"]`);
                        if (lbl && lbl.innerText) return lbl.innerText.trim();
                    }
                    const wrap = el.closest("label");
                    if (wrap && wrap.innerText) return wrap.innerText.trim();
                    return el.placeholder || el.getAttribute("aria-label") || null;
                };
                document.querySelectorAll("input, select, textarea").forEach((el) => {
                    out.fields.push({
                        tag: el.tagName.toLowerCase(),
                        type: el.type || null,
                        name: el.name || null,
                        id: el.id || null,
                        placeholder: el.placeholder || null,
                        label: labelFor(el),
                        css: el.id ? `#${el.id}` : (el.name ? `[name="${el.name}"]` : null),
                    });
                });
                document.querySelectorAll("button, [role='button']").forEach((el) => {
                    out.buttons.push({
                        text: (el.innerText || "").trim().slice(0, 80),
                        type: el.type || null,
                        id: el.id || null,
                        name: el.name || null,
                        css: el.id ? `#${el.id}` : null,
                    });
                });
                return out;
            }"""
        )
        return {"ok": True, "dump": dump}
    except Exception as e:
        return {"ok": False, "error": f"inspect error: {e}"}
    finally:
        try:
            context.close()
        except Exception:
            pass
        try:
            p.stop()
        except Exception:
            pass


# ─── Quote flow ─────────────────────────────────────────────────────────────


def process_quote(req: dict, scrapers: dict, creds: dict, settings: dict):
    req_id = req["id"]
    profile = req.get("profile") or {}
    enabled_carriers = req.get("carriers") or list(scrapers.keys())
    headless = bool(settings.get("headless", True))
    rep_id = req.get("rep_id") or settings.get("rep_id")

    log(f"QUOTE {req_id}: profile age={profile.get('age')} state={profile.get('state')} carriers={enabled_carriers}")

    supabase_patch("auto_quote_requests", {"status": "running", "started_at": now_iso()}, {"id": f"eq.{req_id}"})

    for carrier_id in enabled_carriers:
        scraper = scrapers.get(carrier_id)
        if not scraper:
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "no_scraper", "error": f"No scraper module for {carrier_id}",
            })
            continue

        carrier_creds = creds.get(carrier_id) if scraper.REQUIRES_LOGIN else None
        if scraper.REQUIRES_LOGIN and not has_session(carrier_id) and not carrier_creds:
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "no_creds",
                "error": f"No session captured for {carrier_id} and no credentials saved — open Setup tab and capture login.",
            })
            continue

        try:
            p, context = get_browser(headless, carrier_id, persistent=True)
            try:
                page = context.new_page()
                result = scraper.quote(profile, page, creds=carrier_creds)
                supabase_insert("auto_quote_results", {
                    "request_id": req_id, "carrier_id": carrier_id,
                    "status": "ok" if not result.get("decline") else "decline",
                    "premium_cents": int(result.get("premium", 0) * 100) if result.get("premium") else None,
                    "uw_class": result.get("uwClass"),
                    "raw_excerpt": (result.get("raw") or "")[:1000],
                    "error": result.get("reason") if result.get("decline") else None,
                })
                # Track session health: a successful quote means the captured
                # session is still working. Update last_quote_at.
                if rep_id and not result.get("decline"):
                    supabase_upsert("carrier_sessions", {
                        "rep_id": rep_id, "carrier_id": carrier_id,
                        "last_quote_at": now_iso(), "last_failure": None,
                    }, on_conflict="rep_id,carrier_id")
                elif rep_id and result.get("decline") and "session" in (result.get("reason") or "").lower():
                    supabase_upsert("carrier_sessions", {
                        "rep_id": rep_id, "carrier_id": carrier_id,
                        "last_failure": result.get("reason")[:200],
                    }, on_conflict="rep_id,carrier_id")

                log(f"QUOTE {req_id} / {carrier_id}: ${result.get('premium', '?')}/mo")
            finally:
                context.close()
                p.stop()
        except Exception as e:
            tb = traceback.format_exc(limit=2)
            log(f"QUOTE {req_id} / {carrier_id} FAILED: {e}\n{tb}")
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "error", "error": str(e)[:500],
            })

    supabase_patch("auto_quote_requests", {"status": "complete", "completed_at": now_iso()}, {"id": f"eq.{req_id}"})
    log(f"QUOTE {req_id} DONE")


def process_capture(req: dict, scrapers: dict, settings: dict):
    req_id = req["id"]
    carrier_id = req.get("carrier_id")
    rep_id = req.get("rep_id") or settings.get("rep_id")
    payload = req.get("payload") or {}
    if not carrier_id:
        supabase_patch("auto_quote_requests", {"status": "failed", "notes": "carrier_id required"}, {"id": f"eq.{req_id}"})
        return
    scraper = scrapers.get(carrier_id)
    if not scraper:
        supabase_patch("auto_quote_requests", {"status": "failed", "notes": f"no scraper {carrier_id}"}, {"id": f"eq.{req_id}"})
        return

    log(f"CAPTURE {req_id}: carrier={carrier_id}")
    supabase_patch("auto_quote_requests", {"status": "running", "started_at": now_iso()}, {"id": f"eq.{req_id}"})

    result = capture_session(carrier_id, scraper, settings, payload)

    if result.get("ok"):
        ttl = timedelta(days=DEFAULT_SESSION_TTL_DAYS)
        supabase_upsert("carrier_sessions", {
            "rep_id": rep_id, "carrier_id": carrier_id,
            "captured_at": result["captured_at"],
            "expires_at": (datetime.now(timezone.utc) + ttl).isoformat(),
            "storage_path": result.get("storage_path"),
            "last_failure": None,
        }, on_conflict="rep_id,carrier_id")
        supabase_insert("auto_quote_results", {
            "request_id": req_id, "carrier_id": carrier_id,
            "status": "ok", "raw_excerpt": "session captured",
        })
        supabase_patch("auto_quote_requests", {"status": "complete", "completed_at": now_iso()}, {"id": f"eq.{req_id}"})
    else:
        if rep_id:
            supabase_upsert("carrier_sessions", {
                "rep_id": rep_id, "carrier_id": carrier_id,
                "last_failure": result.get("error", "unknown")[:200],
            }, on_conflict="rep_id,carrier_id")
        supabase_insert("auto_quote_results", {
            "request_id": req_id, "carrier_id": carrier_id,
            "status": "error", "error": result.get("error", "capture failed")[:500],
        })
        supabase_patch("auto_quote_requests", {"status": "failed", "completed_at": now_iso(), "notes": result.get("error")}, {"id": f"eq.{req_id}"})


def process_inspect(req: dict, scrapers: dict, settings: dict):
    req_id = req["id"]
    carrier_id = req.get("carrier_id")
    if not carrier_id:
        supabase_patch("auto_quote_requests", {"status": "failed", "notes": "carrier_id required"}, {"id": f"eq.{req_id}"})
        return
    scraper = scrapers.get(carrier_id)
    if not scraper:
        supabase_patch("auto_quote_requests", {"status": "failed", "notes": f"no scraper {carrier_id}"}, {"id": f"eq.{req_id}"})
        return

    log(f"INSPECT {req_id}: carrier={carrier_id}")
    supabase_patch("auto_quote_requests", {"status": "running", "started_at": now_iso()}, {"id": f"eq.{req_id}"})

    result = inspect_form(carrier_id, scraper, settings, req.get("payload") or {})

    if result.get("ok"):
        supabase_insert("auto_quote_results", {
            "request_id": req_id, "carrier_id": carrier_id,
            "status": "ok",
            "raw_excerpt": json.dumps(result["dump"])[:3500],
        })
        supabase_patch("auto_quote_requests", {"status": "complete", "completed_at": now_iso(), "payload": result["dump"]}, {"id": f"eq.{req_id}"})
    else:
        supabase_insert("auto_quote_results", {
            "request_id": req_id, "carrier_id": carrier_id,
            "status": "error", "error": result.get("error")[:500],
        })
        supabase_patch("auto_quote_requests", {"status": "failed", "completed_at": now_iso()}, {"id": f"eq.{req_id}"})


# ─── Dispatcher ─────────────────────────────────────────────────────────────


def process_request(req: dict, scrapers: dict, creds: dict, settings: dict):
    rt = (req.get("request_type") or "quote").lower()
    if rt == "capture_session":
        process_capture(req, scrapers, settings)
    elif rt == "inspect_form":
        process_inspect(req, scrapers, settings)
    else:
        process_quote(req, scrapers, creds, settings)


# ─── Heartbeat ─────────────────────────────────────────────────────────────


def heartbeat(rep_id: str):
    """Update auto_quoter_settings.agent_last_seen so the UI shows online."""
    try:
        supabase_upsert("auto_quoter_settings", {
            "rep_id": rep_id,
            "agent_last_seen": now_iso(),
            "agent_version": "0.2.0",
        }, on_conflict="rep_id")
    except Exception:
        pass


# ─── CLI ───────────────────────────────────────────────────────────────────


def cmd_capture(carrier_id: str):
    """Local CLI: open headed browser for `carrier_id`, save storage_state."""
    settings = load_settings()
    scrapers = load_scrapers()
    scraper = scrapers.get(carrier_id)
    if not scraper:
        print(f"✗ no scraper found for {carrier_id}. Available: {sorted(scrapers.keys())}")
        sys.exit(1)
    print(f"▸ opening {getattr(scraper, 'LOGIN_URL', '?')} — log in when the window appears.")
    result = capture_session(carrier_id, scraper, settings)
    if result.get("ok"):
        print(f"✓ captured {carrier_id} session at {result['captured_at']}")
        print(f"  storage: {result['storage_path']}")
    else:
        print(f"✗ capture failed: {result.get('error')}")
        sys.exit(1)


def cmd_inspect(carrier_id: str):
    settings = load_settings()
    settings["headless"] = False  # always visible for manual inspection
    scrapers = load_scrapers()
    scraper = scrapers.get(carrier_id)
    if not scraper:
        print(f"✗ no scraper found for {carrier_id}")
        sys.exit(1)
    result = inspect_form(carrier_id, scraper, settings)
    if result.get("ok"):
        print(json.dumps(result["dump"], indent=2))
    else:
        print(f"✗ inspect failed: {result.get('error')}")
        sys.exit(1)


def cmd_status():
    """Print local sessions overview."""
    print(f"agent dir: {CONFIG_DIR}")
    print(f"settings:  {load_settings()}")
    print("captured sessions:")
    for d in sorted(BROWSER_STATE_DIR.iterdir()):
        s = d / "storage.json"
        if s.exists():
            mtime = datetime.fromtimestamp(s.stat().st_mtime, tz=timezone.utc)
            age = datetime.now(timezone.utc) - mtime
            print(f"  · {d.name:12s} captured {age.days}d{age.seconds // 3600}h ago ({s.stat().st_size} bytes)")
        else:
            print(f"  · {d.name:12s} no session")


def main():
    # Subcommand-style: `python quote_agent.py capture humana`
    if len(sys.argv) >= 2 and sys.argv[1] in {"capture", "inspect", "status"}:
        sub = sys.argv[1]
        if sub == "status":
            cmd_status()
            return
        if len(sys.argv) < 3:
            print(f"usage: quote_agent.py {sub} <carrier_id>")
            sys.exit(2)
        cid = sys.argv[2]
        if sub == "capture":
            cmd_capture(cid)
        else:
            cmd_inspect(cid)
        return

    ap = argparse.ArgumentParser(description="Koino Auto Quoter — local agent")
    ap.add_argument("--once", action="store_true", help="Process one job batch and exit (used by tests)")
    ap.add_argument("--rep-id", help="Override rep_id from settings.json")
    args = ap.parse_args()

    settings = load_settings()
    if args.rep_id:
        settings["rep_id"] = args.rep_id
        SETTINGS_PATH.write_text(json.dumps(settings, indent=2))

    rep_id = settings.get("rep_id")
    if not rep_id:
        log("ERROR: no rep_id in settings — run `koino-quote-agent --rep-id <your-id>` first or paste from Auto Quoter setup page")
        sys.exit(1)

    log(f"AGENT START · rep_id={rep_id} · headless={settings.get('headless')} · scrapers loaded:")
    scrapers = load_scrapers()
    for cid, mod in scrapers.items():
        log(f"  · {cid} (login={'yes' if mod.REQUIRES_LOGIN else 'no'})")

    creds = load_credentials()
    log(f"  credentials loaded for: {list(creds.keys())}")

    last_heartbeat = 0
    while True:
        try:
            settings = load_settings()
            creds = load_credentials()

            if time.time() - last_heartbeat > 30:
                heartbeat(rep_id)
                last_heartbeat = time.time()

            pending = supabase_get(
                "auto_quote_requests",
                {"rep_id": f"eq.{rep_id}", "status": "eq.queued", "select": "*", "order": "created_at.asc", "limit": 5},
            )
            for req in pending:
                process_request(req, scrapers, creds, settings)
        except Exception as e:
            log(f"poll loop error: {e}")
        if args.once:
            break
        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
