#!/usr/bin/env sh
# Repflow agent host installer. Reads REPFLOW_TOKEN + REPFLOW_URL from env.
# Registers this machine with the operator's Repflow project and starts a
# heartbeat loop. After enrollment, the platform can deploy agents to this host.
set -eu

: "${REPFLOW_TOKEN:?REPFLOW_TOKEN env var required (paste from Repflow → Hardware → Enroll new host)}"
: "${REPFLOW_URL:=https://koino-insurance-os.vercel.app}"

# Pull Supabase URL+key from the platform's token-issuance response, so this
# script keeps working if the operator transfers Supabase ownership later.
# Fallback to defaults if the token endpoint is unreachable.
PLATFORM_CONFIG="$(curl -fsSL "$REPFLOW_URL/api/agents/issue-token" \
  -X POST -H 'content-type: application/json' \
  -d "{\"hint\":\"host-bootstrap\",\"_token_lookup\":\"$REPFLOW_TOKEN\"}" 2>/dev/null || echo '{}')"
SUPABASE_URL="$(printf '%s' "$PLATFORM_CONFIG" | python3 -c "import sys,json; d=json.loads(sys.stdin.read() or '{}'); print(d.get('supabase_url','https://zybndnqnbxarpkhqpcxq.supabase.co'))" 2>/dev/null || echo "https://zybndnqnbxarpkhqpcxq.supabase.co")"
SUPABASE_KEY="$(printf '%s' "$PLATFORM_CONFIG" | python3 -c "import sys,json; d=json.loads(sys.stdin.read() or '{}'); print(d.get('supabase_anon','sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W'))" 2>/dev/null || echo "sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W")"

HOSTNAME_VAL="$(hostname 2>/dev/null || echo unknown)"
KIND_VAL="$(uname -s 2>/dev/null || echo Unknown)"
FP="$(printf '%s-%s-%s' "$HOSTNAME_VAL" "$(uname -m)" "$RANDOM" | sha256sum 2>/dev/null | cut -c1-16 || echo "fp$$")"
INSTALL_DIR="${HOME}/.repflow"
mkdir -p "$INSTALL_DIR"

echo ">> Repflow agent host installer"
echo "   Host:     $HOSTNAME_VAL"
echo "   Kind:     $KIND_VAL"
echo "   URL:      $REPFLOW_URL"
echo "   Token:    ${REPFLOW_TOKEN%${REPFLOW_TOKEN#?????????????}}…"
echo

# 1. Register via the secure SQL function
echo ">> Registering host..."
RESP="$(curl -fsSL -X POST "$SUPABASE_URL/rest/v1/rpc/enroll_host" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "content-type: application/json" \
  -d "$(printf '{"p_token":"%s","p_hostname":"%s","p_kind":"%s","p_fingerprint":"%s"}' "$REPFLOW_TOKEN" "$HOSTNAME_VAL" "$KIND_VAL" "$FP")")"

# Extract host id from response (a quoted string like "abc123...")
HOST_ID="$(printf '%s' "$RESP" | tr -d '"\n')"
case "$HOST_ID" in
  rfk_*|"") echo "!! enrollment failed: $RESP"; exit 1;;
  *)         echo ">> host_id: $HOST_ID";;
esac

# 2. Persist config
cat > "$INSTALL_DIR/config" <<EOF
REPFLOW_HOST_ID=$HOST_ID
REPFLOW_URL=$REPFLOW_URL
SUPABASE_URL=$SUPABASE_URL
SUPABASE_KEY=$SUPABASE_KEY
ENROLLED_AT=$(date -u +%FT%TZ)
EOF
chmod 600 "$INSTALL_DIR/config"

# 3. Heartbeat loop daemon
cat > "$INSTALL_DIR/heartbeat.sh" <<'HBEOF'
#!/usr/bin/env sh
. "$HOME/.repflow/config"
LOAD="$(uptime 2>/dev/null | awk -F'load average:' '{print $2}' | awk -F, '{print int($1*100)}' || echo 0)"
curl -fsSL -X POST "$SUPABASE_URL/rest/v1/rpc/heartbeat_host" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "content-type: application/json" \
  -d "{\"p_id\":\"$REPFLOW_HOST_ID\",\"p_load_pct\":$LOAD}" >/dev/null 2>&1 || true
HBEOF
chmod +x "$INSTALL_DIR/heartbeat.sh"

# 4. Pull the agent-runner so this box also executes deployed agents
curl -fsSL "$REPFLOW_URL/agent-runner.sh" -o "$INSTALL_DIR/agent-runner.sh" && chmod +x "$INSTALL_DIR/agent-runner.sh" || true

# 5. Schedule heartbeat (1 min) + agent-runner (2 min) cron entries
if command -v crontab >/dev/null 2>&1; then
  ( crontab -l 2>/dev/null | grep -v 'repflow/heartbeat\|repflow/agent-runner' ; \
    echo "* * * * * $INSTALL_DIR/heartbeat.sh"; \
    echo "*/2 * * * * $INSTALL_DIR/agent-runner.sh" ) | crontab -
  echo ">> Heartbeat (1m) + agent runner (2m) scheduled via cron"
else
  echo "!! cron unavailable — run heartbeat.sh + agent-runner.sh manually, or wire to launchd"
fi

# 5. First heartbeat now
"$INSTALL_DIR/heartbeat.sh" || true

echo
echo ">> Done. This host is enrolled as: $HOST_ID"
echo ">> Open Repflow → Hardware to see it appear within ~10 seconds."
echo ">> To deploy an agent here:    Repflow → Agents → Deploy → choose this host."
