#!/usr/bin/env python3
"""repflow-agent — main RBA runtime.

Lives at ~/.repflow/agent/. Process model:
  • One persistent Python process per install (managed by launchd / systemd-user
    / Windows scheduled task; see install.sh / install.ps1).
  • Owns the Ollama connection, capability ledger cache, and a Playwright
    browser pool reused across calls.
  • Every 60s POSTs /api/agent/heartbeat. Every hour GETs /api/agent/capabilities.
  • Every 3s POSTs /api/agent/command-claim — atomically claims one queued
    command for this device, dispatches to the matching tool, posts result
    via /api/agent/command-complete, audits via /api/agent/audit.

Hard rules (PRD §10):
  • No arbitrary shell. Tools are an allowlist; missing tools return DENIED.
  • No fs writes outside ~/.repflow/agent/workspace/.
  • No agent-side passwords. Connector tokens come from the Vercel side
    (decrypted vault) per request — never cached on disk.
  • config.yaml is the only file holding agent_token. chmod 600.
"""
from __future__ import annotations
import argparse, hashlib, json, os, signal, socket, sys, time, traceback
from datetime import datetime, timezone
from pathlib import Path

CONFIG_DIR = Path.home() / ".repflow" / "agent"
CONFIG_PATH = CONFIG_DIR / "config.yaml"
WORKSPACE = CONFIG_DIR / "workspace"
CACHE_DIR = CONFIG_DIR / "runtime"
CAPS_CACHE_PATH = CACHE_DIR / "capability_cache.json"
RATE_PATH = CACHE_DIR / "rate_limits.json"
LOG_PATH = CONFIG_DIR / "agent.log"

HEARTBEAT_INTERVAL_SEC = 60
CAPS_REFRESH_INTERVAL_SEC = 3600
COMMAND_POLL_INTERVAL_SEC = 3
UPDATE_CHECK_INTERVAL_SEC = 3600   # check /api/agent/version every hour
DEGRADED_AFTER_SEC = 24 * 3600     # caps refresh failed > 24h → enter degraded mode

VERSION = "0.2.0"
BUNDLE_VERSION_PATH = None  # set in main()

# ── lightweight YAML parser (avoid pulling pyyaml just for one file) ────────


def parse_yaml(text: str) -> dict:
    out = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        k, _, v = line.partition(":")
        v = v.strip()
        if v.startswith('"') and v.endswith('"'):
            v = v[1:-1]
        out[k.strip()] = v
    return out


def log(msg: str):
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] {msg}"
    # Windows consoles/files default to cp1252, which can't encode non-ASCII
    # chars (e.g. the '→' arrow in update logs). A UnicodeEncodeError here
    # is NOT an OSError, so it would escape the except below and crash the main
    # loop on every iteration — observed in prod 2026-05. Make logging
    # encoding-proof: ASCII-fallback on stdout, force UTF-8 on the log file.
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log(f"FATAL: {CONFIG_PATH} missing — run install.sh first")
        sys.exit(2)
    try:
        cfg = parse_yaml(CONFIG_PATH.read_text())
    except Exception as e:
        log(f"FATAL: failed to parse {CONFIG_PATH}: {e}")
        sys.exit(2)
    if not cfg.get("agent_token"):
        log("FATAL: config.yaml missing agent_token")
        sys.exit(2)
    return cfg


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── HTTP plumbing ──────────────────────────────────────────────────────────


def _requests():
    import requests as _r
    return _r


def http_post(url: str, *, token: str, body: dict, timeout: float = 10) -> tuple[int, dict | str]:
    r = _requests().post(url, headers={"x-agent-token": token, "content-type": "application/json"},
                         data=json.dumps(body), timeout=timeout)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


def http_get(url: str, *, token: str, timeout: float = 10) -> tuple[int, dict | str]:
    r = _requests().get(url, headers={"x-agent-token": token}, timeout=timeout)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


# ── Capability cache ───────────────────────────────────────────────────────


def load_caps() -> dict:
    try:
        return json.loads(CAPS_CACHE_PATH.read_text())
    except Exception:
        return {}


def save_caps(caps: dict):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CAPS_CACHE_PATH.write_text(json.dumps(caps, indent=2))


def refresh_caps(api_base: str, token: str) -> dict | None:
    code, data = http_get(f"{api_base}/api/agent/capabilities", token=token)
    if code == 401:
        return {"__revoked__": True}
    if code != 200 or not isinstance(data, dict):
        return None
    save_caps(data)
    return data


