// POST /api/agent/command-claim — agent atomically claims the next queued
// command for its device. Bearer = x-agent-token. Returns { command: {...} }
// or { command: null } when queue is empty.
import { rpc, cors, loadInstallByToken, readAgentToken, SERVICE } from "./_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  // service-role RPC because rba_claim_command does FOR UPDATE SKIP LOCKED
  // and we don't want the agent's bearer to be a DB role.
  const r = await rpc("rba_claim_command", { p_device_id: inst.device_id }, /* jwt */ SERVICE);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "claim failed" }), { status: r.status, headers: cors() });

  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  return new Response(JSON.stringify({ command: row }), { status: 200, headers: cors() });
}
