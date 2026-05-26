// POST /api/dial/end/:id — proxy to worker /session/:id/end.

import { SUPA_URL, SERVICE, cors, readUserJwt, loadCallerFromJwt } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: cors() });
  const caller = await loadCallerFromJwt(jwt);
  if (!caller?.agency_id) return new Response(JSON.stringify({ error: "no_agency_context" }), { status: 403, headers: cors() });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const id = body.sessionId;
  if (!id) return new Response(JSON.stringify({ error: "missing_sessionId" }), { status: 400, headers: cors() });
  const allowed = await canAccessSession(id, caller);
  if (!allowed) return new Response(JSON.stringify({ error: "session_forbidden" }), { status: 403, headers: cors() });

  const workerUrl = process.env.POWER_DIALER_URL;
  if (!workerUrl) return new Response(JSON.stringify({ error: "power_dialer_unconfigured" }), { status: 503, headers: cors() });

  const r = await fetch(`${workerUrl}/session/${id}/end`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.POWER_DIALER_SECRET || ""}` },
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { ...cors(), "content-type": r.headers.get("content-type") || "application/json" },
  });
}

async function canAccessSession(id, caller) {
  if (!SERVICE) return false;
  const r = await fetch(`${SUPA_URL}/rest/v1/dial_sessions?id=eq.${encodeURIComponent(id)}&select=agency_id,rep_id&limit=1`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
  if (!r.ok) return false;
  const row = (await r.json())?.[0];
  if (!row) return false;
  if (caller.role === "super_admin") return true;
  if (row.agency_id !== caller.agency_id) return false;
  if (row.rep_id === caller.rep_id) return true;
  return ["manager", "owner", "admin", "imo_owner"].includes(caller.role);
}
