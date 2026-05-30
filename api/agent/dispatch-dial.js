// POST /api/agent/dispatch-dial
//
// Web action ("Call now" on a lead, "Auto Dial" in autodialer) → posts an
// rba_command to the user's active agent with full lead context. The agent
// then runs the right tool based on the user's agent_settings.default_dial_provider.
//
// Request body:
//   { lead_id, to_number?, provider? }
//   • lead_id required when called from a lead surface (we re-look up to_number
//     server-side so the caller can't dial an arbitrary number under a lead)
//   • to_number optional override (autodialer use case, no lead context yet)
//   • provider optional override; otherwise reads agent_settings.default_dial_provider
//
// Response 200: { command_id, device_id, kind, provider, to_number, lead_id }
// Response 4xx/5xx: { error, code, fix?: <human-readable next step> }
//
// All failure modes return a `fix` string the UI can render verbatim. Real
// developer error checking — every "this isn't going to work" condition is
// surfaced before the agent gets a doomed command.

import { SUPA_URL, SERVICE, cors, readUserJwt, rpc } from "./_lib.js";

export const config = { runtime: "edge" };

// Map default_dial_provider value → rba_command kind
const PROVIDER_TO_KIND = {
  twilio:          "twilio_dial",
  sendblue:        "sendblue_send",
  phone_link:      "phone_link_dial",
  bluetooth_phone: "phone_link_dial",   // alias — Phone Link routes via paired phone
};

// Providers that need a connector_vault row before they can dial
const PROVIDER_NEEDS_VAULT = new Set(["twilio", "sendblue"]);

