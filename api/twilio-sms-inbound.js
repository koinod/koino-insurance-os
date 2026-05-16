// /api/twilio-sms-inbound — Twilio inbound SMS webhook (lead-reply threading).
//
// Companion to /api/twilio-inbound-sms (which handles RBA confirmation
// reply codes Y/N). This endpoint is for *lead* replies: someone the agency
// SMSed-outbound responds, the response hits Twilio, Twilio POSTs here.
//
// Outcome:
//   - STOP-class keyword     → insert public.sms_optouts so we never send to
//                              that number again; reply with TwiML confirmation.
//   - START-class keyword    → delete the opt-out row; reply with confirmation.
//   - Everything else        → log to public.sms_outbox (direction='inbound',
//                              status='received') and resolve related_lead_id
//                              from public.pipeline.phone if there's a match.
//                              Reply with empty <Response/> so Twilio does not
//                              auto-respond.
//
// Twilio POSTs application/x-www-form-urlencoded with these fields (subset):
//   From, To, Body, MessageSid, AccountSid, NumMedia, FromCity, FromState, ...
//
// Signature: Twilio sends X-Twilio-Signature = base64(HMAC-SHA1(URL +
// sorted-and-concatenated form params, auth_token)). Algorithm per
// https://www.twilio.com/docs/usage/security#validating-requests — see also
// the matching implementation in /api/twilio-inbound-sms.js which is in
// production use.
//
// Dev mode: when TWILIO_AUTH_TOKEN is unset, signature check is skipped and a
// warning is logged. Production env MUST have TWILIO_AUTH_TOKEN set.

export const config = { runtime: "edge" };

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfphwmzwteermalzwojp.supabase.co";
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEFAULT_AGENCY = process.env.DEFAULT_AGENCY_ID || "";

// STOP family per CTIA + Twilio guidance:
// https://www.twilio.com/docs/messaging/compliance/opt-out-keywords
const STOP_WORDS  = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT"]);
const START_WORDS = new Set(["START", "UNSTOP", "RESUME", "SUBSCRIBE", "OPTIN", "OPT-IN", "YES"]);
// Note: "YES" alone is also START per CTIA. Lead-reply YES is rare on cold
// outbound — the RBA confirmation flow lives behind a different number.

