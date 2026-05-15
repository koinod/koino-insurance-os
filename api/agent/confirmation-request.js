// POST /api/agent/confirmation-request — agent posts a high-risk action
// awaiting human OK. Body: { action, description, args_redacted, channel,
// command_id? }. Bearer = x-agent-token. Returns { confirmation_id }.
//
// The actual delivery (web modal / OS push / SMS) is handled by separate
// workers that subscribe to rba_action_confirmations realtime.
import { rpc, cors, loadInstallByToken, readAgentToken, SERVICE } from "./_lib.js";

export const config = { runtime: "edge" };

const ALLOWED_CHANNELS = new Set(["web_modal","os_push","sms","any"]);
const ALLOWED_ACTIONS  = new Set([
  "send_real_sms","send_real_email","charge_card","delete_policy",
  "bulk_action_ge_10","switch_into_agency",
]);

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const token = readAgentToken(req);
  const inst = await loadInstallByToken(token);
  if (!inst) return new Response(JSON.stringify({ error: "invalid agent token" }), { status: 401, headers: cors() });

  let body = {};
  try { body = await req.json(); } catch {}
  if (!body.action || !body.description) {
    return new Response(JSON.stringify({ error: "action + description required" }), { status: 400, headers: cors() });
  }
  if (!ALLOWED_ACTIONS.has(body.action)) {
    return new Response(JSON.stringify({ error: `action not allowed: ${body.action}` }), { status: 400, headers: cors() });
  }
  const channel = ALLOWED_CHANNELS.has(body.channel) ? body.channel : "any";

  const r = await rpc("rba_request_confirmation", {
    p_device_id: inst.device_id,
    p_command_id: body.command_id || null,
    p_action: body.action,
    p_description: String(body.description).slice(0, 500),
    p_args_redacted: body.args_redacted || {},
    p_channel: channel,
  }, SERVICE);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "request failed" }), { status: r.status, headers: cors() });

  return new Response(JSON.stringify({ confirmation_id: r.data }), { status: 200, headers: cors() });
}
