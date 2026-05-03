# Supabase project configuration

The Repflow client + Edge functions all read from the same constants in
`lib/supabase-config.js`. To migrate Repflow to a different Supabase
project (e.g. transfer ownership to koinod-authed org), edit that single
file plus the Vercel env vars.

## Current project (Repflow)

| Field | Value |
|---|---|
| Ref | `zybndnqnbxarpkhqpcxq` |
| URL | `https://zybndnqnbxarpkhqpcxq.supabase.co` |
| Anon key | `sb_publishable_uN_hMYG8Bbv3_ajAYckqjg_5moQ-37W` |
| Region | us-east-2 |
| Org | `sailorsbot` (slug) — to be transferred to koinod-authed org |
| Status | ACTIVE_HEALTHY |

## Sister project (Koino OS / internal)

| Field | Value |
|---|---|
| Ref | `irfumveoqtqifbumdjoa` |
| Name | koino-capital |
| Holds | Recruiter OS, Maranatha, Koino terminal lines, OMNI memory, koino_tenants, etc. |
| **NOT touched by Repflow.** Separate project, separate concerns. |

## Migration history

All 21 applied migrations are tracked in `supabase_migrations.schema_migrations`
on the live project. The locally-checked-in copies in this directory are
authoritative for reproducibility:

- `0001_repflow_v2_init.sql` — initial schema
- `0002_fill_missing_domains.sql` — backfill demo data

The remaining 19 migrations were applied via Supabase MCP during the build
session. To replay them on a fresh project:

```bash
# After creating a new Supabase project, dump the source schema:
PGPASSWORD=$SOURCE_PG_PASS pg_dump \
  --host=db.zybndnqnbxarpkhqpcxq.supabase.co \
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

## Transferring ownership to koinod-authed org

When ready:

1. Sign into Supabase as koinod GitHub account
2. Create a new org (e.g. "Koino")
3. In the sailorsbot org, invite the koinod-authed user as admin
4. Project Settings → General → Transfer Project → select Koino org
5. After transfer completes, remove sailorsbot user from Koino org
6. No code changes required — `lib/supabase-config.js` already centralizes URL + key