function err(status, code, message, fix) {
  return new Response(JSON.stringify({ error: message, code, fix }),
    { status, headers: cors() });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  const jwt = readUserJwt(req);
  if (!jwt) return err(401, "no_auth", "not authenticated", "Sign in to Repflow.");

  let body = {};
  try { body = await req.json(); } catch {}
  const leadId = body.lead_id || null;
  if (!leadId && !body.to_number) {
    return err(400, "no_target", "lead_id or to_number required");
  }

  // --- 1. Resolve user + their highest-priority active membership ---------
  const meR = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!meR.ok) return err(401, "auth_resolve_failed", "couldn't resolve user");
  const meRows = await meR.json();
  const me = Array.isArray(meRows) ? meRows[0] : meRows;
  const userId = me?.user_id || me?.id;
  const agencyId = me?.agency_id;
  if (!userId || !agencyId) {
    return err(403, "no_membership", "no active agency membership", "Have an admin add you to an agency.");
  }

  // --- 2. Find the user's active agent install ----------------------------
  const insR = await fetch(
    `${SUPA_URL}/rest/v1/rba_installs?select=device_id,role,hostname,os,last_seen_at&user_id=eq.${userId}&status=eq.active&order=last_seen_at.desc&limit=1`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
  );
  const installs = insR.ok ? await insR.json() : [];
  const install = installs[0];
  if (!install) {
    return err(412, "no_agent", "no active agent install for this user",
      "Install the Repflow agent on your machine: Settings → Agents → Install on a machine.");
  }
  // Heartbeat staleness — soft warn, don't block (agent might be 30s late)
  const stale = install.last_seen_at && (Date.now() - new Date(install.last_seen_at).getTime() > 5 * 60_000);

  // --- 3. Resolve provider preference -------------------------------------
  let provider = body.provider || null;
  if (!provider) {
    const sR = await fetch(
      `${SUPA_URL}/rest/v1/agent_settings?select=default_dial_provider&user_id=eq.${userId}`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    const sRows = sR.ok ? await sR.json() : [];
    provider = sRows[0]?.default_dial_provider || "twilio";   // factory default
  }
  const kind = PROVIDER_TO_KIND[provider];
  if (!kind) {
    return err(400, "bad_provider", `unknown provider: ${provider}`,
      "Set Settings → Agents → Default dial provider to twilio, sendblue, or bluetooth_phone.");
  }

  // --- 4. Resolve target phone --------------------------------------------
  let toNumber = body.to_number || null;
  let lead = null;
  if (leadId) {
    const lR = await fetch(
      `${SUPA_URL}/rest/v1/pipeline?select=id,lead_name,phone,email,state,product,owner_rep_id,agency_id&id=eq.${leadId}`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    const lRows = lR.ok ? await lR.json() : [];
    lead = lRows[0];
    if (!lead) return err(404, "lead_not_found", `lead ${leadId} not found`);
    if (lead.agency_id !== agencyId) {
      return err(403, "lead_other_tenant", "lead belongs to another agency");
    }
    if (!toNumber) toNumber = lead.phone;
  }
  if (!toNumber) {
    return err(400, "no_phone", "no phone number to dial",
      leadId ? "This lead has no phone on file. Add one before dialing."
             : "Provide to_number in the request.");
  }
  // Loose E.164-ish validation (10-15 digits, optional +)
  const digits = String(toNumber).replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return err(400, "phone_invalid", `phone format unusable: ${toNumber}`);
  }
  const e164 = toNumber.startsWith("+") ? toNumber
             : digits.length === 10 ? `+1${digits}`
             : digits.length === 11 && digits.startsWith("1") ? `+${digits}`
             : `+${digits}`;

  // --- 5. Provider-specific pre-flight ------------------------------------
  if (PROVIDER_NEEDS_VAULT.has(provider)) {
    const vR = await fetch(
      `${SUPA_URL}/rest/v1/connector_vault?select=id&user_id=eq.${userId}&provider=eq.${provider}&status=eq.active&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    const vRows = vR.ok ? await vR.json() : [];
    if (vRows.length === 0) {
      return err(412, "no_connector", `${provider} connector not configured`,
        `Connect ${provider} first: Settings → Agents → ${provider} → Connect.`);
    }
  }
  // Phone Link / bluetooth: no vault, but flag if OS isn't Windows
  if ((provider === "phone_link" || provider === "bluetooth_phone") &&
      install.os && !/^win/i.test(install.os)) {
    return err(412, "phone_link_unsupported_os",
      `Phone Link only works on Windows; your agent is on ${install.os}`,
      "Switch default dial provider to twilio for this device.");
  }

  // --- 6. Build payload tailored to the lead ------------------------------
  const dialCount = Math.max(1, Math.min(5, parseInt(body.dial_count, 10) || 1));
  const dialInterval = Math.max(5, Math.min(120, parseInt(body.dial_interval_seconds, 10) || 15));
  const payload = {
    to_number: e164,
    auto_dial: true,                      // dispatched from web = pre-confirmed by the click
    lead_id: leadId || null,
    lead_context: lead ? {
      name: lead.lead_name,
      state: lead.state,
      product: lead.product,
      email: lead.email,
    } : null,
    dial_count: dialCount,
    dial_interval_seconds: dialInterval,
    monitor: !!body.monitor,   // power-dialer: agent watches call outcome
  };
  // Phone Link uses UIA selectors learned via phone_link_inspect — auto
  // method tries UIA first, falls back to sendinput.
  if (provider === "phone_link" || provider === "bluetooth_phone") {
    payload.method = body.method || "auto";
  }

  // --- 7. Insert the command directly (service role bypasses RPC auth) ----
  const insCmdR = await fetch(`${SUPA_URL}/rest/v1/rba_commands?select=id`, {
    method: "POST",
    headers: {
      apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json", prefer: "return=representation",
    },
    body: JSON.stringify({
      device_id: install.device_id,
      agency_id: agencyId,
      posted_by: userId,
      kind,
      payload,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }),
  });
  if (!insCmdR.ok) {
    const detail = await insCmdR.text();
    return err(500, "command_insert_failed", "couldn't queue command", detail.slice(0, 300));
  }
  const cmd = (await insCmdR.json())[0];

  return new Response(JSON.stringify({
    command_id: cmd.id,
    device_id: install.device_id,
    kind,
    provider,
    to_number: e164,
    lead_id: leadId,
    agent_warning: stale ? "agent heartbeat is stale (>5min); command queued but may not execute promptly" : null,
  }), { status: 200, headers: { ...cors(), "cache-control": "no-store" } });
}
