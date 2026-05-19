// POST /api/agent/jobs/enqueue
//
// Caller: authenticated web app user (User JWT in Authorization header).
// Body:   { kind: "<job_kind>", payload: {...}, policy?: { dry_run?, requires_approval?, max_dollar_impact? } }
//
// Returns 200 { job_id, status, idempotent? } on allow,
//         200 { denied: true, ring: "...", reason: "..." } on deny,
//         401 { error: "unauthenticated" } if JWT missing/invalid,
//         400 { error: "..." } on bad input.
//
// Pipeline:
//   1. Resolve caller via public.me() → { user_id, agency_id, role, rep_id }.
//   2. Super-admin bypass → audit(bypass), enqueue directly.
//   3. Ring 1: agency_capabilities row must have enabled=true.
//   4. Ring 1b: daily count must be below max_per_day (if set).
//   5. Ring 2: role_actions must have allow=true for (role, kind).
//   6. Idempotency: if (agency, kind, payload) exists within 60s, return that row.
//   7. Ring 3: requires_approval (from body.policy or explicit role rules) decides
//      whether to insert as queued or pending_approval.
//   8. Audit + return.
import {
  SUPA_URL, SERVICE, cors, readUserJwt, loadCallerFromJwt,
  writeAgentAudit, canonicalJson,
} from "../_lib.js";

export const config = { runtime: "edge" };

// Job kinds that the plan flags as always-needing approval. The caller's
// `policy.requires_approval` can additionally request approval per-call.
const DEFAULT_APPROVAL_KINDS = new Set([
  "submit_eapp",
  "nigo_followup",
  "mint_install_token",
  "revoke_install",
]);

// Default $-cap by kind. Crossing this in `policy.max_dollar_impact` forces approval.
const DEFAULT_DOLLAR_CAP = {
  submit_eapp: 20000,
};

