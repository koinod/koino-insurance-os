#!/usr/bin/env sh
# scripts/migrate-supabase.sh — replay every applied migration onto a fresh
# Supabase project. Used when transferring Repflow to a koinod-authed org or
# during disaster recovery.
#
# Usage:
#   SOURCE_DB_URL=postgresql://postgres:PASS@db.zybndnqnbxarpkhqpcxq.supabase.co:5432/postgres \
#   DEST_DB_URL=postgresql://postgres:PASS@db.<new-ref>.supabase.co:5432/postgres \
#   sh scripts/migrate-supabase.sh
#
# What it does:
#   1. pg_dump --schema-only against SOURCE → schema.sql
#   2. pg_dump --data-only --table=public.* against SOURCE for non-seed tables
#   3. psql against DEST to apply schema, then data
#   4. Smoke test: count rows on a few tables
#
# Requires: pg_dump 17.x, psql 17.x (matching Supabase Postgres version).
set -eu

: "${SOURCE_DB_URL:?SOURCE_DB_URL required (postgres:// connection string)}"
: "${DEST_DB_URL:?DEST_DB_URL required}"

OUTDIR="${OUTDIR:-./supabase/migration-snapshot}"
mkdir -p "$OUTDIR"

echo ">> Dumping schema from source..."
pg_dump --no-owner --no-privileges --schema=public --schema-only "$SOURCE_DB_URL" > "$OUTDIR/schema.sql"
echo "   $(wc -l < "$OUTDIR/schema.sql") lines"

echo ">> Dumping data from source..."
pg_dump --no-owner --no-privileges --schema=public --data-only \
  --exclude-table=public.stripe_events \
  --exclude-table=public.agency_audit_log \
  --exclude-table=public.agent_runs \
  "$SOURCE_DB_URL" > "$OUTDIR/data.sql"
echo "   $(wc -l < "$OUTDIR/data.sql") lines"

echo ">> Applying schema to destination..."
psql "$DEST_DB_URL" -v ON_ERROR_STOP=1 -f "$OUTDIR/schema.sql"

echo ">> Applying data..."
psql "$DEST_DB_URL" -v ON_ERROR_STOP=1 -f "$OUTDIR/data.sql"

echo ">> Verifying row counts..."
psql "$DEST_DB_URL" -c "
  select
    (select count(*) from public.agencies)             as agencies,
    (select count(*) from public.reps)                  as reps,
    (select count(*) from public.pipeline)              as pipeline,
    (select count(*) from public.queue)                 as queue,
    (select count(*) from public.connections)           as connections,
    (select count(*) from public.hardware)              as hardware,
    (select count(*) from public.ai_agents)             as agents,
    (select count(*) from public.workflows)             as workflows,
    (select count(*) from public.recordings)            as recordings,
    (select count(*) from public.agency_notifications)  as notifs;
"

echo
echo ">> Migration complete. Next steps:"
echo "   1. Edit lib/supabase-config.js with the new project URL + anon key"
echo "   2. Update Vercel env vars: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   3. Trigger a redeploy"
echo "   4. Smoke test: curl /api/copilot to verify, sign in, verify pipeline loads"
echo "   5. After 24-48h of stable operation, drop the old project"
