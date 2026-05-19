// POST /api/agent/commands/enqueue
//
// Sidebar shortcut: writes a row to public.rba_commands so the live agent
// (which polls /api/agent/command-claim → rba_commands) can pick it up.
// public.agent_jobs is the newer-architecture target but is not yet wired
// into the agent runtime; this endpoint bridges the AI sidebar to the
// queue the agent actually polls today.
//
// Reuses Ring 1 (agency_capabilities) + Ring 2 (role_actions) from the
// /jobs/enqueue path so the same tool-kind catalog gates both queues.

import {
  SUPA_URL, SERVICE, cors,
  readUserJwt, loadCallerFromJwt, writeAgentAudit,
} from "../_lib.js";

export const config = { runtime: "edge" };

async function svc(method, path, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST")    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: cors() });
  const caller = await loadCallerFromJwt(jwt);
  if (!caller?.agency_id || !caller?.role) {
    return new Response(JSON.stringify({ error: "no agency/role for caller" }), { status: 403, headers: cors() });
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const kind = String(body.kind || "").trim();
  if (!kind) return new Response(JSON.stringify({ error: "kind required" }), { status: 400, headers: cors() });
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  const auditCommon = {
    agency_id: caller.agency_id, user_id: caller.user_id, rep_id: caller.rep_id,
    kind, payload_hash: null,
  };

  const capR = await svc("GET",
    `/agency_capabilities?agency_id=eq.${caller.agency_id}&kind=eq.${encodeURIComponent(kind)}&select=enabled,max_per_day&limit=1`);
  if (!capR.ok) return new Response(JSON.stringify({ error: "capability lookup failed", detail: String(capR.data).slice(0, 200) }), { status: 502, headers: cors() });
  const cap = (capR.data || [])[0];
  if (cap && cap.enabled === false) {
    writeAgentAudit({ ...auditCommon, ring: "capability", decision: "deny", reason: "disabled" }).catch(()=>{});
    return new Response(JSON.stringify({ denied: true, ring: "capability", reason: "kind disabled for this agency" }), { status: 200, headers: cors() });
  }

  const roleR = await svc("GET",
    `/role_actions?role=eq.${encodeURIComponent(caller.role)}&kind=eq.${encodeURIComponent(kind)}&select=allow&limit=1`);
  const allowed = (roleR.ok && Array.isArray(roleR.data) && roleR.data[0]?.allow === true);
  const isSuper = caller.role === "super_admin";
  if (!allowed && !isSuper) {
    writeAgentAudit({ ...auditCommon, ring: "role", decision: "deny", reason: `${caller.role} not allowed for ${kind}` }).catch(()=>{});
    return new Response(JSON.stringify({ denied: true, ring: "role", reason: `role '${caller.role}' not allowed for '${kind}'` }), { status: 200, headers: cors() });
  }

  const insR = await svc("GET",
    `/rba_installs?select=device_id,role&user_id=eq.${caller.user_id}&status=eq.active&order=last_seen_at.desc&limit=1`);
  const install = (insR.ok && Array.isArray(insR.data)) ? insR.data[0] : null;
  if (!install) {
    return new Response(JSON.stringify({ error: "no active install for caller", fix: "Install the Repflow agent in Settings → Devices, then retry." }), { status: 409, headers: cors() });
  }

  const ins = await svc("POST", "/rba_commands?select=id,kind,status,created_at,expires_at", {
    device_id: install.device_id,
    agency_id: caller.agency_id,
    posted_by: caller.user_id,
    kind, payload, status: "queued",
  });
  if (!ins.ok) {
    writeAgentAudit({ ...auditCommon, ring: "execute", decision: "fail", reason: "rba_commands insert failed", metadata: { upstream: ins.status } }).catch(()=>{});
    return new Response(JSON.stringify({ error: "enqueue failed", detail: String(ins.data).slice(0, 200) }), { status: 500, headers: cors() });
  }
  const cmd = ins.data?.[0] || {};
  writeAgentAudit({ ...auditCommon, ring: "execute", decision: "allow", metadata: { command_id: cmd.id, device_id: install.device_id } }).catch(()=>{});

  return new Response(JSON.stringify({
    command_id: cmd.id, device_id: install.device_id,
    kind: cmd.kind, status: cmd.status,
    created_at: cmd.created_at, expires_at: cmd.expires_at,
  }), { status: 200, headers: cors() });
}
