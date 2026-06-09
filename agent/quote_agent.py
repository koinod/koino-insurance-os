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
# Where /api/carrier-recommend lives. Defaults to the production OS host;
# override via KOINO_API_BASE for local dev.
API_BASE = os.environ.get("KOINO_API_BASE", "https://os.koino.capital")

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
    import requests as _r
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
    }
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        from urllib.parse import urlencode
        url = f"{url}?{urlencode(params)}"
    try:
        resp = _r.get(url, headers=headers, timeout=20)
        if resp.status_code >= 300:
            log(f"supabase_get {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return []
        return resp.json() if resp.text else []
    except Exception as e:
        log(f"supabase_get {path} error: {e}")
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
        if resp.status_code >= 300:
            log(f"supabase_patch {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return {}
        return resp.json() if resp.text else {}
    except Exception as e:
        log(f"supabase_patch error: {e}")
        return {}


def supabase_insert(path: str, body: dict) -> dict:
    import requests as _r
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    try:
        resp = _r.post(url, headers=headers, data=json.dumps(body), timeout=20)
        if resp.status_code >= 300:
            log(f"supabase_insert {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return {}
        result = resp.json() if resp.text else []
        return result[0] if isinstance(result, list) and result else {}
    except Exception as e:
        log(f"supabase_insert {path} error: {e}")
        return {}


def supabase_upsert(path: str, body: dict, on_conflict: str) -> dict:
    """Upsert by primary key (e.g. on_conflict='rep_id,carrier_id')."""
    import requests as _r
    headers = {
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "content-type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    url = f"{SUPABASE_URL}/rest/v1/{path}?on_conflict={on_conflict}"
    try:
        resp = _r.post(url, headers=headers, data=json.dumps(body), timeout=20)
        if resp.status_code >= 300:
            log(f"supabase_upsert {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return {}
        result = resp.json() if resp.text else []
        return result[0] if isinstance(result, list) and result else {}
    except Exception as e:
        log(f"supabase_upsert {path} error: {e}")
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


# ─── Carrier recommendation ────────────────────────────────────────────────


def recommend_carrier_order(case: dict, candidate_carriers: list[str]) -> tuple[list[str], list[str]]:
    """Call /api/carrier-recommend to get optimal login order for `case`.

    Returns (ordered, declined). `ordered` is the subset of `candidate_carriers`
    sorted by quote_priority + commission. `declined` are carriers the
    recommend API said will reject the case (we still log a row so the rep
    sees why).

    On error or empty response, returns (candidate_carriers, []) — fail open
    so the autoquoter still runs the rep's enabled list.
    """
    try:
        import requests as _r
        resp = _r.post(
            f"{API_BASE}/api/carrier-recommend",
            headers={"content-type": "application/json"},
            data=json.dumps(case),
            timeout=8,
        )
        if resp.status_code != 200:
            return candidate_carriers, []
        data = resp.json()
    except Exception as e:
        log(f"recommend call failed: {e} — falling back to full carrier list")
        return candidate_carriers, []

    candidate_set = set(candidate_carriers)
    ordered = [
        r["carrier_id"] for r in (data.get("ranked") or [])
        if r.get("carrier_id") in candidate_set
    ]
    declined = [
        r["carrier_id"] for r in (data.get("declined") or [])
        if r.get("carrier_id") in candidate_set
    ]
    # Append any candidates not mentioned by the recommender at the tail —
    # we'd rather over-quote than skip.
    seen = set(ordered) | set(declined)
    tail = [c for c in candidate_carriers if c not in seen]
    return ordered + tail, declined


# ─── Credential resolution (hybrid: vault → local file → capture session) ───


def connector_exchange(carrier_id: str, settings: dict) -> dict | None:
    """Fetch this rep's saved carrier-portal creds from the SERVER vault via
    /api/agent/connector-exchange. The Auto Quoter UI uploads them there
    (provider="carrier_<id>", the {username,password,extra} blob in api_key).

    Returns {username, password, extra} or None. Per-rep by construction: the
    agent_token resolves to one install → one user_id, so the exchange only
    ever returns that rep's credentials. Requires settings['agent_token'].
    """
    token = settings.get("agent_token")
    if not token:
        return None
    try:
        import requests as _r
        resp = _r.post(
            f"{API_BASE}/api/agent/connector-exchange",
            headers={"x-agent-token": token, "content-type": "application/json"},
            data=json.dumps({
                "provider": f"carrier_{carrier_id}",
                "account_label": f"Carrier portal · {carrier_id}",
            }),
            timeout=15,
        )
    except Exception as e:
        log(f"connector-exchange {carrier_id}: network error {e}")
        return None
    if resp.status_code == 404:
        return None  # no connector saved for this carrier — expected, not an error
    if resp.status_code != 200:
        log(f"connector-exchange {carrier_id}: HTTP {resp.status_code} {resp.text[:200]}")
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    blob = data.get("api_key")  # UI stores {username,password,extra} as a JSON string here
    if not blob:
        return None
    try:
        c = json.loads(blob) if isinstance(blob, str) else blob
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(c, dict) or not (c.get("username") or c.get("password")):
        return None
    return c


def resolve_creds(carrier_id: str, local_creds: dict, settings: dict) -> dict | None:
    """Hybrid, per-rep credential resolution:
      1. local credentials.json (dev / manual override) wins,
      2. else the server vault via connector-exchange,
      3. else None — caller falls back to a captured session or asks the rep
         to capture/save a login.
    """
    c = local_creds.get(carrier_id)
    if c and (c.get("username") or c.get("password")):
        return c
    return connector_exchange(carrier_id, settings)


# ─── Login / session reuse ──────────────────────────────────────────────────


def _generic_login(page, scraper, creds: dict):
    """Best-effort generic portal login: navigate to LOGIN_URL, fill the first
    username + password fields, submit. Carriers with bespoke flows (MFA,
    multi-step) should define their own login(page, creds) in the scraper."""
    login_url = getattr(scraper, "LOGIN_URL", None)
    if login_url:
        page.goto(login_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded", timeout=15000)
    user = creds.get("username") or creds.get("user") or creds.get("email") or ""
    pw = creds.get("password") or creds.get("pass") or ""
    for sel in ('input[type="email"]', 'input[autocomplete="username"]',
                'input[name*="user" i]', 'input[name*="email" i]',
                'input[id*="user" i]', 'input[id*="email" i]'):
        el = page.query_selector(sel)
        if el:
            el.fill(user); break
    for sel in ('input[type="password"]', 'input[autocomplete="current-password"]',
                'input[name*="pass" i]', 'input[id*="pass" i]'):
        el = page.query_selector(sel)
        if el:
            el.fill(pw); break
    for sel in ('button[type="submit"]', 'input[type="submit"]',
                'button:has-text("Sign in")', 'button:has-text("Log in")',
                'button:has-text("Login")'):
        el = page.query_selector(sel)
        if el:
            el.click(); break
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass


def ensure_logged_in(page, scraper, carrier_id: str, creds: dict | None) -> dict:
    """Before quoting, confirm we're authenticated on the carrier portal —
    reusing the persistent context's existing cookies when possible, and only
    logging in when needed. This is the "go to site → already logged in? →
    log in if not" step.

    Returns {"ok": True} when authenticated (already, or after auto-login),
    else {"ok": False, "status": <semantic>, "error": <why>} so the caller
    records a useful result row instead of letting the scraper crash deep in.
    """
    if not getattr(scraper, "REQUIRES_LOGIN", False):
        return {"ok": True}

    indicator = getattr(scraper, "LOGGED_IN_INDICATOR", None)
    landing = getattr(scraper, "QUOTE_URL", None) or getattr(scraper, "LOGIN_URL", None)

    # 1. Probe current auth state using whatever cookies we already hold.
    try:
        if landing:
            page.goto(landing, timeout=30000)
            page.wait_for_load_state("domcontentloaded", timeout=15000)
    except Exception as e:
        return {"ok": False, "status": "error", "error": f"could not open carrier site: {str(e)[:160]}"}

    if _detect_logged_in(page, indicator):
        return {"ok": True}  # already logged in — reuse the session, skip re-login

    # 2. Not logged in. Auto-login if we have creds + a way to drive the form.
    if creds:
        login_fn = getattr(scraper, "login", None)
        try:
            if callable(login_fn):
                login_fn(page, creds)
            else:
                _generic_login(page, scraper, creds)
        except Exception as e:
            return {"ok": False, "status": "login_failed", "error": f"auto-login error: {str(e)[:160]}"}
        try:
            page.wait_for_timeout(1500)
        except Exception:
            pass
        if _detect_logged_in(page, indicator):
            # Persist the fresh session so later headless runs reuse it.
            try:
                page.context.storage_state(path=str(storage_path_for(carrier_id)))
            except Exception:
                pass
            return {"ok": True}
        return {"ok": False, "status": "login_failed",
                "error": "auto-login submitted but login wasn't confirmed — re-capture this carrier from Setup, or check the saved password."}

    # 3. No creds and not logged in — the rep must capture/save a login.
    return {"ok": False, "status": "needs_login",
            "error": f"not logged in to {carrier_id} and no saved credentials — open Setup → capture a login or save credentials."}


# ─── Saved rate-path maps (record + replay) ─────────────────────────────────


def fetch_quote_map(carrier_id: str, settings: dict) -> dict | None:
    """GET this rep's agency map for a carrier from /api/agent/quote-map.
    Returns the map dict or None. Requires settings['agent_token']."""
    token = settings.get("agent_token")
    if not token:
        return None
    try:
        import requests as _r
        resp = _r.get(
            f"{API_BASE}/api/agent/quote-map",
            headers={"x-agent-token": token},
            params={"carrier": carrier_id},
            timeout=12,
        )
    except Exception as e:
        log(f"quote-map {carrier_id}: network error {e}")
        return None
    if resp.status_code != 200:
        if resp.status_code not in (401, 404):
            log(f"quote-map {carrier_id}: HTTP {resp.status_code} {resp.text[:160]}")
        return None
    try:
        m = resp.json()
    except Exception:
        return None
    return m if isinstance(m, dict) and m.get("carrier_id") else None


def _profile_value(profile: dict, key, override=None):
    """Resolve a map field's value from the lead profile (or a fixed override)."""
    if override not in (None, ""):
        return override
    k = str(key or "").lower()
    if k in ("zip", "zipcode"):       return profile.get("zip")
    if k == "age":                    return profile.get("age")
    if k == "state":                  return profile.get("state")
    if k in ("gender", "sex"):        return profile.get("gender")
    if k in ("tobacco", "smoker"):    return "yes" if profile.get("tobacco") else "no"
    if k in ("plan", "planvariant"):  return profile.get("planVariant")
    return profile.get(key)


def run_mapped_quote(m: dict, profile: dict, page) -> dict:
    """Replay a saved carrier_quote_maps row to pull a rate. Same return shape
    as a hand-coded scraper.quote(). Login is handled upstream by
    ensure_logged_in via the MapScraper shim."""
    import re
    try:
        quote_url = m.get("quote_url")
        if quote_url:
            page.goto(quote_url, timeout=30000)
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass

        # Pre-fill navigation steps (dismiss modals, click "New quote", etc.)
        for step in (m.get("steps") or []):
            action = str(step.get("action") or "").lower()
            sel = step.get("selector")
            if action == "goto" and (step.get("value") or sel):
                page.goto(step.get("value") or sel, timeout=30000)
            elif action == "click" and sel:
                el = page.query_selector(sel)
                if el:
                    el.click()
            elif action == "wait":
                try:
                    page.wait_for_timeout(int(step.get("value") or 1000))
                except Exception:
                    pass

        # Map lead-profile values onto form fields.
        for f in (m.get("fields") or []):
            sel = f.get("selector")
            if not sel:
                continue
            val = _profile_value(profile, f.get("key"), f.get("value"))
            if val is None or val == "":
                continue
            el = page.query_selector(sel)
            if not el:
                continue
            typ = str(f.get("type") or "fill").lower()
            if typ == "select":
                el.select_option(str(val))
            elif typ in ("radio", "click", "check"):
                el.click()
            else:
                el.fill(str(val))

        if m.get("submit_selector"):
            el = page.query_selector(m["submit_selector"])
            if el:
                el.click()
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
            page.wait_for_timeout(1200)
        except Exception:
            pass

        text = ""
        if m.get("rate_selector"):
            el = page.query_selector(m["rate_selector"])
            if el:
                text = el.inner_text() or ""
        if not text:
            text = page.locator("body").inner_text(timeout=3000) or ""

        rx = m.get("rate_regex") or r"\$(\d{2,5}(?:\.\d{2})?)"
        mt = re.search(rx, text)
        if not mt:
            return {"decline": True,
                    "reason": "mapped quote ran but no rate matched rate_regex — refine the map in Auto Quoter → Map",
                    "raw": text[:600]}
        premium = float(mt.group(mt.lastindex or 1))
        return {"premium": premium, "decline": False, "raw": text[:1000]}
    except Exception as e:
        return {"decline": True, "reason": f"mapped quote error: {str(e)[:200]}"}


class MapScraper:
    """Adapts a saved carrier_quote_maps row to the scraper contract so the
    generic login + quote flow drives it exactly like a hand-coded module."""
    def __init__(self, m: dict):
        self._m = m
        self.CARRIER_NAME = m.get("carrier_id")
        self.LOGIN_URL = m.get("login_url")
        self.QUOTE_URL = m.get("quote_url")
        self.LOGGED_IN_INDICATOR = m.get("logged_in_indicator")
        self.REQUIRES_LOGIN = bool(m.get("login_url") or m.get("logged_in_indicator"))

    def quote(self, profile, page, creds=None) -> dict:
        return run_mapped_quote(self._m, profile, page)


# ─── Quote flow ─────────────────────────────────────────────────────────────


def process_quote(req: dict, scrapers: dict, creds: dict, settings: dict):
    req_id = req["id"]
    profile = req.get("profile") or {}
    enabled_carriers = req.get("carriers") or list(scrapers.keys())
    headless = bool(settings.get("headless", True))
    rep_id = req.get("rep_id") or settings.get("rep_id")

    # If the request includes a `case_payload` for /api/carrier-recommend,
    # use it to reorder + prune the carrier list. Skips dead-end logins
    # entirely and tries best-fit carriers first.
    case_payload = req.get("case_payload") or profile.get("case_payload")
    declined_carriers: list[str] = []
    if case_payload:
        ordered, declined_carriers = recommend_carrier_order(case_payload, enabled_carriers)
        if ordered:
            log(f"QUOTE {req_id}: recommend reordered → {ordered} (declined: {declined_carriers})")
            enabled_carriers = ordered

    log(f"QUOTE {req_id}: profile age={profile.get('age')} state={profile.get('state')} carriers={enabled_carriers}")

    supabase_patch("auto_quote_requests", {"status": "running", "started_at": now_iso()}, {"id": f"eq.{req_id}"})

    # Surface recommend-declined carriers as result rows so the rep sees
    # *why* we skipped them, instead of them silently disappearing.
    for carrier_id in declined_carriers:
        supabase_insert("auto_quote_results", {
            "request_id": req_id, "carrier_id": carrier_id,
            "status": "decline",
            "error": "Pre-filtered by carrier-recommend (carrier won't write this risk).",
        })

    for carrier_id in enabled_carriers:
        scraper = scrapers.get(carrier_id)
        # A saved, rep-authored rate-path map takes precedence over (and fills
        # in for) a hand-coded scraper.
        saved_map = fetch_quote_map(carrier_id, settings)
        if saved_map:
            scraper = MapScraper(saved_map)
            log(f"QUOTE {req_id} / {carrier_id}: using saved rate-path map")
        if not scraper:
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "no_scraper",
                "error": f"No scraper or saved map for {carrier_id} — map it in Auto Quoter → Map, or add a scraper.",
            })
            continue

        # Per-rep credential resolution: local file → server vault. May be
        # None when the rep relies on a captured session instead.
        carrier_creds = resolve_creds(carrier_id, creds, settings) if scraper.REQUIRES_LOGIN else None
        if scraper.REQUIRES_LOGIN and not has_session(carrier_id) and not carrier_creds:
            supabase_insert("auto_quote_results", {
                "request_id": req_id, "carrier_id": carrier_id,
                "status": "no_creds",
                "error": f"No session captured for {carrier_id} and no credentials saved — open Setup tab and capture login or save credentials.",
            })
            continue

        try:
            p, context = get_browser(headless, carrier_id, persistent=True)
            try:
                page = context.new_page()
                # Reuse the existing session if still valid; auto-login when we
                # have creds; otherwise tell the rep exactly why we stopped.
                auth = ensure_logged_in(page, scraper, carrier_id, carrier_creds)
                if not auth.get("ok"):
                    ui_status = {"needs_login": "no_creds", "login_failed": "error"}.get(auth.get("status"), "error")
                    supabase_insert("auto_quote_results", {
                        "request_id": req_id, "carrier_id": carrier_id,
                        "status": ui_status, "error": auth.get("error"),
                    })
                    if rep_id:
                        supabase_upsert("carrier_sessions", {
                            "rep_id": rep_id, "carrier_id": carrier_id,
                            "last_failure": (auth.get("error") or "login failed")[:200],
                        }, on_conflict="rep_id,carrier_id")
                    continue
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
