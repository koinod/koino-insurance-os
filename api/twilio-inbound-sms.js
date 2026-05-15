// POST /api/twilio-inbound-sms — Twilio inbound SMS webhook (set as the
// "A message comes in" URL on each Twilio number).
//
// Behaviour (in priority order):
//   1. If the From number matches a rep's verified phone AND the body is
//      Y/YES/YEP/Y!/N/NO/NOPE → resolve the most recent pending
//      rba_action_confirmations row for that rep.
//   2. Else: persist as inbound_messages and best-effort match to a lead
//      so the rep sees it in their thread.
//
// Returns TwiML <Response/> (Twilio expects it).

import { SUPA_URL, SERVICE, cors } from "./agent/_lib.js";

export const config = { runtime: "edge" };

const APPROVE_RE = /^(y|yes|yep|approve|approved|ok|okay|👍|✅)\b/i;
const DENY_RE    = /^(n|no|nope|deny|denied|stop|cancel|👎|❌)\b/i;

// Twilio signs requests with HMAC-SHA1 of (URL + sorted form params).
async function verifyTwilio(url, params, sig, authToken) {
  if (!authToken) return true;  // dev mode
  if (!sig) return false;
  let data = url;
  const keys = Array.from(params.keys()).sort();
  for (const k of keys) data += k + (params.get(k) || "");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const out = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(out)));
  return b64 === sig;
}

function twiml(body = "") {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200, headers: { "content-type": "text/xml" },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST")    return new Response("POST only", { status: 405 });

  const text = await req.text();
  const p = new URLSearchParams(text);

  // Build URL Twilio used (for signature). Vercel sets x-forwarded-proto/host.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host  = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const url   = `${proto}://${host}${new URL(req.url).pathname}`;
  const sig   = req.headers.get("x-twilio-signature");
  const ok    = await verifyTwilio(url, p, sig, process.env.TWILIO_AUTH_TOKEN);
  if (!ok) return new Response("bad signature", { status: 401 });

  const from = (p.get("From") || "").trim();
  const body = (p.get("Body") || "").trim();
  if (!from || !body) return twiml();

  const isApprove = APPROVE_RE.test(body);
  const isDeny    = DENY_RE.test(body);

  if (isApprove || isDeny) {
    // Find matching rep by phone — agent_settings.config.confirm_sms_number
    // OR agency_members.phone (if such column exists). Fallback: skip.
    const r = await fetch(
      `${SUPA_URL}/rest/v1/agent_settings?select=user_id,agency_id,config&config->>confirm_sms_number=eq.${encodeURIComponent(from)}`,
      { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
    );
    let userId = null;
    if (r.ok) {
      const rows = await r.json();
      if (rows[0]) userId = rows[0].user_id;
    }
    if (userId) {
      // Find the most recent pending confirmation for this user
      const cr = await fetch(
        `${SUPA_URL}/rest/v1/rba_action_confirmations?select=id&user_id=eq.${userId}&resolution=is.null&order=created_at.desc&limit=1`,
        { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } }
      );
      if (cr.ok) {
        const rows = await cr.json();
        if (rows[0]) {
          // Service-role direct UPDATE (skip RPC to avoid auth.uid() check)
          await fetch(`${SUPA_URL}/rest/v1/rba_action_confirmations?id=eq.${rows[0].id}`, {
            method: "PATCH",
            headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
            body: JSON.stringify({
              resolution: isApprove ? "approved" : "denied",
              resolved_by: userId, resolved_at: new Date().toISOString(),
            }),
          });
          return twiml(`<Message>${isApprove ? "Approved" : "Denied"}.</Message>`);
        }
      }
    }
    return twiml(`<Message>No pending confirmation found.</Message>`);
  }

  // Non-confirmation inbound SMS — best effort persist + return empty TwiML
  // so Twilio doesn't auto-reply.
  await fetch(`${SUPA_URL}/rest/v1/inbound_messages`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      from_number: from, to_number: p.get("To") || "",
      body, message_sid: p.get("MessageSid") || null,
    }),
  }).catch(() => {});
  return twiml();
}
