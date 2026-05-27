// POST /api/agent/inspect-db  body: { sql }
// Bearer = x-agent-token — identifies which agent (and therefore which rep's
// context) is querying. Only read-only SQL is permitted; the guard runs BEFORE
// any DB call. Executes via exec_safe_read RPC with service-role key.
// Returns { rows: [...], row_count: N }.
import { rpc, cors, loadInstallByToken, readAgentToken, SERVICE } from "./_lib.js";

export const config = { runtime: "edge" };

// Mutation keywords that must never appear in an "inspect" query.
// The regex is intentionally broad — any word-boundary match is a rejection.
const WRITE_OP_RE = /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|COPY|EXECUTE)\b/i;

const ROW_CAP = 200;

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  // 1. Agent-token auth — must precede SQL validation to prevent oracle attacks.
  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  // 2. Parse body.
  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }

  if (typeof body.sql !== "string" || body.sql.trim().length === 0) {
    return new Response(JSON.stringify({ error: "sql must be a non-empty string" }), { status: 400, headers: cors() });
  }
  if (body.sql.length > 8192) {
    return new Response(JSON.stringify({ error: "sql exceeds 8192 char limit" }), { status: 400, headers: cors() });
  }

  // 3. Security gate — reject any write operation BEFORE touching the DB.
  if (WRITE_OP_RE.test(body.sql)) {
    return new Response(JSON.stringify({ error: "read_only_query_required" }), { status: 400, headers: cors() });
  }

  // 4. Execute via exec_safe_read RPC (service-role so RLS doesn't gate the
  //    inspection surface; the agent-token auth above is the access control layer).
  const r = await rpc("exec_safe_read", { p_sql: body.sql }, SERVICE);

  if (!r.ok) {
    const msg = r.data?.message || r.data?.hint || "";
    // exec_safe_read doesn't exist yet — return a clear signal so the caller
    // knows validation passed but execution is pending the migration.
    if (r.status === 404 || msg.includes("does not exist") || msg.includes("exec_safe_read")) {
      return new Response(
        JSON.stringify({ error: "exec_safe_read_not_available", sql_validated: true }),
        { status: 501, headers: cors() }
      );
    }
    return new Response(JSON.stringify({ error: msg || "query failed" }), { status: r.status, headers: cors() });
  }

  // 5. Cap results at ROW_CAP and return.
  const rows = Array.isArray(r.data) ? r.data.slice(0, ROW_CAP) : [];
  return new Response(
    JSON.stringify({ rows, row_count: rows.length }),
    { status: 200, headers: cors() }
  );
}