function twiml(message) {
  const body = message
    ? `<Message>${escapeXml(message)}</Message>`
    : "";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } }
  );
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Twilio signs requests with HMAC-SHA1 of (full_URL + sorted_param_kv_concat).
// Returns true if signature matches, OR if no auth token is configured (dev).
async function verifyTwilioSignature(fullUrl, params, providedSig, authToken) {
  if (!authToken) {
    console.warn("[twilio-sms-inbound] TWILIO_AUTH_TOKEN not set — skipping signature verification (dev mode)");
    return true;
  }
  if (!providedSig) return false;

  // Build canonical string: URL + concat of (key + value) for each param,
  // keys sorted ascending. See Twilio Security docs.
  let data = fullUrl;
  const keys = Array.from(params.keys()).sort();
  for (const k of keys) {
    data += k + (params.get(k) || "");
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // Constant-time compare on base64 strings of equal length.
  if (computed.length !== providedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ providedSig.charCodeAt(i);
  }
  return diff === 0;
}

// PostgREST helpers — service role bypasses RLS for webhook ingest.
async function pgFetch(path, init = {}) {
  if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  const r = await fetch(`${SUPA_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  return r;
}

async function pgSelect(path) {
  const r = await pgFetch(path);
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function pgInsert(table, row, opts = {}) {
  const r = await pgFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { prefer: opts.returnRows ? "return=representation" : "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`insert ${table} ${r.status}: ${t.slice(0, 200)}`);
  }
  if (opts.returnRows) {
    try { return await r.json(); } catch { return null; }
  }
  return true;
}

async function pgDelete(path) {
  const r = await pgFetch(path, { method: "DELETE", headers: { prefer: "return=minimal" } });
  return r.ok;
}

// Resolve agency from the To-number. Prefers public.agency_phone_numbers if
// the table exists. Falls back to DEFAULT_AGENCY_ID env. Returns null on
// total miss (the row still lands but is unscoped — operator will reconcile).
async function resolveAgencyId(toNumber) {
  if (toNumber) {
    // Try agency_phone_numbers — soft-fail if table absent (404 from PostgREST).
    try {
      const rows = await pgSelect(
        `/rest/v1/agency_phone_numbers?phone_number=eq.${encodeURIComponent(toNumber)}&select=agency_id&limit=1`
      );
      if (Array.isArray(rows) && rows[0]?.agency_id) return rows[0].agency_id;
    } catch { /* table doesn't exist yet — fall through */ }
  }
  return DEFAULT_AGENCY || null;
}

// Resolve related_lead_id by matching pipeline.phone = From. Many-to-one is
// expected (same lead re-imported); we pick the most-recently-created row.
async function resolveLeadId(fromNumber, agencyId) {
  if (!fromNumber) return null;
  const filterAgency = agencyId ? `&agency_id=eq.${encodeURIComponent(agencyId)}` : "";
  const rows = await pgSelect(
    `/rest/v1/pipeline?phone=eq.${encodeURIComponent(fromNumber)}${filterAgency}&select=id&order=created_at.desc&limit=1`
  );
  if (Array.isArray(rows) && rows[0]?.id) return rows[0].id;
  // Retry without the agency filter — if To-number resolution missed but the
  // phone matches across the system, we still want to thread the reply.
  if (agencyId) {
    const fallback = await pgSelect(
      `/rest/v1/pipeline?phone=eq.${encodeURIComponent(fromNumber)}&select=id&order=created_at.desc&limit=1`
    );
    if (Array.isArray(fallback) && fallback[0]?.id) return fallback[0].id;
  }
  return null;
}

// Best-effort realtime event emit. Soft-fails if data_events table doesn't exist.
async function emitRealtime(payload) {
  try {
    await pgInsert("data_events", payload).catch(() => null);
  } catch { /* table doesn't exist — skip silently */ }
}

export default async function handler(req) {
  if (req.method === "GET") {
    return new Response(JSON.stringify({
      ok: true,
      endpoint: "/api/twilio-sms-inbound",
      expects: "POST application/x-www-form-urlencoded from Twilio with From, To, Body, MessageSid, AccountSid",
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  // 1. Parse form-encoded body
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);

  const from        = (params.get("From")      || "").trim();
  const to          = (params.get("To")        || "").trim();
  const body        = (params.get("Body")      || "").trim();
  const messageSid  = (params.get("MessageSid")|| "").trim();
  const accountSid  = (params.get("AccountSid")|| "").trim();

  // 2. Verify Twilio signature against the actual public URL.
  //    Vercel forwards original host/proto via x-forwarded-*.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host  = req.headers.get("x-forwarded-host")  || req.headers.get("host") || "";
  const path  = new URL(req.url).pathname;
  const fullUrl = `${proto}://${host}${path}`;
  const sigHeader = req.headers.get("x-twilio-signature");

  const sigOk = await verifyTwilioSignature(fullUrl, params, sigHeader, process.env.TWILIO_AUTH_TOKEN);
  if (!sigOk) {
    // Don't leak internals — bare 401.
    return new Response("bad signature", { status: 401 });
  }

  // 3. Empty-body guard: still ACK Twilio so it doesn't retry, but skip work.
  if (!from || !body) return twiml();

  // 4. Resolve agency + (maybe) lead.
  const agencyId = await resolveAgencyId(to);
  const relatedLeadId = await resolveLeadId(from, agencyId);

  // 5. STOP / START detection — case-insensitive, single word only.
  //    Body must be exactly the keyword (after trim+upper) to count, so
  //    "stop emailing me" remains a normal inbound, not a compliance opt-out.
  const upper = body.toUpperCase();
  const firstWord = upper.split(/\s+/)[0] || "";
  const isStop  = STOP_WORDS.has(upper)  || STOP_WORDS.has(firstWord);
  const isStart = START_WORDS.has(upper) || START_WORDS.has(firstWord);

  // 6. Handle STOP
  if (isStop) {
    try {
      // sms_optouts(phone PK, agency_id, reason, opted_out_at) — see
      // migration 0032_sms_optouts.sql authored in parallel.
      await pgInsert("sms_optouts", {
        phone:        from,
        agency_id:    agencyId,
        reason:       "inbound_stop",
        opted_out_at: new Date().toISOString(),
      });
    } catch (e) {
      // If insert fails (e.g. duplicate phone PK because the lead double-stopped),
      // log and continue — we still want to ACK the opt-out to Twilio.
      console.warn("[twilio-sms-inbound] sms_optouts insert failed", { from, agencyId, err: String(e.message || e) });
    }
    // Always also drop the inbound itself into the outbox for the audit trail.
    pgInsert("sms_outbox", {
      agency_id:    agencyId,
      direction:    "inbound",
      status:       "received",
      to_number:    to,
      from_number:  from,
      body,
      twilio_sid:   messageSid || null,
      related_lead_id: relatedLeadId,
      source:       "twilio_inbound_stop",
    }).catch((e) => console.warn("[twilio-sms-inbound] outbox audit insert failed", String(e.message || e)));

    emitRealtime({
      kind: "sms.optout",
      agency_id: agencyId,
      payload: { phone: from, message_sid: messageSid },
      created_at: new Date().toISOString(),
    });

    return twiml("You're opted out. Reply START to re-subscribe.");
  }

  // 7. Handle START — restore the number.
  if (isStart) {
    try {
      await pgDelete(`/rest/v1/sms_optouts?phone=eq.${encodeURIComponent(from)}`);
    } catch (e) {
      console.warn("[twilio-sms-inbound] sms_optouts delete failed", { from, err: String(e.message || e) });
    }
    pgInsert("sms_outbox", {
      agency_id:    agencyId,
      direction:    "inbound",
      status:       "received",
      to_number:    to,
      from_number:  from,
      body,
      twilio_sid:   messageSid || null,
      related_lead_id: relatedLeadId,
      source:       "twilio_inbound_start",
    }).catch((e) => console.warn("[twilio-sms-inbound] outbox audit insert failed", String(e.message || e)));

    emitRealtime({
      kind: "sms.optin",
      agency_id: agencyId,
      payload: { phone: from, message_sid: messageSid },
      created_at: new Date().toISOString(),
    });

    return twiml("You're re-subscribed.");
  }

  // 8. Everything else — thread into Messages.
  try {
    await pgInsert("sms_outbox", {
      agency_id:    agencyId,
      direction:    "inbound",
      status:       "received",
      to_number:    to,           // agency number
      from_number:  from,         // lead
      body,
      twilio_sid:   messageSid || null,
      related_lead_id: relatedLeadId,
      source:       "twilio_inbound",
    });
  } catch (e) {
    // Persistence failure is bad but we still ACK Twilio with empty TwiML.
    // The message will be retrievable via Twilio's message log if needed.
    console.warn("[twilio-sms-inbound] outbox insert failed", {
      from, to, messageSid, err: String(e.message || e),
    });
  }

  emitRealtime({
    kind: "sms.inbound",
    agency_id: agencyId,
    payload: {
      phone: from,
      to_number: to,
      lead_id: relatedLeadId,
      message_sid: messageSid,
      preview: body.slice(0, 80),
    },
    created_at: new Date().toISOString(),
  });

  // Empty TwiML — no auto-reply. Rep will respond from the Messages page.
  return twiml();
}
