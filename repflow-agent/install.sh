#!/usr/bin/env bash
# Repflow Agent — one-shot installer.
#
# What this does:
#   1. Verifies Python 3.10+ + pip
#   2. Installs `requests`
#   3. Drops the agent script in ~/.repflow/
#   4. Creates ~/.repflow/agent.env with placeholders
#   5. Sets up an autostart service (launchd on macOS, systemd user on Linux)
#
# Usage:
#   curl -fsSL https://repflow.koino.capital/repflow-agent/install.sh | bash
#   # then edit ~/.repflow/agent.env to add REPFLOW_TOKEN and start the service
set -euo pipefail

INSTALL_DIR="$HOME/.repflow"
AGENT_PATH="$INSTALL_DIR/local_sms_agent.py"
ENV_PATH="$INSTALL_DIR/agent.env"
PY=$(command -v python3 || command -v python || true)

if [[ -z "$PY" ]]; then
  echo "[fatal] python3 not found. Install Python 3.10+ first." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
"$PY" -m pip install --quiet --user requests

# Pull the agent script (replace this URL when shipping a public CDN copy)
curl -fsSL https://repflow.koino.capital/repflow-agent/local_sms_agent.py -o "$AGENT_PATH"
chmod +x "$AGENT_PATH"

if [[ ! -f "$ENV_PATH" ]]; then
  cat > "$ENV_PATH" <<EOF
# Repflow Agent config
# 1. Sign into Repflow → Settings → Integrations → Local Agent → Copy token
# 2. Paste it below as REPFLOW_TOKEN
REPFLOW_API=https://repflow.koino.capital
REPFLOW_TOKEN=
REPFLOW_POLL_SECONDS=10
EOF
  echo "[ok] config written to $ENV_PATH"
  echo "[next] open the file and paste your REPFLOW_TOKEN, then re-run this installer or start the service."
fi

# OS-specific autostart
case "$(uname -s)" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/capital.koino.repflow-agent.plist"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>capital.koino.repflow-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$AGENT_PATH</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$INSTALL_DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$INSTALL_DIR/agent.err</string>
</dict>
</plist>
EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load -w "$PLIST"
    echo "[ok] launchd service installed: capital.koino.repflow-agent"
    echo "[ok] logs at $INSTALL_DIR/agent.log"
    ;;
  Linux)
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/repflow-agent.service" <<EOF
[Unit]
Description=Repflow Local SMS Agent
After=network-online.target

[Service]
ExecStart=$PY $AGENT_PATH
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_DIR/agent.log
StandardError=append:$INSTALL_DIR/agent.err

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now repflow-agent.service
    echo "[ok] systemd user service installed: repflow-agent.service"
    ;;
  *)
    echo "[note] autostart not configured for $(uname -s). Run manually: $PY $AGENT_PATH"
    ;;
esac

echo "[done] Repflow Agent installed. Once REPFLOW_TOKEN is set in $ENV_PATH the service will start sending."
