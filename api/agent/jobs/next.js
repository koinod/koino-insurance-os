// POST /api/agent/jobs/next
//
// Caller: an installed agent daemon (auth = x-agent-token bearer).
// Body:   { kinds?: ["quote_carrier", ...] } — filter to job kinds this agent handles.
//
// Returns 200 { id, kind, payload } on a claim, 200 {} when nothing queued,
//         401 { error } if token invalid.
//
// Uses a Supabase RPC to atomically claim the oldest queued job whose kind is
// in `kinds`, flipping status to 'running' and stamping started_at. SQL: SELECT
// ... FOR UPDATE SKIP LOCKED. The RPC is created at the bottom of this file's
// adjacent migration step (see 0027_agent_job_claim_rpc.sql to follow).
//
// For v1, we implement the atomic claim inline via PostgREST. PostgREST does
// not expose FOR UPDATE SKIP LOCKED on plain SELECTs, so we use an UPDATE-WHERE
// IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) pattern. To do that we need
// to call execute-level SQL — easiest is a SECURITY DEFINER function applied
// in a follow-up migration.
//
// Until that migration lands, we use an optimistic UPDATE pattern: pick the
// oldest 'queued' row matching kinds whose agency is this install's, set it
// running, and check rowcount. Two concurrent pollers can race; the loser
// gets {} and tries again.
import {
  SUPA_URL, SERVICE, cors, readAgentToken, loadInstallByToken,
} from "../_lib.js";

export const config = { runtime: "edge" };

async function svc(method, path, body, extraHeaders) {
  const opts = {
    method,
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
      ...(extraHeaders || {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, opts);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!SERVICE) return reply(500, { error: "server misconfigured" });

  const token = readAgentToken(req);
  const inst  = await loadInstallByToken(token);
  if (!inst) return reply(401, { error: "invalid agent token" });

  let body = {};
  try { body = await req.json(); } catch {}
  const kinds = Array.isArray(body.kinds) ? body.kinds.filter(k => typeof k === "string" && k.length <= 64) : [];
  if (kinds.length === 0) return reply(400, { error: "kinds required" });

  // Find the oldest queued job for this agency + matching kind.
  const inList = kinds.map(k => `"${encodeURIComponent(k)}"`).join(",");
  const peek = await svc(
    "GET",
    `/agent_jobs?agency_id=eq.${encodeURIComponent(inst.agency_id)}&status=eq.queued&kind=in.(${inList})&select=id&order=created_at.asc&limit=1`,
  );
  if (!peek.ok) return reply(500, { error: "queue peek failed" });
  const row = Array.isArray(peek.data) ? peek.data[0] : null;
  if (!row) return reply(200, {});

  // Atomically claim via UPDATE-with-precondition; only one poller wins.
  const now = new Date().toISOString();
  const claim = await svc(
    "PATCH",
    `/agent_jobs?id=eq.${encodeURIComponent(row.id)}&status=eq.queued&select=id,kind,payload`,
    { status: "running", started_at: now },
    { "prefer": "return=representation" },
  );
  if (!claim.ok) return reply(500, { error: "claim failed", detail: claim.data });
  const claimed = Array.isArray(claim.data) ? claim.data[0] : null;
  if (!claimed) return reply(200, {}); // race lost — caller polls again

  return reply(200, { id: claimed.id, kind: claimed.kind, payload: claimed.payload });
}
