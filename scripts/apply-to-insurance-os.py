#!/usr/bin/env python3
"""
Apply migrations + seed data from source Repflow project (zybndnqnbxarpkhqpcxq, in
sailorsbot org) onto Insurance OS (jfphwmzwteermalzwojp, in koino org), using a
Personal Access Token minted in the koinod-authed Supabase account.

Usage:
  python3 scripts/apply-to-insurance-os.py migrations
  python3 scripts/apply-to-insurance-os.py seed
  python3 scripts/apply-to-insurance-os.py verify

Reads:
  scripts/migrations-payload.json — list of {version, name, sql} extracted from source

Writes:
  scripts/migration-apply.log — per-migration result line
"""
import base64, json, os, sys, urllib.request, urllib.error, time

PAT = os.environ.get("SUPABASE_ACCESS_TOKEN") or os.environ.get("SUPABASE_PAT")
if not PAT:
    sys.exit("ERROR: set SUPABASE_ACCESS_TOKEN (sbp_...) in env. See ~/.secrets/.env.")
DEST_REF = "jfphwmzwteermalzwojp"
QUERY_URL = f"https://api.supabase.com/v1/projects/{DEST_REF}/database/query"
PAYLOAD_FILE = os.path.join(os.path.dirname(__file__), "migrations-payload.json")
SEED_FILE = os.path.join(os.path.dirname(__file__), "seed-payload.json")
LOG_FILE = os.path.join(os.path.dirname(__file__), "migration-apply.log")


def post_sql(sql: str) -> tuple[int, str]:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        QUERY_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"transport error: {e!r}"


def cmd_migrations() -> int:
    if not os.path.exists(PAYLOAD_FILE):
        print(f"ERROR: missing {PAYLOAD_FILE}", file=sys.stderr)
        return 2
    with open(PAYLOAD_FILE) as f:
        rows = json.load(f)
    print(f">> Applying {len(rows)} migrations to {DEST_REF}")
    with open(LOG_FILE, "w") as log:
        log.write(f"# migration apply log {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        for i, row in enumerate(rows, 1):
            version, name = row["version"], row["name"]
            sql = row["sql"]
            print(f"  [{i:02d}/{len(rows)}] {version} :: {name} ({len(sql)} chars)", end=" ", flush=True)
            status, body = post_sql(sql)
            ok = 200 <= status < 300
            print("OK" if ok else f"FAIL {status}")
            log.write(f"{version}\t{name}\t{status}\t{len(sql)}\n")
            if not ok:
                log.write(f"# RESPONSE: {body[:2000]}\n")
                print(f"     response: {body[:600]}")
                return 1
            # Also record into supabase_migrations.schema_migrations on the dest so
            # future `supabase db push` knows these are applied.
            track_sql = (
                "insert into supabase_migrations.schema_migrations (version, name, statements) "
                "values ($mig_track$" + version + "$mig_track$, "
                "$mig_track$" + name + "$mig_track$, "
                "array[$mig_track$-- replayed from source via management API$mig_track$]) "
                "on conflict (version) do nothing;"
            )
            post_sql(track_sql)  # best-effort, ignore failures
    print(">> All migrations applied.")
    return 0


def cmd_seed() -> int:
    if not os.path.exists(SEED_FILE):
        print(f"ERROR: missing {SEED_FILE}", file=sys.stderr)
        return 2
    with open(SEED_FILE) as f:
        seeds = json.load(f)
    print(f">> Applying {len(seeds)} seed batches to {DEST_REF}")
    for i, batch in enumerate(seeds, 1):
        label = batch.get("label", f"batch_{i}")
        sql = batch["sql"]
        print(f"  [{i:02d}/{len(seeds)}] {label} ({len(sql)} chars)", end=" ", flush=True)
        status, body = post_sql(sql)
        ok = 200 <= status < 300
        print("OK" if ok else f"FAIL {status}")
        if not ok:
            print(f"     response: {body[:600]}")
            return 1
    print(">> All seeds applied.")
    return 0


def cmd_verify() -> int:
    sql = """
      select
        (select count(*) from public.agencies)               as agencies,
        (select count(*) from public.users)                  as users,
        (select count(*) from public.reps)                   as reps,
        (select count(*) from public.prospects)              as prospects,
        (select count(*) from information_schema.tables
            where table_schema='public')                     as public_tables,
        (select count(*) from pg_policies where schemaname='public')
                                                             as rls_policies,
        (select count(*) from supabase_migrations.schema_migrations)
                                                             as applied_migrations;
    """
    status, body = post_sql(sql)
    print(f"verify status={status}")
    print(body)
    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in {"migrations", "seed", "verify"}:
        print(__doc__)
        sys.exit(2)
    cmd = sys.argv[1]
    sys.exit({"migrations": cmd_migrations, "seed": cmd_seed, "verify": cmd_verify}[cmd]())
