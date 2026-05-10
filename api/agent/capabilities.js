// GET /api/agent/capabilities — agent fetches its tool ledger at startup
// and every hour. Server is the source of truth so revoking a tool from
// a role takes effect on the next refresh without redeploying agents.
import { CAPABILITIES, cors, loadInstallByToken, readAgentToken } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  const caps = CAPABILITIES[inst.role] || CAPABILITIES.rep;
  return new Response(JSON.stringify({
    role: inst.role,
    agency_id: inst.agency_id,
    device_id: inst.device_id,
    capabilities: caps,
    issued_at: new Date().toISOString(),
    refresh_after_seconds: 3600,
  }), { status: 200, headers: cors() });
}
