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

# ── 1. Python check ─────────────────────────────────────────────────────────
PY=""
for cand in python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" &>/dev/null; then
    ver=$("$cand" -c 'import sys; print(sys.version_info.major*100+sys.version_info.minor)')
    if [ "$ver" -ge 310 ]; then PY="$cand"; break; fi
  fi
done
if [ -z "$PY" ]; then
  echo "✗ Python 3.10+ not found — install from python.org first" >&2
  exit 1
fi
echo "  python: $($PY --version) at $(command -v $PY)"

# ── 2. Install deps (user-local, never touches system Python) ───────────────
mkdir -p "$AGENT_DIR"
"$PY" -m pip install --user --quiet --upgrade \
  'scrapling[fetchers]>=0.4.7' 'playwright>=1.40' 'supabase>=2.0' \
  >/dev/null
echo "  installed: scrapling, playwright, supabase"

# ── 3. Install Chromium ────────────────────────────────────────────────────
"$PY" -m playwright install chromium >/dev/null
echo "  installed: chromium"

# ── 4. Download agent files ─────────────────────────────────────────────────
curl -sSL "${BASE_URL}/quote_agent.py" -o "${AGENT_DIR}/quote_agent.py"
mkdir -p "${AGENT_DIR}/scrapers"
for f in __init__.py _template.py uhc.py humana.py; do
  curl -sSL "${BASE_URL}/scrapers/${f}" -o "${AGENT_DIR}/scrapers/${f}" || true
done
chmod +x "${AGENT_DIR}/quote_agent.py"
echo "  agent files installed"

# ── 5. Initial settings ────────────────────────────────────────────────────
SETTINGS_PATH="${INSTALL_DIR}/settings.json"
if [ ! -f "$SETTINGS_PATH" ]; then
  cat > "$SETTINGS_PATH" <<JSON
{
  "rep_id": "${KOINO_REP_ID:-}",
  "headless": true,
  "agent_token": null
}
JSON
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
    <string>$(command -v $PY)</string>
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
ExecStart=$(command -v $PY) ${AGENT_DIR}/quote_agent.py
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
