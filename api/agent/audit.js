// POST /api/agent/audit — agent logs a tool call. Bearer = x-agent-token.
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
  if (!body.tool || !body.result) return new Response(JSON.stringify({ error: "tool + result required" }), { status: 400, headers: cors() });

  const r = await fetch(`${SUPA_URL}/rest/v1/rba_audit`, {
    method: "POST",
    headers: {
      "apikey": SERVICE,
      "authorization": `Bearer ${SERVICE}`,
      "content-type": "application/json",
      "prefer": "return=minimal",
    },
    body: JSON.stringify({
      device_id: inst.device_id,
      agency_id: inst.agency_id,
      user_id: inst.user_id,
      tool: String(body.tool).slice(0, 200),
      args_hash: body.args_hash ? String(body.args_hash).slice(0, 128) : null,
      result: ["ok","denied","error"].includes(body.result) ? body.result : "error",
      detail: body.detail ? String(body.detail).slice(0, 1000) : null,
    }),
  });
  if (!r.ok) return new Response(JSON.stringify({ error: "audit write failed" }), { status: 500, headers: cors() });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
}
