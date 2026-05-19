// POST /api/agent/jobs/approve
//
// Caller: authenticated web app user (User JWT in Authorization header).
// Body:   { job_id, decision: "approve" | "deny", reason?: "..." }
//
// Returns 200 { ok, status: "queued" | "denied" } on success,
//         401 { error } if JWT missing,
//         403 { error } if caller's role can't approve this kind,
//         404 { error } if job doesn't exist / not in pending_approval.
//
// Approval rules:
//   - super_admin can approve/deny anything.
//   - For other roles: the caller must be on the same agency as the job AND
//     have a role that's allowed to *enqueue* that kind (role_actions.allow=true).
//     Rationale: if your role can submit it, you can approve someone else's
//     submission too. For finer-grained policy we can move this to a
//     dedicated `role_approvals` table later.
import {
  SUPA_URL, SERVICE, cors, readUserJwt, loadCallerFromJwt,
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

  const jwt = readUserJwt(req);
  const caller = await loadCallerFromJwt(jwt);
  if (!caller) return reply(401, { error: "unauthenticated" });

  let body = {};
  try { body = await req.json(); } catch {}
  const jobId = body.job_id;
  const decision = body.decision === "approve" || body.decision === "deny" ? body.decision : null;
  if (!jobId)    return reply(400, { error: "job_id required" });
  if (!decision) return reply(400, { error: "decision must be approve|deny" });
  const reason = body.reason ? String(body.reason).slice(0, 1000) : null;

  // Fetch the pending job.
  const lookup = await svc(
    "GET",
    `/agent_jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.pending_approval&select=id,agency_id,kind,user_id,rep_id,payload_hash`,
  );
  if (!lookup.ok) return reply(500, { error: "lookup failed" });
  const job = Array.isArray(lookup.data) ? lookup.data[0] : null;
  if (!job) return reply(404, { error: "no pending job with that id" });

  const isSuper = caller.role === "super_admin";
  const sameAgency = String(caller.agency_id) === String(job.agency_id);

  // Authority check.
  if (!isSuper) {
    if (!sameAgency) {
      await writeAgentAudit({ agency_id: job.agency_id, user_id: caller.user_id, rep_id: caller.rep_id, job_id: job.id, kind: job.kind, payload_hash: job.payload_hash, ring: "approval", decision: "deny", reason: "cross-agency approval blocked" });
      return reply(403, { error: "cannot approve a job on a different agency" });
    }
    const ra = await svc("GET", `/role_actions?role=eq.${encodeURIComponent(caller.role || "rep")}&kind=eq.${encodeURIComponent(job.kind)}&select=allow`);
    const row = ra.ok && Array.isArray(ra.data) ? ra.data[0] : null;
    if (!row || !row.allow) {
      await writeAgentAudit({ agency_id: job.agency_id, user_id: caller.user_id, rep_id: caller.rep_id, job_id: job.id, kind: job.kind, payload_hash: job.payload_hash, ring: "approval", decision: "deny", reason: `role ${caller.role} cannot approve ${job.kind}` });
      return reply(403, { error: `role ${caller.role} cannot approve ${job.kind}` });
    }
  }

  const now = new Date().toISOString();
  const patch = decision === "approve"
    ? { status: "queued",  approved_by: caller.user_id, approved_at: now }
    : { status: "denied",  approved_by: caller.user_id, approved_at: now, denied_reason: reason };

  const r = await svc(
    "PATCH",
    `/agent_jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.pending_approval&select=id,status`,
    patch,
    { "prefer": "return=representation" },
  );
  if (!r.ok) return reply(500, { error: "approval write failed", detail: r.data });
  const updated = Array.isArray(r.data) ? r.data[0] : null;
  if (!updated) return reply(409, { error: "job state changed concurrently" });

  await writeAgentAudit({
    agency_id:    job.agency_id,
    user_id:      caller.user_id,
    rep_id:       caller.rep_id,
    job_id:       job.id,
    kind:         job.kind,
    payload_hash: job.payload_hash,
    ring:         "approval",
    decision:     decision === "approve" ? "approve" : "deny",
    reason,
    metadata:     { decided_by_role: caller.role, super_admin: isSuper },
  });

  return reply(200, { ok: true, status: updated.status });
}
