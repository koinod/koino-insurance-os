// /api/twilio-sms — outbound SMS via Twilio Programmable Messaging.
// Pattern matches twilio-twiml: graceful 503 with structured body when env
// vars aren't set, so the UI shows a clear setup path instead of breaking.
//
// Required env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CALLER_ID
// (TWILIO_CALLER_ID is the same number used for outbound voice; works for SMS
// once the number is provisioned for messaging in the Twilio console.)

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const SID    = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN  = process.env.TWILIO_AUTH_TOKEN;
  const FROM   = process.env.TWILIO_CALLER_ID;
  const missing = [];
  if (!SID)   missing.push("TWILIO_ACCOUNT_SID");
  if (!TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!FROM)  missing.push("TWILIO_CALLER_ID");
  if (missing.length) {
    return new Response(JSON.stringify({
      error: "twilio_sms_not_configured",
      detail: "Set the missing env vars in Vercel project settings, then redeploy.",
      missing,
    }), { status: 503, headers: { "content-type": "application/json" } });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const to   = String(body.to || "").trim();
  const text = String(body.body || body.text || "").trim();
  if (!to || !text) {
    return new Response(JSON.stringify({ error: "missing_to_or_body" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  if (text.length > 1600) {
    return new Response(JSON.stringify({ error: "body_too_long", max: 1600 }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  // Twilio messaging REST API
  const form = new URLSearchParams();
  form.set("To",   to);
  form.set("From", FROM);
  form.set("Body", text);

  const auth = btoa(`${SID}:${TOKEN}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return new Response(JSON.stringify({
      error: "twilio_error",
      twilio_code: j.code,
      twilio_message: j.message,
    }), { status: r.status, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({
    ok: true,
    sid: j.sid,
    status: j.status,
    to: j.to,
    date_created: j.date_created,
  }), { headers: { "content-type": "application/json" } });
}