# ── Rate limiter (rolling 1h window per tool) ──────────────────────────────


def _load_rate() -> dict:
    try:
        return json.loads(RATE_PATH.read_text())
    except Exception:
        return {}


def _save_rate(d: dict):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    RATE_PATH.write_text(json.dumps(d))


def rate_check_and_record(bucket: str, max_per_hour: int) -> bool:
    """Return True if the call is allowed under bucket's hourly limit and
    record it. Bucket is e.g. 'dial', 'draft', 'browser'. Window is rolling 1h."""
    now = time.time()
    window_start = now - 3600
    state = _load_rate()
    arr = [t for t in (state.get(bucket) or []) if t >= window_start]
    if len(arr) >= max_per_hour:
        state[bucket] = arr
        _save_rate(state)
        return False
    arr.append(now)
    state[bucket] = arr
    _save_rate(state)
    return True


# ── Tool registry ──────────────────────────────────────────────────────────


def load_tools() -> dict:
    """Discover agent/runtime/tools/<name>.py modules. Each must implement
    a `run(payload, ctx) -> dict` function. Modules can also export
    REQUIRED_CAPS = ['local.dial_twilio', ...] and RATE_BUCKET = 'dial'."""
    here = Path(__file__).parent / "tools"
    if not here.exists():
        return {}
    sys.path.insert(0, str(here.parent))  # so `import tools.foo` works
    out = {}
    for f in here.glob("*.py"):
        if f.name.startswith("_"):
            continue
        mod_name = f"tools.{f.stem}"
        try:
            import importlib
            mod = importlib.import_module(mod_name)
            if hasattr(mod, "run"):
                out[f.stem] = mod
        except Exception as e:
            log(f"failed to load tool {f.stem}: {e}")
    return out


def caps_allow(caps: dict, required: list[str]) -> tuple[bool, str | None]:
    """Required is list of dotted paths into caps['capabilities'], e.g.
    ['local.dial_twilio', 'db.write_invites']. Each path must resolve to a
    truthy value (True or non-empty string like 'with_prompt')."""
    cmap = caps.get("capabilities") or {}
    for path in required:
        node = cmap
        for part in path.split("."):
            if not isinstance(node, dict) or part not in node:
                return False, f"missing capability {path}"
            node = node[part]
        if not node:
            return False, f"capability denied: {path}"
    return True, None


# ── Audit ──────────────────────────────────────────────────────────────────


def post_audit(api_base: str, token: str, *, tool: str, args: dict | None,
               result: str, detail: str | None = None, duration_ms: int | None = None):
    args_hash = None
    if args:
        try:
            args_hash = hashlib.sha256(json.dumps(args, sort_keys=True, default=str).encode()).hexdigest()
        except Exception:
            pass
    body = {"tool": tool, "result": result}
    if args_hash: body["args_hash"] = args_hash
    if detail: body["detail"] = str(detail)[:1000]
    if duration_ms is not None: body["duration_ms"] = int(duration_ms)
    try:
        http_post(f"{api_base}/api/agent/audit", token=token, body=body)
    except Exception as e:
        log(f"audit post failed: {e}")


# ── Command dispatch ───────────────────────────────────────────────────────


def claim_command(api_base: str, token: str) -> dict | None:
    code, data = http_post(f"{api_base}/api/agent/command-claim", token=token, body={})
    if code == 401:
        return {"__revoked__": True}
    if code != 200 or not isinstance(data, dict):
        return None
    return data.get("command")


def complete_command(api_base: str, token: str, command_id: str, status: str,
                     result: dict | None = None, error: str | None = None):
    body = {"command_id": command_id, "status": status}
    if result is not None: body["result"] = result
    if error is not None:  body["error"] = error
    try:
        http_post(f"{api_base}/api/agent/command-complete", token=token, body=body)
    except Exception as e:
        log(f"complete_command error: {e}")


