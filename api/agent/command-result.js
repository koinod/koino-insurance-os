// GET /api/agent/command-result?id=<uuid>
// Auth: user JWT. Returns the current state of an rba_command so the UI
// can poll while a dispatched action is in flight.
import { SUPA_URL, SERVICE, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }),
    { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }),
    { status: 401, headers: cors() });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "id required" }),
    { status: 400, headers: cors() });

  // Use the user's JWT so RLS scopes appropriately
  const r = await fetch(
    `${SUPA_URL}/rest/v1/rba_commands?select=id,kind,status,result,error,created_at,completed_at&id=eq.${id}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${jwt}` } }
  );
  if (!r.ok) return new Response(JSON.stringify({ error: "lookup failed" }),
    { status: r.status, headers: cors() });
  const rows = await r.json();
  return new Response(JSON.stringify({ command: rows[0] || null }),
    { status: 200, headers: { ...cors(), "cache-control": "no-store" } });
}
