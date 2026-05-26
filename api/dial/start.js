// POST /api/dial/start — proxy to the power-dialer worker's /session/start.
//
// The worker URL + shared secret never reach the browser; this edge function
// reads them from server env and forwards the request.

import { cors, readUserJwt, loadCallerFromJwt } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return json(401, { error: "not_authenticated" });
  const caller = await loadCallerFromJwt(jwt);
  if (!caller?.agency_id || !caller?.rep_id) return json(403, { error: "no_rep_context" });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  body = { ...body, agencyId: caller.agency_id, repId: caller.rep_id };

  const workerUrl = process.env.POWER_DIALER_URL;
  if (!workerUrl) return json(503, { error: "power_dialer_unconfigured", message: "Set POWER_DIALER_URL in Vercel env" });

  const r = await fetch(`${workerUrl}/session/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.POWER_DIALER_SECRET || ""}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { ...cors(), "content-type": r.headers.get("content-type") || "application/json" },
  });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), "content-type": "application/json" } });
}