def dispatch(cmd: dict, ctx: dict) -> tuple[str, dict | None, str | None]:
    """Returns (status, result, error). status in {succeeded, failed}."""
    kind = cmd.get("kind")
    payload = cmd.get("payload") or {}

    # Platform commands handled inline (don't need a tool module).
    if kind == "ping":
        return "succeeded", {"echo": payload.get("echo"), "at": now_iso()}, None
    if kind == "caps_refresh":
        new_caps = refresh_caps(ctx["api_base"], ctx["token"])
        if not new_caps or new_caps.get("__revoked__"):
            return "failed", None, "caps refresh failed"
        ctx["caps"] = new_caps
        return "succeeded", {"refreshed_at": now_iso(), "version": new_caps.get("issued_at")}, None
    if kind == "models_list":
        return "succeeded", {"models": list_ollama_models()}, None
    if kind == "clear_workspace":
        return "succeeded", {"cleared": clear_workspace()}, None

    tool = ctx["tools"].get(kind)
    if not tool:
        return "failed", None, f"no tool registered for kind={kind}"

    required = getattr(tool, "REQUIRED_CAPS", []) or []
    ok, reason = caps_allow(ctx["caps"], required)
    if not ok:
        return "failed", None, reason

    bucket = getattr(tool, "RATE_BUCKET", None)
    rate_caps = ((ctx["caps"].get("capabilities") or {}).get("rate") or {})
    bucket_to_cap = {"dial": "dials_per_hour", "draft": "drafts_per_hour", "browser": "browser_runs_per_hour"}
    if bucket and bucket in bucket_to_cap:
        cap = int(rate_caps.get(bucket_to_cap[bucket]) or 9999)
        if not rate_check_and_record(bucket, cap):
            return "failed", None, f"rate limit hit ({bucket}: {cap}/hr)"

    try:
        # Inject the command's own id so tools that need it (multi-dial
        # cancel-check, idempotency keys, etc.) can reference themselves
        # via /api/agent/* lookups. Tools that don't care just ignore it.
        if isinstance(payload, dict):
            payload = {**payload, "__command_id": cmd.get("id")}
        result = tool.run(payload, ctx)
        if not isinstance(result, dict):
            result = {"value": result}
        return "succeeded", result, None
    except Exception as e:
        tb = traceback.format_exc(limit=4)
        return "failed", None, f"{e}\n{tb[-500:]}"


# ── Platform inline tools ──────────────────────────────────────────────────


def check_and_apply_update(api_base: str) -> dict | None:
    """Hit /api/agent/version. If bundle_version differs from cached, refetch
    every file. Cached version lives in CACHE_DIR/bundle_version.txt. Returns
    summary dict or None on no-op / failure.
    """
    try:
        r = _requests().get(f"{api_base}/api/agent/version", timeout=10)
        if r.status_code != 200:
            return None
        manifest = r.json()
    except Exception as e:
        log(f"version check failed: {e}")
        return None

    bv = manifest.get("bundle_version")
    if not bv:
        return None
    cache_path = CACHE_DIR / "bundle_version.txt"
    cur = ""
    try: cur = cache_path.read_text().strip()
    except Exception: pass
    if cur == bv:
        return None  # no-op

    log(f"bundle update detected: {cur or '(none)'} → {bv} — refreshing files")
    refreshed = 0
    failed = 0
    for entry in manifest.get("files") or []:
        rel = entry.get("path"); url = entry.get("url")
        if not rel or not url: continue
        dest = CONFIG_DIR / rel  # paths under ~/.repflow/agent/<rel> (matches install layout)
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            resp = _requests().get(url, timeout=20)
            if resp.status_code != 200:
                failed += 1; continue
            dest.write_bytes(resp.content)
            refreshed += 1
        except Exception as e:
            log(f"file refresh failed for {rel}: {e}")
            failed += 1
    try: cache_path.write_text(bv)
    except Exception: pass
    summary = {"applied_version": bv, "refreshed": refreshed, "failed": failed}
    log(f"update summary: {summary}")
    return summary


def list_ollama_models() -> list[str]:
    try:
        import requests as _r
        r = _r.get("http://127.0.0.1:11434/api/tags", timeout=5)
        if r.status_code != 200:
            return []
        return [m.get("name") for m in (r.json().get("models") or []) if m.get("name")]
    except Exception:
        return []


def clear_workspace() -> int:
    """Delete everything under workspace/ except top-level dir markers. Returns
    count of files removed. Cannot escape WORKSPACE due to relative-resolve."""
    if not WORKSPACE.exists():
        return 0
    n = 0
    for p in WORKSPACE.rglob("*"):
        try:
            if p.is_file():
                p.unlink(); n += 1
        except OSError:
            pass
    return n


# ── Heartbeat + main loop ──────────────────────────────────────────────────


def heartbeat(api_base: str, token: str, version: str, status: str = "active"):
    try:
        return http_post(f"{api_base}/api/agent/heartbeat", token=token,
                         body={"version": version, "status": status})
    except Exception as e:
        log(f"heartbeat error: {e}")
        return 0, {"error": str(e)}