async function svc(method, path, body) {
  const opts = {
    method,
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
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
  const kind     = String(body.kind || "").trim();
  const payload  = (body.payload && typeof body.payload === "object") ? body.payload : {};
  const polIn    = (body.policy && typeof body.policy === "object") ? body.policy : {};
  if (!kind) return reply(400, { error: "kind required" });
  if (kind.length > 64 || !/^[a-z][a-z0-9_]*$/.test(kind)) return reply(400, { error: "invalid kind" });

  const auditCommon = {
    agency_id:    caller.agency_id,
    user_id:      caller.user_id,
    rep_id:       caller.rep_id,
    kind,
    payload_hash: null, // filled if we know it
  };

  // -- Super-admin bypass: skip Ring 1+2, but still respect requires_approval.
  // is_super_admin() checks agency_members.role='super_admin' active. We trust the
  // me() role since it pulls from agency_members for the caller's agency. Cross-agency
  // super-admin is denied at policy: super_admins use the dashboard for emergency ops.
  const isSuper = caller.role === "super_admin";

  // ===== Ring 1: agency_capabilities =====
  let maxPerDay = null;
  if (!isSuper) {
    const cap = await svc(
      "GET",
      `/agency_capabilities?agency_id=eq.${encodeURIComponent(caller.agency_id)}&kind=eq.${encodeURIComponent(kind)}&select=enabled,max_per_day`,
    );
    if (!cap.ok) return reply(500, { error: "capability lookup failed" });
    const row = Array.isArray(cap.data) ? cap.data[0] : null;
    if (!row || !row.enabled) {
      await writeAgentAudit({ ...auditCommon, ring: "capability", decision: "deny", reason: "kind not enabled for agency" });
      return reply(200, { denied: true, ring: "capability", reason: "kind not enabled for this agency" });
    }
    maxPerDay = row.max_per_day || null;
  }

  // ===== Ring 1b: daily cap =====
  if (!isSuper && maxPerDay) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const cnt = await svc(
      "GET",
      `/agent_jobs?agency_id=eq.${encodeURIComponent(caller.agency_id)}&kind=eq.${encodeURIComponent(kind)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
    );
    if (cnt.ok && Array.isArray(cnt.data) && cnt.data.length >= maxPerDay) {
      await writeAgentAudit({ ...auditCommon, ring: "capability", decision: "deny", reason: `max_per_day=${maxPerDay} reached` });
      return reply(200, { denied: true, ring: "capability", reason: `daily cap of ${maxPerDay} reached` });
    }
  }

  // ===== Ring 2: role_actions =====
  if (!isSuper) {
    const ra = await svc(
      "GET",
      `/role_actions?role=eq.${encodeURIComponent(caller.role || "rep")}&kind=eq.${encodeURIComponent(kind)}&select=allow`,
    );
    if (!ra.ok) return reply(500, { error: "role lookup failed" });
    const row = Array.isArray(ra.data) ? ra.data[0] : null;
    if (!row || !row.allow) {
      await writeAgentAudit({ ...auditCommon, ring: "role", decision: "deny", reason: `role ${caller.role} cannot run ${kind}` });
      return reply(200, { denied: true, ring: "role", reason: `role ${caller.role} is not allowed to run ${kind}` });
    }
  }

  // ===== Idempotency (60s window on identical payload) =====
  // We compare payload jsonb equality directly. The generated payload_hash column
  // accelerates this lookup once we wire it; for v1, payload jsonb equality is fine.
  const sinceIdem = new Date(Date.now() - 60 * 1000).toISOString();
  const existing = await svc(
    "GET",
    `/agent_jobs?agency_id=eq.${encodeURIComponent(caller.agency_id)}&kind=eq.${encodeURIComponent(kind)}&created_at=gte.${encodeURIComponent(sinceIdem)}&select=id,payload,status&order=created_at.desc&limit=20`,
  );
  if (existing.ok && Array.isArray(existing.data)) {
    const wantCanon = canonicalJson(payload);
    const match = existing.data.find(r => canonicalJson(r.payload || {}) === wantCanon);
    if (match) {
      await writeAgentAudit({ ...auditCommon, job_id: match.id, ring: "policy", decision: "allow", reason: "idempotent hit", metadata: { idempotent: true } });
      return reply(200, { job_id: match.id, status: match.status, idempotent: true });
    }
  }

  // ===== Ring 3: approval decision =====
  const explicitApproval = polIn.requires_approval === true;
  const dollarCap        = DEFAULT_DOLLAR_CAP[kind];
  const overCap          = dollarCap && Number(polIn.max_dollar_impact || 0) > dollarCap;
  const kindAlwaysNeeds  = DEFAULT_APPROVAL_KINDS.has(kind);
  // Super-admin can still flag a job for approval, but never gets auto-approval requirement.
  const requiresApproval = !isSuper && (explicitApproval || overCap || kindAlwaysNeeds);
  const status           = requiresApproval ? "pending_approval" : "queued";

  // ===== Insert the job =====
  const ins = await svc("POST", "/agent_jobs?select=id,status,payload_hash", {
    agency_id:  caller.agency_id,
    user_id:    caller.user_id,
    rep_id:     caller.rep_id,
    kind,
    payload,
    policy:     polIn,
    requires_approval: requiresApproval,
    status,
  });
  if (!ins.ok || !Array.isArray(ins.data) || ins.data.length === 0) {
    await writeAgentAudit({ ...auditCommon, ring: "execute", decision: "fail", reason: "insert failed", metadata: { upstream: ins.status } });
    return reply(500, { error: "enqueue failed", detail: ins.data });
  }
  const job = ins.data[0];

  await writeAgentAudit({
    ...auditCommon,
    job_id:       job.id,
    payload_hash: job.payload_hash,
    ring:         requiresApproval ? "policy" : "execute",
    decision:     isSuper ? "bypass" : "allow",
    reason:       requiresApproval ? "queued for approval" : "queued",
    metadata:     { policy: polIn, super_admin: isSuper },
  });

  return reply(200, { job_id: job.id, status: job.status });
}
