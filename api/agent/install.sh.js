// GET /api/agent/install.sh — one-line installer for macOS/Linux.
//
// Usage:
//   curl -fsSL https://repflow.koino.capital/api/agent/install.sh?token=XXXX | bash
//
// What it does:
//   1. Verifies Python 3.10+, installs venv at ~/.repflow/agent/venv
//   2. pip-installs runtime deps (requests, scrapling[fetchers], playwright)
//   3. Installs Ollama if missing; pulls fast (qwen2.5:1.5b) + smart (qwen2.5:3b
//      on 8GB+ / qwen2.5:7b on 16GB+)
//   4. Downloads the agent runtime + scrapers from this deploy (raw static
//      files served from the repo root)
//   5. Redeems the install token → writes config.yaml (chmod 600)
//   6. Registers a long-running service (launchd on macOS / systemd-user
//      on Linux) that runs `python -m runtime.agent` continuously
//   7. Sends first heartbeat
export const config = { runtime: "edge" };

// Files to fetch from the deploy. Kept in sync with agent/ tree.
const RUNTIME_FILES = [
  "agent/quote_agent.py",
  "agent/runtime/__init__.py",
  "agent/runtime/agent.py",
  "agent/runtime/tools/__init__.py",
  "agent/runtime/tools/_stubs.py",
  "agent/runtime/tools/auto_quote.py",
  "agent/runtime/tools/twilio_dial.py",
  "agent/runtime/tools/draft_sms.py",
  "agent/runtime/tools/draft_email.py",
  "agent/runtime/tools/sendblue_send.py",
  "agent/runtime/tools/fathom_pull_notes.py",
  "agent/runtime/tools/linkedin_send.py",
  "agent/runtime/tools/linkedin_inbox_scan.py",
  "agent/runtime/tools/fb_pull_lead_forms.py",
  "agent/runtime/tools/ig_dm_reply.py",
  "agent/runtime/tools/meta_dm_send.py",
  "agent/runtime/tools/script_review.py",
  "agent/runtime/tools/file_review.py",
  "agent/runtime/tools/browser_run.py",
];

const SCRAPER_FILES = [
  "agent/scrapers/__init__.py",
  "agent/scrapers/_template.py",
  "agent/scrapers/aetna.py", "agent/scrapers/aig.py", "agent/scrapers/americanamicable.py",
  "agent/scrapers/cigna.py", "agent/scrapers/ethos.py", "agent/scrapers/fg.py",
  "agent/scrapers/foresters.py", "agent/scrapers/humana.py", "agent/scrapers/instabrain.py",
  "agent/scrapers/lumico.py", "agent/scrapers/moo.py", "agent/scrapers/sbli.py",
  "agent/scrapers/transamerica.py", "agent/scrapers/uhc.py",
];

