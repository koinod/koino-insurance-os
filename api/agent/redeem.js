// POST /api/agent/redeem — exchange a one-shot install token for a long-lived
// agent_token + device_id. Called by the install.sh script. Anonymous; the token
// itself is the credential.
import { rpc, cors } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }
  if (typeof body.token !== "string" || body.token.length === 0 || body.token.length > 256) {
    return new Response(JSON.stringify({ error: "token must be a non-empty string ≤ 256 chars" }), { status: 400, headers: cors() });
  }
  for (const k of ["hostname","os","cpu","version"]) {
    if (body[k] != null && (typeof body[k] !== "string" || body[k].length > 200)) {
      return new Response(JSON.stringify({ error: `${k} must be a string ≤ 200 chars` }), { status: 400, headers: cors() });
    }
  }
  if (body.ram_gb != null && (typeof body.ram_gb !== "number" || !Number.isFinite(Number(body.ram_gb)))) {
    return new Response(JSON.stringify({ error: "ram_gb must be a number" }), { status: 400, headers: cors() });
  }
  if (body.models != null && !Array.isArray(body.models)) {
    return new Response(JSON.stringify({ error: "models must be an array" }), { status: 400, headers: cors() });
  }

  const r = await rpc("rba_redeem_install_token", {
    p_token: body.token,
    p_hostname: body.hostname || null,
    p_os: body.os || null,
    p_cpu: body.cpu || null,
    p_ram_gb: body.ram_gb ? Number(body.ram_gb) : null,
    p_version: body.version || null,
    p_models: Array.isArray(body.models) ? body.models : [],
  }, null);

  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "redeem failed" }), { status: r.status, headers: cors() });
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return new Response(JSON.stringify(row), { status: 200, headers: cors() });
}
