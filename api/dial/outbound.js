// POST /api/dial/outbound — initiate a Twilio bridge call via REST API.
//
// Reads the caller's connector_vault for Twilio credentials (account_sid in
// account_metadata.sid, auth_token in api_key_enc, caller_id in
// account_metadata.caller_id, rep_phone in account_metadata.rep_phone).
//
// Gate pattern: any prerequisite miss returns { gate: true, message } so the
// client can show a named, actionable error instead of a silent no-op.
//
// Bridge pattern: Twilio dials the LEAD first; when they pick up, the
// /api/twilio/twiml-bridge TwiML bridges them to the rep's physical phone.
// Both legs are recorded when TWILIO_RECORD=true (default).

import { SUPA_URL, SERVICE, cors, readUserJwt } from "../agent/_lib.js";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors() });

  const jwt = readUserJwt(req);
  if (!jwt) {
    return new Response(JSON.stringify({ error: "not_authenticated", gate: false }),
      { status: 401, headers: cors() });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { phone, lead_name, lead_id, rep_phone: bodyRepPhone } = body;

  if (!phone) {
    return new Response(JSON.stringify({ error: "missing_phone", gate: false }),
      { status: 400, headers: cors() });
  }

  // ── 1. Resolve Twilio credentials. Pay-and-play model: the PLATFORM Twilio
  // account (env) dials by default so reps never set up Twilio. A per-rep
  // connector_vault row (their own number/account) is an OPTIONAL override.
  const vaultR = await fetch(
    `${SUPA_URL}/rest/v1/connector_vault?provider=eq.twilio&status=eq.active&limit=1` +
    `&select=id,api_key_enc,account_metadata`,
    { headers: { apikey: SERVICE, authorization: `Bearer ${jwt}` } }
  );
  const vaultRows = vaultR.ok ? await vaultR.json() : [];
  const twilioRow = Array.isArray(vaultRows) ? vaultRows[0] : null;

  // ── 2. Extract credentials: per-rep vault first, then platform env fallback.
  const meta = (twilioRow && twilioRow.account_metadata && typeof twilioRow.account_metadata === "object")
    ? twilioRow.account_metadata : {};
  const account_sid = meta.sid || meta.account_sid || process.env.TWILIO_ACCOUNT_SID || "";
  const caller_id   = meta.caller_id || (Array.isArray(meta.phone_numbers) && meta.phone_numbers[0]) || process.env.TWILIO_CALLER_ID || "";
  const rep_phone   = bodyRepPhone || meta.rep_phone || "";

  // Basic-auth pair for the Twilio REST call. The URL path always uses the
  // Account SID; the auth user/pass can be either Account SID + Auth Token OR
  // an API Key SID + Secret. Resolution order: per-rep vault token → platform
  // API key (prod uses this) → platform Auth Token.
  let authUser = "", authPass = "";
  if (twilioRow && twilioRow.api_key_enc) {
    authUser = account_sid;                 authPass = twilioRow.api_key_enc;
  } else if (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) {
    authUser = process.env.TWILIO_API_KEY_SID; authPass = process.env.TWILIO_API_KEY_SECRET;
  } else if (process.env.TWILIO_AUTH_TOKEN) {
    authUser = account_sid;                 authPass = process.env.TWILIO_AUTH_TOKEN;
  }

  if (!account_sid || !authPass) {
    return new Response(JSON.stringify({
      error: "twilio_not_configured",
      gate: true,
      message: "Dialing isn't set up for this workspace yet — the platform Twilio credentials are missing.",
    }), { status: 422, headers: cors() });
  }
  if (!caller_id) {
    return new Response(JSON.stringify({
      error: "twilio_no_caller_id",
      gate: true,
      message: "No outbound caller ID configured for dialing.",
    }), { status: 422, headers: cors() });
  }
  if (!rep_phone) {
    return new Response(JSON.stringify({
      error: "twilio_no_rep_phone",
      gate: true,
      message: "Add your phone number in Settings → Profile so we can connect you to the lead.",
    }), { status: 422, headers: cors() });
  }

  // ── 3. Resolve caller's agency_id and rep_id (best-effort)
  let agency_id = null;
  if (lead_id && SERVICE) {
    const lR = await fetch(
      `${SUPA_URL}/rest/v1/pipeline?id=eq.${encodeURIComponent(lead_id)}&select=agency_id&limit=1`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    if (lR.ok) {
      const lRows = await lR.json();
      agency_id = lRows?.[0]?.agency_id || null;
    }
  }

  let rep_id = null;
  try {
    const meR = await fetch(`${SUPA_URL}/rest/v1/rpc/me`, {
      method: "POST",
      headers: {
        apikey: SERVICE, authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (meR.ok) {
      const rows = await meR.json();
      rep_id = (Array.isArray(rows) ? rows[0]?.rep_id : rows?.rep_id) || null;
      if (!agency_id) agency_id = (Array.isArray(rows) ? rows[0]?.agency_id : rows?.agency_id) || null;
    }
  } catch { /* keep rep_id null */ }

  // ── 4. Build TwiML bridge URL
  const proto   = req.headers.get("x-forwarded-proto") || "https";
  const host    = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const baseUrl = `${proto}://${host}`;

  const bridgeParams = new URLSearchParams({
    rep_phone,
    caller_id,
    ...(lead_id ? { lead_id } : {}),
    ...(agency_id ? { agency_id } : {}),
    ...(rep_id ? { rep_id } : {}),
  });
  const bridgeUrl = `${baseUrl}/api/twilio/twiml-bridge?${bridgeParams}`;

  // ── 5. POST to Twilio REST API
  let recordingCallbackUrl = `${baseUrl}/api/twilio-recording`;
  const recParams = [];
  if (agency_id) recParams.push(`agency_id=${encodeURIComponent(agency_id)}`);
  if (rep_id) recParams.push(`rep_id=${encodeURIComponent(rep_id)}`);
  if (lead_id) recParams.push(`lead_id=${encodeURIComponent(lead_id)}`);
  if (recParams.length > 0) {
    recordingCallbackUrl += `?${recParams.join("&")}`;
  }

  const twilioParams = new URLSearchParams({
    To:   phone,
    From: caller_id,
    Url:  bridgeUrl,
    StatusCallback:       `${baseUrl}/api/twilio-app`,
    StatusCallbackMethod: "POST",
    // Request all state transitions so call_events stays accurate
    StatusCallbackEvent:  "initiated ringing in-progress completed busy no-answer failed canceled",
  });
  const record = (process.env.TWILIO_RECORD || "true") === "true";
  if (record) {
    twilioParams.set("Record", "true");
    twilioParams.set("RecordingStatusCallback", recordingCallbackUrl);
  }

  const twilioResp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account_sid)}/Calls.json`,
    {
      method:  "POST",
      headers: {
        authorization:  "Basic " + btoa(`${authUser}:${authPass}`),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: twilioParams.toString(),
    }
  );
  const twilioJson = await twilioResp.json().catch(() => ({}));

  if (!twilioResp.ok) {
    return new Response(JSON.stringify({
      error:   "twilio_api_error",
      gate:    false,
      message: twilioJson.message || `Twilio returned ${twilioResp.status}`,
      code:    twilioJson.code,
      status:  twilioResp.status,
    }), { status: 502, headers: cors() });
  }

  const call_sid = twilioJson.sid;

  // ── 6. Write initial call_events row (best-effort; does not block response)
  if (SERVICE) {
    await fetch(`${SUPA_URL}/rest/v1/call_events`, {
      method:  "POST",
      headers: {
        apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
        "content-type": "application/json", prefer: "return=minimal",
      },
      body: JSON.stringify({
        call_sid,
        status:       "initiated",
        direction:    "outbound-api",
        to_number:    phone,
        from_number:  caller_id,
        lead_id:      lead_id || null,
        agency_id:    agency_id || null,
        rep_id:       rep_id || null,
      }),
    }).catch(() => {});

    // Bump last_used_at on the vault row
    await fetch(
      `${SUPA_URL}/rest/v1/connector_vault?id=eq.${encodeURIComponent(twilioRow.id)}`,
      {
        method:  "PATCH",
        headers: {
          apikey: SERVICE, authorization: `Bearer ${SERVICE}`,
          "content-type": "application/json", prefer: "return=minimal",
        },
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      }
    ).catch(() => {});
  }

  return new Response(JSON.stringify({
    ok:       true,
    call_sid,
    status:   "initiated",
    to:       phone,
    from:     caller_id,
  }), { status: 200, headers: cors() });
}
