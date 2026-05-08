// POST /api/agent/install-token — issue a 5-min one-shot install token bound
// to the signed-in user's highest-priority membership. Returns { token, expires_at }.
import { rpc, cors, readUserJwt } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  const role = body.role || null;

  const r = await rpc("rba_issue_install_token", { p_role: role }, jwt);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "issue failed" }), { status: r.status, headers: cors() });
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return new Response(JSON.stringify(row), { status: 200, headers: cors() });
}
