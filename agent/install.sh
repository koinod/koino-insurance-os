#!/usr/bin/env bash
# Koino Auto Quoter — one-line installer.
#
# What this does:
#   1. Verify Python 3.10+
#   2. pip install scrapling[fetchers] + playwright + supabase
#   3. playwright install chromium
#   4. Drop quote_agent.py + scrapers/ into ~/.koino/auto-quoter/agent/
#   5. Generate launchd plist (macOS) or systemd user unit (linux) for persistence
#   6. Start the agent
#
# Usage:
#   curl -sSL https://koino-insurance-os.vercel.app/agent/install.sh | bash
#   # Or with rep_id baked in:
#   KOINO_REP_ID=marc curl -sSL https://koino-insurance-os.vercel.app/agent/install.sh | bash

set -euo pipefail

INSTALL_DIR="${HOME}/.koino/auto-quoter"
AGENT_DIR="${INSTALL_DIR}/agent"
BASE_URL="${KOINO_AGENT_BASE:-https://koino-insurance-os.vercel.app/agent}"

echo "▸ Koino Auto Quoter installer"
echo "  installing to: ${INSTALL_DIR}"

# ── 0. Prerequisite: curl exists (note: pasted command already used curl,
#    but this is a sanity check for sub-fetches below). ─────────────────────
if ! command -v curl >/dev/null 2>&1; then
  echo "✗ curl not found — re-open Terminal and try again, or install Xcode CLI tools:" >&2
  echo "    xcode-select --install" >&2
  exit 1
fi

# ── 1. Python check (auto-install via Homebrew on macOS if missing) ────────
find_python() {
  for cand in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$cand" >/dev/null 2>&1; then
      ver=$("$cand" -c 'import sys; print(sys.version_info.major*100+sys.version_info.minor)' 2>/dev/null || echo 0)
      if [ "$ver" -ge 310 ]; then echo "$cand"; return 0; fi
    fi
  done
  return 1
}

PY=$(find_python || true)
if [ -z "$PY" ] && [[ "$OSTYPE" == "darwin"* ]]; then
  echo "  python 3.10+ not found — attempting to install via Homebrew…"
  if ! command -v brew >/dev/null 2>&1; then
    # Homebrew install is non-interactive when NONINTERACTIVE=1, but still
    # needs sudo for the initial /opt/homebrew or /usr/local writes. If sudo
    # is non-interactive (passwordless) it proceeds; otherwise it prompts.
    NONINTERACTIVE=1 /bin/bash -c \
      "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
      </dev/null || true
    # Make brew available in this shell for the next command (Apple Silicon
    # default path; Intel falls through to existing PATH).
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  if command -v brew >/dev/null 2>&1; then
    brew install python@3.12 >/dev/null 2>&1 || brew install python >/dev/null 2>&1 || true
  fi
  PY=$(find_python || true)
fi
if [ -z "$PY" ]; then
  echo "✗ Python 3.10+ install failed." >&2
  echo "  Manual fix on macOS: install Homebrew from https://brew.sh, then run:" >&2
  echo "    brew install python@3.12" >&2
  echo "  Or download the installer from https://www.python.org/downloads/" >&2
  echo "  Then re-run this one-liner." >&2
  exit 1
fi
echo "  python: $($PY --version) at $(command -v $PY)"

# ── 2. Create isolated venv (avoids PEP 668, never touches system Python) ──
mkdir -p "$AGENT_DIR"
VENV_DIR="${INSTALL_DIR}/venv"
if [ ! -d "$VENV_DIR" ]; then
  "$PY" -m venv "$VENV_DIR" 2>/dev/null || {
    # Some distros split out venv into python3-venv. Fall back to virtualenv.
    "$PY" -m pip install --user --quiet --break-system-packages virtualenv >/dev/null 2>&1 || true
    "$PY" -m virtualenv "$VENV_DIR" 2>/dev/null || {
      echo "✗ could not create venv. Install: sudo apt install python3-venv  (or equivalent)" >&2
      exit 1
    }
  }
fi
VENV_PY="${VENV_DIR}/bin/python"
"$VENV_PY" -m pip install --quiet --upgrade pip >/dev/null
"$VENV_PY" -m pip install --quiet --upgrade \
  'scrapling[fetchers]>=0.4.7' 'playwright>=1.40' 'supabase>=2.0' 'requests>=2.31' \
  >/dev/null
echo "  venv:       ${VENV_DIR}"
echo "  installed:  scrapling, playwright, supabase, requests"

# ── 3. Install Chromium ────────────────────────────────────────────────────
"$VENV_PY" -m playwright install chromium >/dev/null
# On Linux, also install missing system libs Chromium needs (xrandr, fontconfig,
# etc). --with-deps requires sudo — skip silently if no sudo.
if [[ "$OSTYPE" == "linux-gnu"* ]] && command -v sudo &>/dev/null; then
  sudo -n "$VENV_PY" -m playwright install-deps chromium >/dev/null 2>&1 || true
fi
echo "  installed:  chromium"

# ── 4. Download agent files ─────────────────────────────────────────────────
curl -sSL "${BASE_URL}/quote_agent.py" -o "${AGENT_DIR}/quote_agent.py"
mkdir -p "${AGENT_DIR}/scrapers"
for f in __init__.py _template.py uhc.py humana.py aetna.py cigna.py moo.py lumico.py aig.py fg.py transamerica.py ethos.py americanamicable.py instabrain.py foresters.py sbli.py; do
  curl -sSL "${BASE_URL}/scrapers/${f}" -o "${AGENT_DIR}/scrapers/${f}" || true
