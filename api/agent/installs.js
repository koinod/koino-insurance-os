// GET /api/agent/installs — list visible installs for the current viewer.
// RLS does the filtering: rep sees own; manager+ sees agency mates;
// super_admin sees all.
import { SUPA_URL, SERVICE, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  const r = await fetch(`${SUPA_URL}/rest/v1/rba_installs?select=device_id,user_id,agency_id,role,hostname,os,version,models_local,status,installed_at,last_seen_at&order=installed_at.desc`, {
    headers: { "apikey": SERVICE, "authorization": `Bearer ${jwt}` }
  });
  if (!r.ok) return new Response(JSON.stringify({ error: "load failed" }), { status: r.status, headers: cors() });
  const rows = await r.json();
  return new Response(JSON.stringify({ installs: Array.isArray(rows) ? rows : [] }), { status: 200, headers: cors() });
}
