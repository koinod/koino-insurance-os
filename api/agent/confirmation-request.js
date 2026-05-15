// POST /api/agent/confirmation-request — agent posts a high-risk action
// awaiting human OK. Body: { action, description, args_redacted, channel,
// command_id? }. Bearer = x-agent-token. Returns { confirmation_id }.
//
// The actual delivery (web modal / OS push / SMS) is handled by separate
// workers that subscribe to rba_action_confirmations realtime.
import { rpc, cors, loadInstallByToken, readAgentToken, SERVICE, SUPA_URL } from "./_lib.js";

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

  // Resolve channel: explicit > user prefs > default 'any'.
  // High-risk actions (charge, delete, bulk) override to user's
  // `high_risk_channel` (typically SMS). Lower-stakes use
  // `confirmation_channel_default` (web modal default).
  let channel = ALLOWED_CHANNELS.has(body.channel) ? body.channel : null;
  if (!channel) {
    const r = await fetch(`${SUPA_URL || ""}/rest/v1/agent_settings?select=confirm_channel_default,high_risk_channel&user_id=eq.${inst.user_id}`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }).catch(() => null);
    let prefs = null;
    if (r && r.ok) { const rows = await r.json(); prefs = rows[0]; }
    const isHighRisk = ["send_real_sms","charge_card","delete_policy","bulk_action_ge_10","switch_into_agency"].includes(body.action);
    channel = (isHighRisk ? prefs?.high_risk_channel : prefs?.confirm_channel_default) || "any";
  }

  const r = await rpc("rba_request_confirmation", {
    p_device_id: inst.device_id,
    p_command_id: body.command_id || null,
    p_action: body.action,
    p_description: String(body.description).slice(0, 500),
    p_args_redacted: body.args_redacted || {},
    p_channel: channel,
  }, SERVICE);
  if (!r.ok) return new Response(JSON.stringify({ error: r.data?.message || "request failed" }), { status: r.status, headers: cors() });

  const confirmationId = r.data;

  // Fan-out per channel. web_modal is handled by the realtime subscriber
  // in rba-confirmations.jsx — no server work needed. SMS needs an actual
  // outbound text to the rep's phone.
  if (channel === "sms" || channel === "any") {
    fanoutSmsConfirmation({ inst, confirmationId, description: body.description }).catch(() => {});
  }
  // os_push fan-out is a follow-on (requires service worker + push subscription).

  return new Response(JSON.stringify({ confirmation_id: confirmationId, channel }), { status: 200, headers: cors() });
}

async function fanoutSmsConfirmation({ inst, confirmationId, description }) {
  // Find rep's confirm_sms_number from agent_settings.config jsonb
  const sR = await fetch(`${SUPA_URL}/rest/v1/agent_settings?select=config&user_id=eq.${inst.user_id}`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
  if (!sR.ok) return;
  const rows = await sR.json();
  const phone = rows[0]?.config?.confirm_sms_number;
  if (!phone) return;

  // Try rep's own Twilio first; fall back to platform Twilio env vars.
  let sid, tok, from;
  try {
    const cv = await fetch(
      `${SUPA_URL}/rest/v1/connector_vault?select=*&user_id=eq.${inst.user_id}&provider=eq.twilio&status=eq.active&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    if (cv.ok) {
      const v = (await cv.json())[0];
      if (v) {
        sid  = (v.account_metadata || {}).account_sid;
        tok  = v.api_key_enc || v.access_token_enc;
        from = ((v.account_metadata || {}).phone_numbers || [])[0];
      }
    }
  } catch {}
  if (!sid || !tok || !from) {
    sid  = process.env.TWILIO_ACCOUNT_SID;
    tok  = process.env.TWILIO_AUTH_TOKEN;
    from = process.env.TWILIO_CALLER_ID;
  }
  if (!sid || !tok || !from) return;

  const body = `Repflow agent: ${String(description).slice(0, 100)}\n\nReply Y to approve, N to deny.`;
  const form = new URLSearchParams({ To: phone, From: from, Body: body });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: "Basic " + btoa(`${sid}:${tok}`), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }).catch(() => {});
}
