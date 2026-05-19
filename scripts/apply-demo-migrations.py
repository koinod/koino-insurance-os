#!/usr/bin/env python3
"""
Apply migrations 0048, 0049, 0050 to the Insurance OS Supabase project.
Usage: python3 scripts/apply-demo-migrations.py
Requires SUPABASE_ACCESS_TOKEN in env (sbp_...).
"""
import os, sys, json, time, urllib.request, urllib.error

PAT = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if not PAT:
    sys.exit("ERROR: SUPABASE_ACCESS_TOKEN not set.")

DEST_REF  = "jfphwmzwteermalzwojp"
QUERY_URL = f"https://api.supabase.com/v1/projects/{DEST_REF}/database/query"

MIGRATIONS = [
    "supabase/migrations/0048_demo_reset_rpc.sql",
    "supabase/migrations/0049_demo_reset_cron.sql",
    "supabase/migrations/0050_vault_script_library.sql",
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def post_sql(sql):
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        QUERY_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"transport: {e!r}"


def main():
    for rel in MIGRATIONS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print(f"MISSING: {path}")
            return 1
        with open(path, encoding="utf-8") as f:
            sql = f.read()
        name = os.path.basename(rel)
        print(f"Applying {name} ({len(sql):,} chars)...", end=" ", flush=True)
        status, body = post_sql(sql)
        if 200 <= status < 300:
            print("OK")
        else:
            print(f"FAILED ({status})")
            print(body[:1000])
            return 1
        time.sleep(1)

    # Verify reset_demo_agency exists
    print("\nVerifying reset_demo_agency function exists...")
    status, body = post_sql(
        "select routine_name from information_schema.routines "
        "where routine_schema='public' and routine_name='reset_demo_agency' limit 1"
    )
    print(f"  status={status}, body={body[:200]}")

    # Invoke the RPC
    print("\nInvoking reset_demo_agency('atlas')...")
    status, body = post_sql("select public.reset_demo_agency('atlas')")
    print(f"  status={status}")
    print(f"  result={body[:1000]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