export default async function handler(req) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  const apiBase = `${url.protocol}//${url.host}`;

  // Build a single bash array literal of files to download.
  const fileList = RUNTIME_FILES.concat(SCRAPER_FILES).map(f => `"${f}"`).join(" ");

  const script = `#!/usr/bin/env bash
# Repflow Agent — installer for macOS / Linux
# Generated for token ${token ? token.slice(0, 8) + "…" : "(no token)"}
set -euo pipefail

API_BASE="${apiBase}"
TOKEN="${token || "${RBA_TOKEN:-}"}"
HOME_DIR="\${HOME:-$HOME}"
RBA_HOME="\$HOME_DIR/.repflow/agent"
LOG="\$RBA_HOME/install.log"

if [ -z "\$TOKEN" ]; then
  echo "[rba] no token. open Settings → Agents in the Repflow web app and click 'Install on a machine'."
  exit 1
fi

mkdir -p "\$RBA_HOME" "\$RBA_HOME/workspace" "\$RBA_HOME/runtime" "\$RBA_HOME/runtime/tools" "\$RBA_HOME/scrapers"
exec > >(tee -a "\$LOG") 2>&1
echo "[rba] $(date -u) install begins"

# ─── 1. OS + RAM probe ──────────────────────────────────────────────────
OS="unknown"; CPU="$(uname -m 2>/dev/null || echo unknown)"
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows-bash" ;;
esac
RAM_GB="0"
if [ "\$OS" = "macos" ]; then
  RAM_GB=\$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
elif [ "\$OS" = "linux" ]; then
  RAM_GB=\$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 0)
fi
echo "[rba] os=\$OS cpu=\$CPU ram_gb=\$RAM_GB"

# ─── 2. Python 3.10+ + venv ────────────────────────────────────────────
PY=""
for cand in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "\$cand" >/dev/null 2>&1; then
    ver=\$("\$cand" -c 'import sys; print(sys.version_info.major*100+sys.version_info.minor)' 2>/dev/null || echo 0)
    if [ "\$ver" -ge 310 ]; then PY="\$cand"; break; fi
  fi
done
if [ -z "\$PY" ]; then
  echo "[rba] python 3.10+ not found. install from python.org or 'brew install python@3.12' then re-run."
  exit 1
fi
echo "[rba] python: \$(\$PY --version) at \$(command -v \$PY)"

if [ ! -d "\$RBA_HOME/venv" ]; then
  echo "[rba] creating venv"
  "\$PY" -m venv "\$RBA_HOME/venv"
fi
source "\$RBA_HOME/venv/bin/activate"
pip install --quiet --upgrade pip wheel
echo "[rba] installing python deps"
pip install --quiet 'requests>=2.31' 'scrapling[fetchers]>=0.4.7' playwright
python -m playwright install --with-deps chromium 2>/dev/null || python -m playwright install chromium

# ─── 3. Ollama + models ────────────────────────────────────────────────
if ! command -v ollama >/dev/null 2>&1; then
  echo "[rba] installing ollama"
  if [ "\$OS" = "macos" ] || [ "\$OS" = "linux" ]; then
    curl -fsSL https://ollama.com/install.sh | sh
  fi
fi
if ! pgrep -x ollama >/dev/null 2>&1; then
  nohup ollama serve >>"\$RBA_HOME/ollama.log" 2>&1 &
  sleep 2
fi
ollama pull qwen2.5:1.5b
MODELS='["qwen2.5:1.5b"]'
SMART="qwen2.5:3b"
if [ "\$RAM_GB" -ge 16 ]; then
  SMART="qwen2.5:7b"
fi
if [ "\$RAM_GB" -ge 8 ]; then
  ollama pull "\$SMART"
  MODELS=\$(printf '["qwen2.5:1.5b","%s"]' "\$SMART")
fi

# ─── 4. Pull runtime files ─────────────────────────────────────────────
FILES=(${fileList})
echo "[rba] downloading \${#FILES[@]} runtime files"
for rel in "\${FILES[@]}"; do
  # rel is like "agent/runtime/agent.py"; strip the "agent/" prefix for both
  # the destination path and the runtime-file endpoint param.
  dest_rel=\$(echo "\$rel" | sed 's|^agent/||')
  dest="\$RBA_HOME/\$dest_rel"
  mkdir -p "\$(dirname "\$dest")"
  url="\$API_BASE/api/agent/runtime-file?path=\$dest_rel"
  if ! curl -fsSL "\$url" -o "\$dest"; then
    echo "[rba] WARN failed to fetch \$dest_rel — skipping"
  fi
done

# ─── 5. Redeem install token → write config.yaml ───────────────────────
HOSTNAME_RAW="$(hostname 2>/dev/null || echo unknown)"
echo "[rba] redeeming install token"
REDEEM=$(curl -fsS -X POST "\$API_BASE/api/agent/redeem" \\
  -H 'content-type: application/json' \\
  -d "{\\"token\\":\\"\$TOKEN\\",\\"hostname\\":\\"\$HOSTNAME_RAW\\",\\"os\\":\\"\$OS\\",\\"cpu\\":\\"\$CPU\\",\\"ram_gb\\":\$RAM_GB,\\"version\\":\\"0.2.0\\",\\"models\\":\$MODELS}")
DEVICE_ID=\$(printf '%s' "\$REDEEM" | grep -oE '"device_id":"[^"]+"' | head -1 | cut -d\\" -f4)
AGENT_TOKEN=\$(printf '%s' "\$REDEEM" | grep -oE '"agent_token":"[^"]+"' | head -1 | cut -d\\" -f4)
AGENCY_ID=\$(printf '%s' "\$REDEEM" | grep -oE '"agency_id":"[^"]+"' | head -1 | cut -d\\" -f4)
ROLE=\$(printf '%s' "\$REDEEM" | grep -oE '"role":"[^"]+"' | head -1 | cut -d\\" -f4)

if [ -z "\$AGENT_TOKEN" ]; then
  echo "[rba] redeem failed: \$REDEEM"
  exit 1
fi

cat >"\$RBA_HOME/config.yaml" <<YAML
api_base: \$API_BASE
device_id: \$DEVICE_ID
agency_id: \$AGENCY_ID
role: \$ROLE
agent_token: \$AGENT_TOKEN
default_model: qwen2.5:1.5b
smart_model: \$SMART
ollama_url: http://127.0.0.1:11434
heartbeat_interval_seconds: 60
version: 0.2.0
YAML
chmod 600 "\$RBA_HOME/config.yaml"

# ─── 6. Long-running service ───────────────────────────────────────────
PY_BIN="\$RBA_HOME/venv/bin/python"
RUN_CMD="\$PY_BIN -m runtime.agent"
WORKDIR="\$RBA_HOME"

if [ "\$OS" = "macos" ]; then
  PLIST="\$HOME_DIR/Library/LaunchAgents/capital.koino.repflow.agent.plist"
  mkdir -p "\$HOME_DIR/Library/LaunchAgents"
  cat >"\$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>capital.koino.repflow.agent</string>
  <key>ProgramArguments</key><array>
    <string>\$PY_BIN</string><string>-m</string><string>runtime.agent</string>
  </array>
  <key>WorkingDirectory</key><string>\$WORKDIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>\$RBA_HOME/agent.stdout.log</string>
  <key>StandardErrorPath</key><string>\$RBA_HOME/agent.stderr.log</string>
</dict></plist>
PLIST
  launchctl unload "\$PLIST" 2>/dev/null || true
  launchctl load "\$PLIST"
elif [ "\$OS" = "linux" ] && command -v systemctl >/dev/null 2>&1; then
  mkdir -p "\$HOME_DIR/.config/systemd/user"
  cat >"\$HOME_DIR/.config/systemd/user/repflow-agent.service" <<UNIT
[Unit]
Description=Repflow Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=\$WORKDIR
ExecStart=\$PY_BIN -m runtime.agent
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload || true
  systemctl --user enable --now repflow-agent.service || true
else
  echo "[rba] WARN: no service manager wired for this OS — start manually with: cd \$WORKDIR && \$RUN_CMD"
fi

# ─── 7. First heartbeat ────────────────────────────────────────────────
curl -fsS -X POST "\$API_BASE/api/agent/heartbeat" \\
  -H 'content-type: application/json' \\
  -H "x-agent-token: \$AGENT_TOKEN" \\
  -d '{"version":"0.2.0","status":"active"}' >/dev/null || true

echo
echo "[rba] ✅ install complete"
echo "[rba]    device:    \$DEVICE_ID"
echo "[rba]    role:      \$ROLE"
echo "[rba]    workspace: \$RBA_HOME"
echo "[rba]    models:    \$MODELS"
echo "[rba]    service:   \$( [ "\$OS" = "macos" ] && echo "launchd: capital.koino.repflow.agent" || echo "systemd-user: repflow-agent.service" )"
echo "[rba] revoke any time from Settings → Agents in the Repflow web app."
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
