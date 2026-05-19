// GET  /api/agent/agency-capabilities — list the calling agency's capability matrix
// POST /api/agent/agency-capabilities       — same response (alias for SDK convenience)
//
// Caller: authenticated web app user. Always returns the caller's own agency's
// rows; super-admin can additionally pass ?agency_id=<uuid> to query any agency.
//
// Returns: { agency_id, capabilities: [{kind, enabled, max_per_day, notes, enabled_at}] }
//
// NOTE: distinct from /api/agent/capabilities which serves the LOCAL agent's
// per-role tool ledger. This endpoint serves the agency-level enqueue gates.
import { SUPA_URL, SERVICE, cors, readUserJwt, loadCallerFromJwt } from "./_lib.js";

export const config = { runtime: "edge" };

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET" && req.method !== "POST") return reply(405, { error: "GET or POST only" });
  if (!SERVICE) return reply(500, { error: "server misconfigured" });

  const jwt = readUserJwt(req);
  const caller = await loadCallerFromJwt(jwt);
  if (!caller) return reply(401, { error: "unauthenticated" });

  const url = new URL(req.url);
  const requested = url.searchParams.get("agency_id");
  let agencyId = caller.agency_id;
  if (requested && requested !== caller.agency_id) {
    if (caller.role !== "super_admin") return reply(403, { error: "cross-agency read requires super_admin" });
    agencyId = requested;
  }

  const r = await fetch(
    `${SUPA_URL}/rest/v1/agency_capabilities?agency_id=eq.${encodeURIComponent(agencyId)}&select=kind,enabled,max_per_day,notes,enabled_by,enabled_at&order=kind.asc`,
    { headers: { "apikey": SERVICE, "authorization": `Bearer ${SERVICE}` } },
  );
  if (!r.ok) return reply(500, { error: "lookup failed" });
  const rows = await r.json();
  return reply(200, { agency_id: agencyId, capabilities: rows });
}
