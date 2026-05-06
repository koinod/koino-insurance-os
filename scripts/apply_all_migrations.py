#!/usr/bin/env python3
"""
Apply all 21 Repflow migrations from source to destination Insurance OS project.
Source data was pulled from supabase_migrations.schema_migrations on the source DB
(zybndnqnbxarpkhqpcxq) via execute_sql with base64-encoded SQL bodies.

Destination: jfphwmzwteermalzwojp (Insurance OS, koino org).
Uses Personal Access Token against the Supabase Management API.

Each migration's `b64` field is the base64 encoding of the concatenated statements.
Newlines and other non-alphabet whitespace inside b64 strings are tolerated by
base64.b64decode under default validate=False.
"""
import base64, json, os, sys, time, urllib.request, urllib.error

PAT = os.environ.get("SUPABASE_ACCESS_TOKEN") or os.environ.get("SUPABASE_PAT")
if not PAT:
    sys.exit("ERROR: set SUPABASE_ACCESS_TOKEN (sbp_...) in env. See ~/.secrets/.env.")
DEST_REF = "jfphwmzwteermalzwojp"
QUERY_URL = f"https://api.supabase.com/v1/projects/{DEST_REF}/database/query"
LOG_FILE = os.path.join(os.path.dirname(__file__), "migration-apply.log")
DATA_DIR = os.path.join(os.path.dirname(__file__), "migrations-export")


def load_migrations():
    """Read all .b64 files from migrations-export, decode, return ordered list."""
    if not os.path.isdir(DATA_DIR):
        raise SystemExit(f"missing data dir: {DATA_DIR}")
    rows = []
    for fname in sorted(os.listdir(DATA_DIR)):
        if not fname.endswith(".b64"):
            continue
        path = os.path.join(DATA_DIR, fname)
        with open(path, "r", encoding="utf-8") as f:
            b64 = f.read()
        try:
            sql = base64.b64decode(b64).decode("utf-8")
        except Exception as e:
            raise SystemExit(f"decode failed for {fname}: {e}")
        # Filename: NN_version_name.b64
        stem = fname[:-4]
        rows.append({"file": fname, "stem": stem, "sql": sql})
    return rows


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
        with urllib.request.urlopen(req, timeout=180) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, f"transport error: {e!r}"


def main():
    rows = load_migrations()
    print(f">> Loaded {len(rows)} migrations from {DATA_DIR}")
    with open(LOG_FILE, "w", encoding="utf-8") as log:
        log.write(f"# migration-apply log {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        for i, row in enumerate(rows, 1):
            print(f"  [{i:02d}/{len(rows)}] {row['stem']} ({len(row['sql'])} chars)", end=" ", flush=True)
            status, body = post_sql(row["sql"])
            ok = 200 <= status < 300
            print("OK" if ok else f"FAIL {status}")
            log.write(f"{row['stem']}\t{status}\t{len(row['sql'])}\n")
            if not ok:
                log.write(f"# RESPONSE: {body[:4000]}\n")
                print(f"     response: {body[:800]}")
                return 1
    print(">> All migrations applied successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
