// GET /api/agent/model-pref — read user's Smart/Fast preference
// POST /api/agent/model-pref { mode: "fast"|"smart" } — write it
//
// Stored on agency_members.config_json.agent_mode. Agent reads it at
// startup + every heartbeat reply. Per-message override comes from the
// chat client passing { mode } in the request, not from the DB.
import { SUPA_URL, SERVICE, cors, readUserJwt, rpc } from "./_lib.js";

export const config = { runtime: "edge" };

async function loadMember(jwt) {
  // Use the user's JWT so RLS gates this — they only see their own row
  const r = await fetch(`${SUPA_URL}/rest/v1/agency_members?select=user_id,agency_id,role,config_json&active=eq.true`, {
    headers: { "apikey": SERVICE, "authorization": `Bearer ${jwt}` }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  const member = await loadMember(jwt);
  if (!member) return new Response(JSON.stringify({ error: "no membership" }), { status: 404, headers: cors() });
  const cfg = member.config_json || {};

  if (req.method === "GET") {
    return new Response(JSON.stringify({ mode: cfg.agent_mode || "fast" }), { status: 200, headers: cors() });
  }

  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors() }); }
    if (body.mode != null && (typeof body.mode !== "string" || !["fast","smart"].includes(body.mode))) {
      return new Response(JSON.stringify({ error: "mode must be 'fast' or 'smart'" }), { status: 400, headers: cors() });
    }
    const mode = body.mode === "smart" ? "smart" : "fast";
    const next = { ...cfg, agent_mode: mode };
    const r = await fetch(`${SUPA_URL}/rest/v1/agency_members?user_id=eq.${member.user_id}&agency_id=eq.${member.agency_id}`, {
      method: "PATCH",
      headers: {
        "apikey": SERVICE,
        "authorization": `Bearer ${SERVICE}`,
        "content-type": "application/json",
        "prefer": "return=minimal",
      },
      body: JSON.stringify({ config_json: next }),
    });
    if (!r.ok) return new Response(JSON.stringify({ error: "save failed" }), { status: 500, headers: cors() });
    return new Response(JSON.stringify({ mode }), { status: 200, headers: cors() });
  }

  return new Response(JSON.stringify({ error: "GET or POST" }), { status: 405, headers: cors() });
}
