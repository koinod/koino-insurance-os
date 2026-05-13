# Supabase project configuration

The Repflow client + Edge functions all read from the same constants in
`lib/supabase-config.js`. To migrate Repflow to a different Supabase
project, edit that single file plus the Vercel env vars.

## Current project (Repflow / Insurance OS)

| Field | Value |
|---|---|
| Ref | `jfphwmzwteermalzwojp` |
| URL | `https://jfphwmzwteermalzwojp.supabase.co` |
| Anon key | see `lib/supabase-config.js` (`DEFAULT_ANON`) |
| Region | us-east-1 |
| Org | koino-capital (koinod-authed) |
| Status | ACTIVE_HEALTHY |

## Sister project (Koino OS / internal)

| Field | Value |
|---|---|
| Ref | `qxwixqnbgpnuvbuntygw` |
| Name | koino-os |
| Holds | Recruiter OS, Maranatha, Koino terminal lines, OMNI memory, koino_tenants, etc. |
| **NOT touched by Repflow.** Separate project, separate concerns. |

## Migration history

All applied migrations are tracked in `supabase_migrations.schema_migrations`
on the live project. The locally-checked-in copies in this directory are
authoritative for reproducibility:

- `0001_repflow_v2_init.sql` — initial schema
- `0002_fill_missing_domains.sql` — backfill demo data

Remaining migrations were applied via Supabase MCP during the build
session. To replay them on a fresh project:

```bash
# After creating a new Supabase project, dump the source schema:
PGPASSWORD=$SOURCE_PG_PASS pg_dump \
  --host=db.jfphwmzwteermalzwojp.supabase.co \
  --username=postgres \
  --schema=public \
  --no-owner --no-privileges \
  > supabase/migrations/full_schema_snapshot.sql

# Apply to the new project:
PGPASSWORD=$DEST_PG_PASS psql \
  --host=db.<new-ref>.supabase.co \
  --username=postgres \
  -f supabase/migrations/full_schema_snapshot.sql
```

Or use the Supabase CLI:

```bash
supabase link --project-ref <new-ref>
supabase db push
```
