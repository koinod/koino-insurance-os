// .github/scripts/migration-gate.mjs
//
// For each newly added supabase/migrations/*.sql file, verify the
// corresponding migration is recorded against the prod Supabase project.
// Fails CI if any are missing — forcing the operator to run
// `mcp__claude_ai_Supabase__apply_migration` BEFORE the dependent
// frontend code lands on main.
//
// Inputs (env):
//   SUPABASE_ACCESS_TOKEN  — personal access token (repo secret)
//   SUPABASE_PROJECT_REF   — e.g. jfphwmzwteermalzwojp
//   NEW_FILES              — pipe-separated list of added .sql paths
//
// Name matching: a local file `0041_manager_pnl_snapshot.sql` is
// considered applied if Supabase's recorded migration name equals
// either the full basename ("0041_manager_pnl_snapshot") OR the
// basename with leading digit-prefix stripped ("manager_pnl_snapshot").
// This tolerates both naming conventions seen in prod history.

import { basename } from "node:path";

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, NEW_FILES } = process.env;

if (!SUPABASE_ACCESS_TOKEN) {
  console.error("✘ SUPABASE_ACCESS_TOKEN repo secret is not configured.");
  console.error("  Add a Supabase personal access token in repo Settings → Secrets and variables → Actions.");
  process.exit(2);
}
if (!SUPABASE_PROJECT_REF) {
  console.error("✘ SUPABASE_PROJECT_REF env var is missing.");
  process.exit(2);
}

const newFiles = (NEW_FILES || "").split("|").map(s => s.trim()).filter(Boolean);
if (newFiles.length === 0) {
  console.log("✓ No new migration files in this diff. Nothing to gate.");
  process.exit(0);
}

console.log(`Gating ${newFiles.length} new migration file(s):`);
for (const f of newFiles) console.log(`  - ${f}`);

const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/migrations`;
const r = await fetch(url, {
  headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
});
if (!r.ok) {
  const body = await r.text().catch(() => "");
  console.error(`✘ Supabase Management API call failed (${r.status}): ${body.slice(0, 500)}`);
  process.exit(2);
}
const applied = await r.json();
if (!Array.isArray(applied)) {
  console.error(`✘ Unexpected response shape from migrations API.`);
  console.error(JSON.stringify(applied).slice(0, 500));
  process.exit(2);
}
const appliedNames = new Set(applied.map(m => m && m.name).filter(Boolean));

console.log(`Prod has ${appliedNames.size} applied migration(s).`);

const missing = [];
for (const f of newFiles) {
  const stem = basename(f, ".sql");
  const stripped = stem.replace(/^\d+_/, "");
  if (appliedNames.has(stem) || appliedNames.has(stripped)) {
    console.log(`  ✓ ${f}`);
  } else {
    console.log(`  ✘ ${f}  (looked for "${stem}" or "${stripped}")`);
    missing.push(f);
  }
}

if (missing.length > 0) {
  console.error("");
  console.error(`✘ ${missing.length} migration(s) are committed but NOT applied to prod (${SUPABASE_PROJECT_REF}):`);
  for (const f of missing) console.error(`    - ${f}`);
  console.error("");
  console.error("Apply before merging:");
  console.error(`    mcp__claude_ai_Supabase__apply_migration(project_id="${SUPABASE_PROJECT_REF}", name="<name>", query=<sql>)`);
  console.error("");
  console.error("This gate exists because of the 2026-05-19 P&L regression — frontend shipped");
  console.error("calling a manager_pnl_snapshot RPC that lived in the repo but not in prod.");
  process.exit(1);
}

console.log("");
console.log(`✓ all ${newFiles.length} new migration(s) verified applied to prod.`);
