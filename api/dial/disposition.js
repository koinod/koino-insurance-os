// POST /api/dial/disposition — proxy to worker /attempt/:id/disposition.
// Body: { attemptId, disposition }.

import { cors, readUserJwt } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: cors() });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { attemptId, disposition } = body;
  if (!attemptId || !disposition) return new Response(JSON.stringify({ error: "missing_attemptId_or_disposition" }), { status: 400, headers: cors() });

  const workerUrl = process.env.POWER_DIALER_URL;
  if (!workerUrl) return new Response(JSON.stringify({ error: "power_dialer_unconfigured" }), { status: 503, headers: cors() });

  const r = await fetch(`${workerUrl}/attempt/${attemptId}/disposition`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.POWER_DIALER_SECRET || ""}` },
    body: JSON.stringify({ disposition }),
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { ...cors(), "content-type": r.headers.get("content-type") || "application/json" },
  });
}
