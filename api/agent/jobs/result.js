// POST /api/agent/jobs/result
//
// Caller: an installed agent daemon (auth = x-agent-token bearer).
// Body:   { job_id, status: "succeeded" | "failed", result?: {...}, error?: "..." }
//
// Returns 200 { ok: true } on accept,
//         401 { error } if token invalid,
//         404 { error } if the job_id isn't running and owned by this install's agency.
import {
  SUPA_URL, SERVICE, cors, readAgentToken, loadInstallByToken,
  writeAgentAudit,
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
  const jobId  = body.job_id;
  const status = body.status === "succeeded" || body.status === "failed" ? body.status : null;
  if (!jobId)  return reply(400, { error: "job_id required" });
  if (!status) return reply(400, { error: "status must be succeeded|failed" });

  const patch = {
    status,
    finished_at: new Date().toISOString(),
    result: body.result ?? null,
    error:  status === "failed" ? String(body.error || "").slice(0, 4000) || null : null,
  };

  // Restrict the update to (this agency, running) so a malicious agent can't
  // overwrite jobs from other agencies.
  const r = await svc(
    "PATCH",
    `/agent_jobs?id=eq.${encodeURIComponent(jobId)}&agency_id=eq.${encodeURIComponent(inst.agency_id)}&status=eq.running&select=id,kind,user_id,rep_id,payload_hash`,
    patch,
    { "prefer": "return=representation" },
  );
  if (!r.ok) return reply(500, { error: "result write failed", detail: r.data });
  const updated = Array.isArray(r.data) ? r.data[0] : null;
  if (!updated) return reply(404, { error: "job not running or not yours" });

  await writeAgentAudit({
    agency_id:    inst.agency_id,
    user_id:      updated.user_id,
    rep_id:       updated.rep_id,
    job_id:       updated.id,
    kind:         updated.kind,
    payload_hash: updated.payload_hash,
    ring:         "execute",
    decision:     status === "succeeded" ? "execute" : "fail",
    reason:       status === "failed" ? (patch.error || "failed") : null,
    metadata:     { device_id: inst.device_id },
  });

  return reply(200, { ok: true });
}
