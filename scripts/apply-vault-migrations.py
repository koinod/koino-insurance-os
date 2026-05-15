#!/usr/bin/env python3
"""
Apply migrations 0034 + 0035 (Vault CREATE surface + starter content) onto
the Insurance OS Supabase project. Wraps the existing apply_all_migrations.py
pattern but scoped to just the two new files so we don't replay the whole
history.

Usage:
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/apply-vault-migrations.py

The PAT is minted at https://supabase.com/dashboard/account/tokens under the
koinod-authed account that owns the koino-capital org. Destination project:
jfphwmzwteermalzwojp.

If the PAT isn't available, copy each file's SQL into Supabase Studio →
SQL editor and run it manually. Both files are idempotent — re-running is a
no-op (ALTER TABLE ... IF NOT EXISTS / NOT EXISTS guards on the seeds).
"""
import json, os, sys, time, urllib.request, urllib.error

PAT = os.environ.get("SUPABASE_ACCESS_TOKEN") or os.environ.get("SUPABASE_PAT")
if not PAT:
    sys.exit(
        "ERROR: set SUPABASE_ACCESS_TOKEN (sbp_...) in env, or paste the SQL\n"
        "files into Supabase Studio → SQL editor manually."
    )

DEST_REF = "jfphwmzwteermalzwojp"
QUERY_URL = f"https://api.supabase.com/v1/projects/{DEST_REF}/database/query"

MIGRATIONS = [
    "supabase/migrations/0034_vault_create_surface.sql",
    "supabase/migrations/0035_vault_starter_content.sql",
]


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
        with urllib.request.urlopen(req, timeout=240) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"transport error: {e!r}"


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    for rel in MIGRATIONS:
        path = os.path.join(repo_root, rel)
        if not os.path.isfile(path):
            sys.exit(f"missing: {rel}")
        with open(path, "r", encoding="utf-8") as f:
            sql = f.read()
        name = os.path.basename(rel)
        print(f">> applying {name} ({len(sql)} chars)…", end=" ", flush=True)
        status, body = post_sql(sql)
        ok = 200 <= status < 300
        print("OK" if ok else f"FAIL {status}")
        if not ok:
            print(f"   response: {body[:1200]}")
            return 1
        time.sleep(0.3)

    # Verification: count starter rows so the operator knows seeds landed.
    print(">> verifying starter row counts…")
    status, body = post_sql("""
        select
          (select count(*) from public.training_courses where is_starter = true) as starter_courses,
          (select count(*) from public.agency_scripts   where is_starter = true) as starter_scripts;
    """)
    print(f"   {body[:800]}")
    print(">> done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