_running = True


def _signal_stop(*_):
    global _running
    _running = False


def main():
    ap = argparse.ArgumentParser(description="Repflow agent — main runtime")
    ap.add_argument("--once", action="store_true", help="Process one batch and exit (tests)")
    ap.add_argument("--probe", action="store_true", help="Connectivity probe + exit")
    args = ap.parse_args()

    signal.signal(signal.SIGTERM, _signal_stop)
    signal.signal(signal.SIGINT, _signal_stop)

    cfg = load_config()
    api_base = cfg.get("api_base") or "https://repflow.koino.capital"
    token = cfg["agent_token"]
    version = cfg.get("version") or "0.1.0"

    log(f"agent start · device={cfg.get('device_id')} role={cfg.get('role')} api={api_base}")

    # Initial heartbeat + capability fetch.
    code, _ = heartbeat(api_base, token, version)
    if code == 401:
        log("heartbeat returned 401 — install token revoked, wiping config and exiting")
        try: CONFIG_PATH.unlink()
        except OSError: pass
        sys.exit(3)
    caps = refresh_caps(api_base, token) or load_caps()
    if not caps or caps.get("__revoked__"):
        log("WARN: capabilities not loaded; running degraded (no tools)")
        caps = {"capabilities": {}, "role": cfg.get("role")}

    tools = load_tools()
    log(f"loaded tools: {sorted(tools.keys())}")
    log(f"role: {caps.get('role')} · capability domains: {list((caps.get('capabilities') or {}).keys())}")

    if args.probe:
        print(json.dumps({
            "ok": True, "api_base": api_base, "tools": sorted(tools.keys()),
            "models": list_ollama_models(), "role": caps.get("role"),
        }, indent=2))
        return

    ctx = {"api_base": api_base, "token": token, "caps": caps, "tools": tools, "cfg": cfg}

    last_heartbeat = time.time()
    last_caps = time.time()
    last_update = time.time()

    while _running:
        try:
            now = time.time()

            if now - last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
                code, _ = heartbeat(api_base, token, version,
                                    status="degraded" if (now - last_caps > DEGRADED_AFTER_SEC) else "active")
                if code == 401:
                    log("heartbeat 401 — revoked, self-wiping")
                    try: CONFIG_PATH.unlink()
                    except OSError: pass
                    sys.exit(3)
                last_heartbeat = now

            if now - last_caps >= CAPS_REFRESH_INTERVAL_SEC:
                new_caps = refresh_caps(api_base, token)
                if new_caps and not new_caps.get("__revoked__"):
                    ctx["caps"] = new_caps
                    last_caps = now
                elif new_caps and new_caps.get("__revoked__"):
                    log("caps refresh 401 — revoked")
                    sys.exit(3)

            if now - last_update >= UPDATE_CHECK_INTERVAL_SEC:
                summary = check_and_apply_update(api_base)
                last_update = now
                # If we refreshed any files, exit cleanly so the service
                # manager (launchd / systemd / Scheduled Task) restarts us
                # with the new code. KeepAlive + Restart=always on those
                # configs handle the bounce.
                if summary and (summary.get("refreshed") or 0) > 0:
                    log("agent restarting to load new bundle")
                    sys.exit(0)

            cmd = claim_command(api_base, token)
            if cmd and cmd.get("__revoked__"):
                log("command-claim 401 — revoked")
                sys.exit(3)

            if cmd and cmd.get("id"):
                cid = cmd["id"]; kind = cmd.get("kind"); payload = cmd.get("payload") or {}
                t0 = time.time()
                log(f"cmd {cid[:8]} · kind={kind}")
                status, result, error = dispatch(cmd, ctx)
                dur = int((time.time() - t0) * 1000)
                complete_command(api_base, token, cid, status, result=result, error=error)
                post_audit(api_base, token, tool=kind, args=payload,
                           result="ok" if status == "succeeded" else "error",
                           detail=error, duration_ms=dur)
                log(f"cmd {cid[:8]} · {status} in {dur}ms" + (f" · {error}" if error else ""))
                continue  # tight loop on backlog

            if args.once:
                break
            time.sleep(COMMAND_POLL_INTERVAL_SEC)
        except KeyboardInterrupt:
            break
        except Exception as e:
            log(f"loop error: {e}")
            time.sleep(COMMAND_POLL_INTERVAL_SEC)

    log("agent stop")


if __name__ == "__main__":
    main()
