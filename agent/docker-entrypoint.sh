#!/usr/bin/env bash
# Docker entrypoint for the Repflow agent.
# 1. If config.yaml exists in the mounted volume, just run the agent.
# 2. Else, redeem RBA_TOKEN against API_BASE and write config.yaml first.

set -euo pipefail

API_BASE="${API_BASE:-https://repflow.koino.capital}"
OLLAMA_URL="${OLLAMA_URL:-http://host.docker.internal:11434}"
RBA_HOME="${RBA_HOME:-/root/.repflow/agent}"
CFG="$RBA_HOME/config.yaml"

mkdir -p "$RBA_HOME" "$RBA_HOME/workspace" "$RBA_HOME/runtime/tools" "$RBA_HOME/scrapers"

if [ ! -f "$CFG" ]; then
  if [ -z "${RBA_TOKEN:-}" ]; then
    echo "[rba] FATAL: no config.yaml and no RBA_TOKEN env var. Generate a one-shot install token in Settings → Agents."
    exit 1
  fi
  echo "[rba] redeeming install token against $API_BASE"
  REDEEM=$(curl -fsS -X POST "$API_BASE/api/agent/redeem" \
    -H 'content-type: application/json' \
    -d "{\"token\":\"$RBA_TOKEN\",\"hostname\":\"$(hostname)\",\"os\":\"docker\",\"cpu\":\"linux/amd64\",\"ram_gb\":0,\"version\":\"0.2.0-docker\",\"models\":[]}") \
    || { echo "[rba] redeem failed"; exit 1; }
  DEVICE_ID=$(printf '%s' "$REDEEM" | grep -oE '"device_id":"[^"]+"' | head -1 | cut -d\" -f4)
  AGENT_TOKEN=$(printf '%s' "$REDEEM" | grep -oE '"agent_token":"[^"]+"' | head -1 | cut -d\" -f4)
  AGENCY_ID=$(printf '%s' "$REDEEM" | grep -oE '"agency_id":"[^"]+"' | head -1 | cut -d\" -f4)
  ROLE=$(printf '%s' "$REDEEM" | grep -oE '"role":"[^"]+"' | head -1 | cut -d\" -f4)
  if [ -z "$AGENT_TOKEN" ]; then
    echo "[rba] redeem returned no agent_token: $REDEEM"
    exit 1
  fi
  cat >"$CFG" <<YAML
api_base: $API_BASE
device_id: $DEVICE_ID
agency_id: $AGENCY_ID
role: $ROLE
agent_token: $AGENT_TOKEN
default_model: qwen2.5:1.5b
smart_model: qwen2.5:3b
ollama_url: $OLLAMA_URL
heartbeat_interval_seconds: 60
version: 0.2.0-docker
YAML
  chmod 600 "$CFG"
  echo "[rba] config written: $CFG (device=$DEVICE_ID role=$ROLE)"
fi

# Copy/update runtime files into the volume on every start so an updated
# image picks up new code.
cp -rf /app/agent/runtime/. "$RBA_HOME/runtime/"
cp -rf /app/agent/scrapers/. "$RBA_HOME/scrapers/"
cp -f /app/agent/quote_agent.py "$RBA_HOME/quote_agent.py"

cd "$RBA_HOME"
export PYTHONPATH="$RBA_HOME:${PYTHONPATH:-}"
exec python -m runtime.agent
