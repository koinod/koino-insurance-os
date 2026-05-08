// GET /api/agent/install.sh — returns the installer bash script. Token must
// be passed as ?token=... or via the curl pipe (the script reads $RBA_TOKEN
// from env, so we template the token into the script body too).
//
// Usage:
//   curl -fsSL https://koino-insurance-os.vercel.app/api/agent/install.sh?token=XXXX | bash
//
// macOS + Linux only. Windows mirror lives at /api/agent/install.ps1.
export const config = { runtime: "edge" };

export default async function handler(req) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  const apiBase = `${url.protocol}//${url.host}`;

  const script = `#!/usr/bin/env bash
# Repflow Agent installer
# Generated for token ${token ? token.slice(0, 8) + "…" : "(none)"}
set -euo pipefail

API_BASE="${apiBase}"
TOKEN="${token || "${RBA_TOKEN:-}"}"
HOME_DIR="\${HOME:-$HOME}"
RBA_HOME="\$HOME_DIR/.repflow/agent"
LOG="\$RBA_HOME/install.log"

if [ -z "\$TOKEN" ]; then
  echo "[rba] no token. open Settings → Devices in the Repflow web app and click Install."
  exit 1
fi

mkdir -p "\$RBA_HOME" "\$RBA_HOME/workspace"
exec > >(tee -a "\$LOG") 2>&1
echo "[rba] $(date -u) install begins"

# ─── OS detection ───────────────────────────────────────────────────────
OS="unknown"; CPU="$(uname -m 2>/dev/null || echo unknown)"
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows-bash" ;;
esac
echo "[rba] os=\$OS cpu=\$CPU"

# ─── RAM probe ──────────────────────────────────────────────────────────
RAM_GB="0"
if [ "\$OS" = "macos" ]; then
  RAM_GB=\$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
elif [ "\$OS" = "linux" ]; then
  RAM_GB=\$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 0)
fi
echo "[rba] ram_gb=\$RAM_GB"

if [ "\$RAM_GB" -lt 8 ]; then
  echo "[rba] WARN: less than 8GB RAM — installing fast model only, smart model will use cloud fallback"
  PULL_SMART=0
else
  PULL_SMART=1
fi

# ─── Ollama install ──────────────────────────────────────────────────────
if ! command -v ollama >/dev/null 2>&1; then
  echo "[rba] installing ollama"
  if [ "\$OS" = "macos" ] || [ "\$OS" = "linux" ]; then
    curl -fsSL https://ollama.com/install.sh | sh
  else
    echo "[rba] please install ollama manually from https://ollama.com/download then re-run"
    exit 1
  fi
fi

# Start ollama in the background if not running
if ! pgrep -x ollama >/dev/null 2>&1; then
  echo "[rba] starting ollama"
  nohup ollama serve >>"\$RBA_HOME/ollama.log" 2>&1 &
  sleep 2
fi

# ─── Pull models ─────────────────────────────────────────────────────────
echo "[rba] pulling qwen2.5:1.5b (fast)"
ollama pull qwen2.5:1.5b
MODELS='["qwen2.5:1.5b"]'
if [ "\$PULL_SMART" = "1" ]; then
  echo "[rba] pulling qwen2.5:3b (smart)"
  ollama pull qwen2.5:3b
  MODELS='["qwen2.5:1.5b","qwen2.5:3b"]'
fi

# ─── Redeem install token ────────────────────────────────────────────────
HOSTNAME_RAW="$(hostname 2>/dev/null || echo unknown)"
echo "[rba] redeeming install token"
REDEEM=$(curl -fsS -X POST "\$API_BASE/api/agent/redeem" \\
  -H 'content-type: application/json' \\
  -d "{\\"token\\":\\"\$TOKEN\\",\\"hostname\\":\\"\$HOSTNAME_RAW\\",\\"os\\":\\"\$OS\\",\\"cpu\\":\\"\$CPU\\",\\"ram_gb\\":\$RAM_GB,\\"version\\":\\"0.1.0\\",\\"models\\":\$MODELS}") \\
  || { echo "[rba] redeem failed"; exit 1; }

DEVICE_ID=$(printf '%s' "\$REDEEM" | grep -oE '"device_id":"[^"]+"' | head -1 | cut -d\" -f4)
AGENT_TOKEN=$(printf '%s' "\$REDEEM" | grep -oE '"agent_token":"[^"]+"' | head -1 | cut -d\" -f4)
AGENCY_ID=$(printf '%s' "\$REDEEM" | grep -oE '"agency_id":"[^"]+"' | head -1 | cut -d\" -f4)
ROLE=$(printf '%s' "\$REDEEM" | grep -oE '"role":"[^"]+"' | head -1 | cut -d\" -f4)

if [ -z "\$AGENT_TOKEN" ]; then
  echo "[rba] redeem returned no agent_token: \$REDEEM"
  exit 1
fi

# ─── Write config (chmod 600) ────────────────────────────────────────────
cat >"\$RBA_HOME/config.yaml" <<YAML
api_base: \$API_BASE
device_id: \$DEVICE_ID
agency_id: \$AGENCY_ID
role: \$ROLE
agent_token: \$AGENT_TOKEN
default_model: qwen2.5:1.5b
smart_model: qwen2.5:3b
ollama_url: http://127.0.0.1:11434
heartbeat_interval_seconds: 60
YAML
chmod 600 "\$RBA_HOME/config.yaml"

# ─── Heartbeat scaffold (cron-style loop) ────────────────────────────────
cat >"\$RBA_HOME/heartbeat.sh" <<'BASH'
#!/usr/bin/env bash
set -e
CFG="$HOME/.repflow/agent/config.yaml"
API=$(awk -F': ' '/^api_base:/ {print $2}' "$CFG")
TOK=$(awk -F': ' '/^agent_token:/ {print $2}' "$CFG")
curl -fsS -X POST "$API/api/agent/heartbeat" \\
  -H "content-type: application/json" \\
  -H "x-agent-token: $TOK" \\
  -d '{"version":"0.1.0","status":"active"}' >/dev/null || true
BASH
chmod +x "\$RBA_HOME/heartbeat.sh"

# ─── Auto-start (systemd / launchd) ──────────────────────────────────────
if [ "\$OS" = "linux" ] && command -v systemctl >/dev/null 2>&1; then
  mkdir -p "\$HOME_DIR/.config/systemd/user"
  cat >"\$HOME_DIR/.config/systemd/user/repflow-agent-heartbeat.service" <<UNIT
[Unit]
Description=Repflow agent heartbeat

[Service]
Type=oneshot
ExecStart=\$RBA_HOME/heartbeat.sh
UNIT
  cat >"\$HOME_DIR/.config/systemd/user/repflow-agent-heartbeat.timer" <<UNIT
[Unit]
Description=Repflow agent heartbeat (every 60s)

[Timer]
OnBootSec=30
OnUnitActiveSec=60

[Install]
WantedBy=timers.target
UNIT
  systemctl --user daemon-reload || true
  systemctl --user enable --now repflow-agent-heartbeat.timer || true
elif [ "\$OS" = "macos" ]; then
  PLIST="\$HOME_DIR/Library/LaunchAgents/capital.koino.repflow.agent.plist"
  mkdir -p "\$HOME_DIR/Library/LaunchAgents"
  cat >"\$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>capital.koino.repflow.agent</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>\$RBA_HOME/heartbeat.sh</string>
  </array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PLIST
  launchctl unload "\$PLIST" 2>/dev/null || true
  launchctl load "\$PLIST"
fi

# ─── Send first heartbeat ────────────────────────────────────────────────
echo "[rba] first heartbeat"
"\$RBA_HOME/heartbeat.sh" || true

echo
echo "[rba] ✅ install complete"
echo "[rba]    device:    \$DEVICE_ID"
echo "[rba]    role:      \$ROLE"
echo "[rba]    workspace: \$RBA_HOME"
echo "[rba]    models:    \$MODELS"
echo "[rba] revoke this device any time from Settings → Devices in the Repflow web app."
`;

  return new Response(script, {
    status: 200,
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
