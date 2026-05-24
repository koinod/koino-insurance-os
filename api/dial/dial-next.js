// POST /api/dial/dial-next/:id — proxy to worker /session/:id/dial-next.

import { cors, readUserJwt } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: cors() });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const id = body.sessionId;
  if (!id) return new Response(JSON.stringify({ error: "missing_sessionId" }), { status: 400, headers: cors() });

  const workerUrl = process.env.POWER_DIALER_URL;
  if (!workerUrl) return new Response(JSON.stringify({ error: "power_dialer_unconfigured" }), { status: 503, headers: cors() });

  const r = await fetch(`${workerUrl}/session/${id}/dial-next`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.POWER_DIALER_SECRET || ""}` },
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { ...cors(), "content-type": r.headers.get("content-type") || "application/json" },
  });
}
