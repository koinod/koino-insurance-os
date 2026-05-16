// POST /api/agent/revoke { device_id } — owner+ revokes an install. The
// agent on its next heartbeat sees 401 and self-wipes.
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

  const r = await rpc("rba_revoke_install", { p_device_id: body.device_id }, jwt);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "revoke failed" }), { status: r.status, headers: cors() });
  return new Response(JSON.stringify({ ok: !!r.data }), { status: 200, headers: cors() });
}