done
chmod +x "${AGENT_DIR}/quote_agent.py"

# CLI shim: lets `koino-quote` work from any shell.
SHIM="${INSTALL_DIR}/koino-quote"
cat > "$SHIM" <<SHIM_EOF
#!/usr/bin/env bash
exec "${VENV_DIR}/bin/python" "${AGENT_DIR}/quote_agent.py" "\$@"
SHIM_EOF
chmod +x "$SHIM"
mkdir -p "${HOME}/.local/bin"
ln -sf "$SHIM" "${HOME}/.local/bin/koino-quote" 2>/dev/null || true
echo "  agent files + scrapers installed (14 carriers)"
echo "  CLI:        koino-quote capture <carrier>   (headed login + save session)"
echo "              koino-quote inspect <carrier>   (dump quote-form selectors)"
echo "              koino-quote status              (list captured sessions)"

# ── 5. Initial settings ────────────────────────────────────────────────────
# Optional: redeem a one-shot install token (generated in Settings → Agents)
# so the agent can fetch saved carrier credentials from the server vault via
# /api/agent/connector-exchange. Without it the agent still works using
# captured sessions + the local credentials.json; it just can't pull the
# centrally-saved logins.
API_BASE="${KOINO_API_BASE:-https://os.koino.capital}"
AGENT_TOKEN_JSON="null"
if [ -n "${KOINO_RBA_TOKEN:-}" ]; then
  echo "  redeeming install token against ${API_BASE} ..."
  REDEEM=$(curl -fsS -X POST "${API_BASE}/api/agent/redeem" \
    -H 'content-type: application/json' \
    -d "{\"token\":\"${KOINO_RBA_TOKEN}\",\"hostname\":\"$(hostname)\",\"os\":\"$(uname -s)\",\"cpu\":\"$(uname -m)\",\"ram_gb\":0,\"version\":\"0.2.0\",\"models\":[]}" 2>/dev/null || echo "")
  TOK=$(printf '%s' "$REDEEM" | grep -oE '"agent_token":"[^"]+"' | head -1 | cut -d\" -f4)
  if [ -n "$TOK" ]; then
    AGENT_TOKEN_JSON="\"${TOK}\""
    echo "  ✓ install token redeemed — saved-credential fetch enabled"
  else
    echo "  ⚠ install token redeem failed; continuing without vault fetch ($REDEEM)"
  fi
fi
SETTINGS_PATH="${INSTALL_DIR}/settings.json"
if [ ! -f "$SETTINGS_PATH" ]; then
  cat > "$SETTINGS_PATH" <<JSON
{
  "rep_id": "${KOINO_REP_ID:-}",
  "headless": true,
  "agent_token": ${AGENT_TOKEN_JSON}
}
JSON
elif [ "$AGENT_TOKEN_JSON" != "null" ]; then
  # Settings already exist — patch in the freshly redeemed token without
  # clobbering the rep's other settings (rep_id, headless).
  "$PY" - "$SETTINGS_PATH" "$AGENT_TOKEN_JSON" <<'PYEOF'
import json, sys
path, tok_json = sys.argv[1], sys.argv[2]
try:
    s = json.load(open(path))
except Exception:
    s = {}
s["agent_token"] = json.loads(tok_json)
json.dump(s, open(path, "w"), indent=2)
PYEOF
fi
chmod 600 "$SETTINGS_PATH"
touch "${INSTALL_DIR}/credentials.json"
chmod 600 "${INSTALL_DIR}/credentials.json"

# ── 6. Persistence ──────────────────────────────────────────────────────────
LAUNCHER_PATH=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="${HOME}/Library/LaunchAgents/com.koino.auto-quoter.plist"
  cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.koino.auto-quoter</string>
  <key>ProgramArguments</key><array>
    <string>${VENV_PY}</string>
    <string>${AGENT_DIR}/quote_agent.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${INSTALL_DIR}/agent.stdout.log</string>
  <key>StandardErrorPath</key><string>${INSTALL_DIR}/agent.stderr.log</string>
</dict></plist>
XML
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  LAUNCHER_PATH="$PLIST"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  UNIT_DIR="${HOME}/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  UNIT="${UNIT_DIR}/koino-auto-quoter.service"
  cat > "$UNIT" <<UNIT
[Unit]
Description=Koino Auto Quoter Agent
After=network.target

[Service]
ExecStart=${VENV_PY} ${AGENT_DIR}/quote_agent.py
Restart=on-failure
RestartSec=5
StandardOutput=append:${INSTALL_DIR}/agent.stdout.log
StandardError=append:${INSTALL_DIR}/agent.stderr.log

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now koino-auto-quoter.service 2>/dev/null \
    || (cd "$AGENT_DIR" && nohup "$PY" quote_agent.py >> "${INSTALL_DIR}/agent.stdout.log" 2>&1 &)
  LAUNCHER_PATH="$UNIT"
else
  echo "  unsupported OS ($OSTYPE) — agent installed but not auto-started"
  echo "  run manually: $PY ${AGENT_DIR}/quote_agent.py"
fi

echo ""
echo "✓ Auto Quoter installed."
echo ""
echo "  agent dir:    ${INSTALL_DIR}"
echo "  credentials:  ${INSTALL_DIR}/credentials.json (chmod 600 — never leaves this machine)"
echo "  settings:     ${SETTINGS_PATH}"
[ -n "$LAUNCHER_PATH" ] && echo "  service:      ${LAUNCHER_PATH}"
echo "  logs:         ${INSTALL_DIR}/agent.log"
echo ""
echo "Next: open the Auto Quoter tab in the app, paste your rep_id + carrier credentials."
