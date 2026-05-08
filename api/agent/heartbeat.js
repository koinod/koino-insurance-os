// POST /api/agent/heartbeat — agent posts every 60s. Updates last_seen_at
// and version/status. Authenticated by x-agent-token bearer.
import { SUPA_URL, SERVICE, cors, loadInstallByToken, readAgentToken } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  const patch = {
    last_seen_at: new Date().toISOString(),
    version: body.version || undefined,
    status: body.status === "degraded" ? "degraded" : "active",
  };
  Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);

  const r = await fetch(`${SUPA_URL}/rest/v1/rba_installs?device_id=eq.${inst.device_id}`, {
    method: "PATCH",
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
      "prefer": "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) return new Response(JSON.stringify({ error: "heartbeat write failed" }), { status: 500, headers: cors() });

  return new Response(JSON.stringify({ ok: true, device_id: inst.device_id, role: inst.role }), { status: 200, headers: cors() });
}
