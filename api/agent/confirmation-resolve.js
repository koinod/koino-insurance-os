// POST /api/agent/confirmation-resolve  body: { confirmation_id, resolution }
// Bearer = user JWT (the human approving/denying). resolution in
// {approved, denied}.
import { rpc, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  if (!body.confirmation_id || !["approved","denied"].includes(body.resolution)) {
    return new Response(JSON.stringify({ error: "confirmation_id + resolution(approved|denied) required" }), { status: 400, headers: cors() });
  }

  const r = await rpc("rba_resolve_confirmation", {
    p_confirmation_id: body.confirmation_id,
    p_resolution: body.resolution,
  }, jwt);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "resolve failed" }), { status: r.status, headers: cors() });
  return new Response(JSON.stringify({ ok: !!r.data }), { status: 200, headers: cors() });
}
