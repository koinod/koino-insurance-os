// POST /api/agent/command-complete  body: { command_id, status, result?, error? }
// Bearer = x-agent-token. Marks the command terminal.
import { rpc, cors, loadInstallByToken, readAgentToken, SERVICE } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  if (!body.command_id || !body.status) {
    return new Response(JSON.stringify({ error: "command_id + status required" }), { status: 400, headers: cors() });
  }
  if (!["succeeded","failed"].includes(body.status)) {
    return new Response(JSON.stringify({ error: "status must be succeeded|failed" }), { status: 400, headers: cors() });
  }

  const r = await rpc("rba_complete_command", {
    p_command_id: body.command_id,
    p_status: body.status,
    p_result: body.result || null,
    p_error: body.error || null,
  }, SERVICE);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "complete failed" }), { status: r.status, headers: cors() });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
}
