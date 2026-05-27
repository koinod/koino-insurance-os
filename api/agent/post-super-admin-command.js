// POST /api/agent/post-super-admin-command  body: { device_id, kind, payload? }
// Bearer = user JWT — only super_admins are permitted; RPC enforces at DB level.
// Returns { command_id }.
import { rpc, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }

  if (typeof body.device_id !== "string" || body.device_id.length === 0 || body.device_id.length > 128) {
    return new Response(JSON.stringify({ error: "device_id must be a non-empty string ≤ 128 chars" }), { status: 400, headers: cors() });
  }
  if (typeof body.kind !== "string" || body.kind.length === 0 || body.kind.length > 64) {
    return new Response(JSON.stringify({ error: "kind must be a non-empty string ≤ 64 chars" }), { status: 400, headers: cors() });
  }
  if (body.payload != null && (typeof body.payload !== "object" || Array.isArray(body.payload))) {
    return new Response(JSON.stringify({ error: "payload must be an object" }), { status: 400, headers: cors() });
  }

  const r = await rpc("rba_post_super_admin_command", {
    p_device_id: body.device_id,
    p_kind: body.kind,
    p_payload: body.payload || {},
  }, jwt);

  if (!r.ok) {
    const msg = r.data?.message || r.data?.hint || "post failed";
    // DB raises these named errors; surface them as the appropriate HTTP status.
    if (msg.includes("not_super_admin")) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors() });
    if (msg.includes("device_not_found")) return new Response(JSON.stringify({ error: "device not found" }), { status: 404, headers: cors() });
    return new Response(JSON.stringify({ error: msg }), { status: r.status, headers: cors() });
  }

  return new Response(JSON.stringify({ command_id: r.data }), { status: 200, headers: cors() });
}
