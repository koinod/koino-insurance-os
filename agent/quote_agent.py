#!/usr/bin/env python3
"""koino-quote-agent — local Auto Quoter agent.

Runs on the rep's machine. Polls Supabase `auto_quote_requests` for jobs
issued by the Auto Quoter page (deployed Vercel app). Drives a persistent
Playwright browser per enabled carrier, scraping that carrier's portal /
public quoter using the rep's local credentials. Writes results back to
`auto_quote_results` so the page renders them live.

Critical design decisions:
  • Producer credentials NEVER leave this machine. They live in
    ~/.koino/auto-quoter/credentials.json (chmod 600). The cloud only
    sees the resulting premiums, not the carrier passwords.
  • Persistent browser context per carrier so login cookies survive across
    multiple quotes (no re-login per lead). Stored under
    ~/.koino/auto-quoter/browser-state/<carrier>.
  • Headless toggle is read from the per-rep agent config in Supabase
    (`auto_quoter_settings.headless`) so the rep can flip it from the UI
    without restarting.
  • Each carrier scraper is a class in scrapers/<carrier>.py implementing
    `quote(profile, page) -> {premium, class, decline, raw_html_path}`.
    Adding a new carrier = drop a new file in scrapers/.

Polling vs realtime: Supabase realtime via websocket would be ideal but
adds dependency weight. We poll auto_quote_requests every 3s. With a
small queue per rep that's fine.
"""
from __future__ import annotations
import argparse, json, os, sys, time, traceback
from pathlib import Path

# Local site-packages priority — Scrapling is installed there
sys.path.insert(0, str(Path.home() / ".local/lib/python3.12/site-packages"))

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


def log(msg: str):
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with LOG_PATH.open("a") as f:
            f.write(line + "\n")
    except OSError:
        pass


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


def supabase_get(path: str, params: dict | None = None) -> list:
    """Hit Supabase REST endpoint via Scrapling Fetcher."""
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
    """PATCH a row in Supabase REST."""
    from scrapling.fetchers import Fetcher
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }
    from urllib.parse import urlencode
    url = f"{SUPABASE_URL}/rest/v1/{path}?{urlencode(eq_filter)}"
    page = Fetcher.post(url, headers=headers, data=json.dumps(body))
    try:
        return json.loads(page.body)
    except Exception:
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


def get_browser(headless: bool, carrier: str):
    """Return a persistent Playwright browser context for this carrier.

    Uses a separate state dir per carrier so cookies/local storage survive.
    """
    from playwright.sync_api import sync_playwright
    state_dir = BROWSER_STATE_DIR / carrier
    state_dir.mkdir(parents=True, exist_ok=True)
    p = sync_playwright().start()
    context = p.chromium.launch_persistent_context(
        user_data_dir=str(state_dir),
        headless=headless,
        viewport={"width": 1280, "height": 900},
        # Don't expose webdriver flag; carrier portals tend to block it
        args=["--disable-blink-features=AutomationControlled"],
    )
    return p, context


def load_scrapers() -> dict:
    """Discover scrapers/<carrier>.py and return {carrier_id: scraper_module}."""
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


def process_request(req: dict, scrapers: dict, creds: dict, settings: dict):
    """Run a quote request across all enabled carriers, post results back."""
    req_id = req["id"]
    profile = req.get("profile") or {}
    enabled_carriers = req.get("carriers") or list(scrapers.keys())
    headless = bool(settings.get("headless", True))

    log(f"REQ {req_id}: profile age={profile.get('age')} state={profile.get('state')} carriers={enabled_carriers}")

    # Mark request as in-progress
    supabase_patch("auto_quote_requests", {"status": "running", "started_at": "now()"}, {"id": f"eq.{req_id}"})

    for carrier_id in enabled_carriers:
        scraper = scrapers.get(carrier_id)
        if not scraper:
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "no_scraper", "error": f"No scraper module for {carrier_id}",
            })
            continue

        # Some carriers need login; check we have creds for that carrier.
        carrier_creds = creds.get(carrier_id) if scraper.REQUIRES_LOGIN else None
        if scraper.REQUIRES_LOGIN and not carrier_creds:
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "no_creds", "error": "Credentials missing — add via Auto Quoter setup",
            })
            continue

        try:
            p, context = get_browser(headless, carrier_id)
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
                log(f"REQ {req_id} / {carrier_id}: ${result.get('premium', '?')}/mo")
            finally:
                context.close()
                p.stop()
        except Exception as e:
            tb = traceback.format_exc(limit=2)
            log(f"REQ {req_id} / {carrier_id} FAILED: {e}\n{tb}")
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "error", "error": str(e)[:500],
            })

    supabase_patch("auto_quote_requests", {"status": "complete", "completed_at": "now()"}, {"id": f"eq.{req_id}"})
    log(f"REQ {req_id} DONE")


def main():
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

    while True:
        try:
            settings = load_settings()
            creds = load_credentials()
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
