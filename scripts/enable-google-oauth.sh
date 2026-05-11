#!/usr/bin/env bash
# scripts/enable-google-oauth.sh
#
# One-shot enable Google sign-in on the Insurance OS Supabase project.
# Site URL + redirect allow-list are already set; this only needs the
# Client ID + Secret from a Google Cloud OAuth 2.0 Web Application client.
#
# Make the client at: https://console.cloud.google.com/auth/clients
#   - Application type: Web application
#   - Authorized redirect URI:
#       https://jfphwmzwteermalzwojp.supabase.co/auth/v1/callback
#
# Usage:
#   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy bash scripts/enable-google-oauth.sh
#
# Requires SUPABASE_ACCESS_TOKEN in env (already in ~/.secrets/.env).

set -euo pipefail

PROJECT_REF="jfphwmzwteermalzwojp"

: "${SUPABASE_ACCESS_TOKEN:?need SUPABASE_ACCESS_TOKEN in env (source ~/.secrets/.env)}"
: "${GOOGLE_CLIENT_ID:?pass GOOGLE_CLIENT_ID=...}"
: "${GOOGLE_CLIENT_SECRET:?pass GOOGLE_CLIENT_SECRET=...}"

echo "▸ Enabling Google provider on Supabase project ${PROJECT_REF}…"

curl -fsS -X PATCH \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "content-type: application/json" \
  -d @- <<JSON | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:v for k,v in d.items() if "google" in k.lower()}, indent=2))'
{
  "external_google_enabled": true,
  "external_google_client_id": "${GOOGLE_CLIENT_ID}",
  "external_google_secret": "${GOOGLE_CLIENT_SECRET}"
}
JSON

echo "▸ Verifying OAuth authorize endpoint accepts Google…"
RESP=$(curl -s "https://${PROJECT_REF}.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://koino-insurance-os.vercel.app/")
if echo "$RESP" | grep -q "provider is not enabled"; then
  echo "✗ Supabase still reports provider disabled — propagation lag or save failed."
  exit 1
fi
echo "✓ Google sign-in is live. Try the button in the app."
